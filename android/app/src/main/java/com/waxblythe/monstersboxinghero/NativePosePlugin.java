package com.waxblythe.monstersboxinghero;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.os.SystemClock;
import android.util.Log;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.core.Delegate;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker;
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Real-time pose inference, NATIVE. CameraX feeds frames to MediaPipe Tasks Vision running
 * on the real GPU/NNAPI delegate (the WebView cannot — its WebGL is software). Only the 33
 * landmarks + the capture->result latency are sent to the web game; camera pixels never
 * cross the bridge. The web game's existing detection pipeline consumes them unchanged.
 */
@CapacitorPlugin(name = "NativePose")
public class NativePosePlugin extends Plugin {
    private static final String TAG = "NativePose";
    private static final String MODEL = "public/mediapipe/models/pose_landmarker_lite.task";

    private PoseLandmarker landmarker;
    private ExecutorService analysisExecutor;
    private ProcessCameraProvider cameraProvider;
    private PreviewView previewView;
    private String delegateName = "gpu";
    private double infEma = 0;

    @PluginMethod
    public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                // Motion game = no touch input, so keep the screen awake (else it sleeps mid-fight).
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setupPreview();
                try { setupLandmarker(Delegate.GPU, "gpu"); }
                catch (Exception gpuErr) { Log.w(TAG, "GPU delegate failed, CPU", gpuErr); setupLandmarker(Delegate.CPU, "cpu"); }
                startCamera();
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                call.reject("start: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignored) {}
            try { if (cameraProvider != null) cameraProvider.unbindAll(); } catch (Exception ignored) {}
            if (analysisExecutor != null) { analysisExecutor.shutdown(); analysisExecutor = null; }
            if (landmarker != null) { try { landmarker.close(); } catch (Exception ignored) {} landmarker = null; }
            removePreview();
            call.resolve();
        });
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

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(getContext());
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                analysisExecutor = Executors.newSingleThreadExecutor();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                        .build();
                analysis.setAnalyzer(analysisExecutor, this::analyze);
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(getActivity(), CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis);
            } catch (Exception e) {
                Log.e(TAG, "camera bind failed", e);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private void analyze(ImageProxy image) {
        try {
            long ts = SystemClock.uptimeMillis();
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
            MPImage mpImage = new BitmapImageBuilder(upright).build();
            if (landmarker != null) landmarker.detectAsync(mpImage, ts);
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
        } catch (Exception e) {
            Log.e(TAG, "onResult", e);
        }
    }
}
