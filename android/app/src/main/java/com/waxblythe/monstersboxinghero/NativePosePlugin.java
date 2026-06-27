package com.waxblythe.monstersboxinghero;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.os.SystemClock;
import android.util.Log;
import android.util.Size;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.core.Delegate;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker;
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Real-time pose inference, NATIVE. CameraX feeds frames to MediaPipe Tasks Vision running
 * on the real GPU/NNAPI delegate (the WebView cannot — its WebGL is software). Only the 33
 * landmarks + the capture->result latency are sent to the web game; camera pixels never
 * cross the bridge. The web game's existing detection pipeline consumes them unchanged.
 */
@CapacitorPlugin(
        name = "NativePose",
        permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class NativePosePlugin extends Plugin {
    private static final String TAG = "NativePose";
    private static final String MODEL = "public/mediapipe/models/pose_landmarker_lite.task";

    private PoseLandmarker landmarker;
    private ExecutorService analysisExecutor;
    private ProcessCameraProvider cameraProvider;
    private PreviewView previewView;
    private String delegateName = "gpu";
    private double infEma = 0;
    private Bitmap inFlight; // the bitmap submitted to the last detectAsync (recycled next frame)

    // Startup delegate benchmark: measure REAL end-to-end latency on GPU vs CPU and keep the
    // faster (MediaPipe's "GPU" can silently run on software). A comparison decides — no magic
    // threshold; the cutoff below only skips the CPU probe when GPU is already clearly fast.
    private volatile String switchTo = null; // delegate to rebuild on the analysis thread
    private int phase = 2;                    // 0=bench GPU, 1=bench CPU, 2=run
    private final ArrayList<Double> bench = new ArrayList<>();
    private double gpuMs = Double.MAX_VALUE;

    @PluginMethod
    public void start(PluginCall call) {
        // Gate on the camera permission via Capacitor so a result is actually delivered and a
        // denial REJECTS the call (the JS side then falls back to the web/keyboard path).
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "onCamPerm");
            return;
        }
        startSession(call);
    }

    @PermissionCallback
    private void onCamPerm(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) startSession(call);
        else call.reject("camera-permission-denied");
    }

    private void startSession(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                teardown(); // idempotent: drop any prior session before re-initializing
                // Motion game = no touch input, so keep the screen awake (else it sleeps mid-fight).
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setupPreview();
                try { setupLandmarker(Delegate.GPU, "gpu"); phase = 0; } // benchmark GPU vs CPU at startup
                catch (Exception gpuErr) { Log.w(TAG, "GPU delegate failed, CPU", gpuErr); setupLandmarker(Delegate.CPU, "cpu"); phase = 2; }
                startCamera(call); // resolves/rejects the call once the camera actually binds
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                teardown();
                call.reject("start: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { teardown(); call.resolve(); });
    }

    // Full teardown, reused by stop() and by start() (so a re-start can't stack a second
    // preview/landmarker/executor). The landmarker close is posted onto the analysis thread so
    // it runs strictly AFTER any in-flight analyze(), never concurrently (no native use-after-close).
    private void teardown() {
        try { getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignored) {}
        try { if (cameraProvider != null) cameraProvider.unbindAll(); } catch (Exception ignored) {}
        final ExecutorService ex = analysisExecutor; analysisExecutor = null;
        final PoseLandmarker lm = landmarker; landmarker = null;
        final Bitmap fb = inFlight; inFlight = null;
        if (ex != null) {
            ex.execute(() -> {
                try { if (lm != null) lm.close(); } catch (Exception ignored) {}
                if (fb != null) { try { fb.recycle(); } catch (Exception ignored) {} }
            });
            ex.shutdown();
        } else {
            if (lm != null) { try { lm.close(); } catch (Exception ignored) {} }
            if (fb != null) { try { fb.recycle(); } catch (Exception ignored) {} }
        }
        removePreview();
    }

    private void setupLandmarker(Delegate delegate, String name) {
        BaseOptions baseOptions = BaseOptions.builder()
                .setModelAssetPath(MODEL)
                .setDelegate(delegate)
                .build();
        PoseLandmarker.PoseLandmarkerOptions options = PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(baseOptions)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumPoses(1)
                .setMinPoseDetectionConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setMinPosePresenceConfidence(0.5f)
                .setResultListener(this::onResult)
                .setErrorListener(e -> Log.e(TAG, "mediapipe error", e))
                .build();
        landmarker = PoseLandmarker.createFromOptions(getContext(), options);
        delegateName = name;
    }

    private void setupPreview() {
        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.TRANSPARENT);
        ViewGroup parent = (ViewGroup) webView.getParent();
        previewView = new PreviewView(getContext());
        previewView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        parent.addView(previewView, 0); // index 0 = behind the (now transparent) WebView
    }

    private void removePreview() {
        if (previewView != null && previewView.getParent() != null) {
            ((ViewGroup) previewView.getParent()).removeView(previewView);
        }
        previewView = null;
        WebView webView = getBridge().getWebView();
        if (webView != null) webView.setBackgroundColor(Color.WHITE);
    }

    private void startCamera(PluginCall call) {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(getContext());
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                analysisExecutor = Executors.newSingleThreadExecutor();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                // Lower the analysis resolution: the model rescales to 256x256 anyway, so a
                // smaller frame means far less per-frame rotate/copy/upload (the real bottleneck).
                ResolutionSelector resSel = new ResolutionSelector.Builder()
                        .setResolutionStrategy(new ResolutionStrategy(
                                new Size(480, 360), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                        .build();
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setResolutionSelector(resSel)
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                        .build();
                analysis.setAnalyzer(analysisExecutor, this::analyze);
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(getActivity(), CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis);
                call.resolve();
            } catch (Exception e) {
                // The bind runs async (after start() returned), so surface the failure by
                // REJECTING the held call — the JS side then engages the web/keyboard fallback.
                Log.e(TAG, "camera bind failed", e);
                teardown();
                call.reject("camera-bind: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private void analyze(ImageProxy image) {
        try {
            long ts = SystemClock.uptimeMillis();
            // Rebuild the landmarker on THIS thread (the only detectAsync caller) when the
            // benchmark asks to switch delegate — no concurrent access to the landmarker.
            String sw = switchTo;
            if (sw != null) {
                switchTo = null;
                try {
                    if (landmarker != null) landmarker.close();
                    setupLandmarker("CPU".equals(sw) ? Delegate.CPU : Delegate.GPU, sw.toLowerCase());
                    infEma = 0;
                } catch (Exception e) { Log.e(TAG, "delegate switch", e); }
            }
            int rotation = image.getImageInfo().getRotationDegrees();
            Bitmap raw = image.toBitmap(); // RGBA_8888 -> ARGB bitmap (sensor orientation)
            // Rotate the bitmap UPRIGHT ourselves (official MediaPipe Android pattern) so the
            // landmarks come back in an unambiguous upright frame matching the web convention.
            // No mirror here — the web pipeline already mirrors via (1 - x) for the selfie view.
            Bitmap upright = raw;
            if (rotation != 0) {
                Matrix m = new Matrix();
                m.postRotate(rotation);
                upright = Bitmap.createBitmap(raw, 0, 0, raw.getWidth(), raw.getHeight(), m, true);
            }
            if (upright != raw) raw.recycle(); // raw no longer needed once the rotated copy exists
            if (landmarker != null) {
                MPImage mpImage = new BitmapImageBuilder(upright).build();
                // Recycle the PREVIOUS frame's bitmap now that its detectAsync has completed
                // (single-thread executor + KEEP_ONLY_LATEST -> at most one outstanding frame).
                if (inFlight != null) inFlight.recycle();
                inFlight = upright;
                landmarker.detectAsync(mpImage, ts);
            } else {
                upright.recycle(); // torn down mid-frame: don't leak the bitmap
            }
        } catch (Exception e) {
            Log.e(TAG, "analyze", e);
        } finally {
            image.close();
        }
    }

    private void onResult(PoseLandmarkerResult result, MPImage input) {
        try {
            long now = SystemClock.uptimeMillis();
            double age = now - result.timestampMs(); // capture->result latency (a duration: clock-domain-free)
            infEma = infEma == 0 ? age : infEma + (age - infEma) * 0.2;

            JSObject data = new JSObject();
            data.put("age", age);
            data.put("ms", (long) Math.round(infEma));
            data.put("delegate", delegateName);

            List<List<NormalizedLandmark>> all = result.landmarks();
            if (all != null && !all.isEmpty()) {
                List<NormalizedLandmark> lm = all.get(0);
                JSArray arr = new JSArray();
                for (NormalizedLandmark p : lm) {
                    arr.put((double) p.x()); arr.put((double) p.y()); arr.put((double) p.z());
                    arr.put(p.visibility().isPresent() ? (double) p.visibility().get() : 1.0); // confidence
                }
                data.put("lm", arr);
            }
            notifyListeners("pose", data);

            // --- delegate benchmark: GPU first, only probe CPU if GPU is slow, keep the faster ---
            if (phase < 2) {
                bench.add(age);
                if (bench.size() >= 8) {
                    double med = median(bench);
                    bench.clear();
                    if (phase == 0) {
                        gpuMs = med;
                        if (med < 30) { phase = 2; }                 // GPU clearly fast -> keep it
                        else { switchTo = "CPU"; phase = 1; }        // GPU slow -> measure CPU to compare
                    } else {
                        if (gpuMs <= med) switchTo = "GPU";          // GPU was as fast or faster -> go back
                        phase = 2;                                   // else stay on CPU
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "onResult", e);
        } finally {
            // The callback's input is the graph's output bitmap (GC-managed, never reused). Close
            // it eagerly so its memory frees now instead of waiting for GC — idempotent + safe.
            try { input.close(); } catch (Exception ignored) {}
        }
    }

    private static double median(ArrayList<Double> a) {
        ArrayList<Double> s = new ArrayList<>(a);
        Collections.sort(s);
        return s.get(s.size() / 2);
    }
}
