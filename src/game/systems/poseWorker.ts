// Pose inference Web Worker. Keeps MediaPipe OFF the render thread so the game stays
// at full frame rate. Receives downscaled camera frames (ImageBitmap) and returns the
// landmark array. GPU delegate first, CPU fallback (some WebViews lack GPU/OffscreenCanvas
// inside a worker).
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarker as PoseLandmarkerT } from "@mediapipe/tasks-vision";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

let landmarker: PoseLandmarkerT | null = null;

async function init(wasmBase: string, modelUrl: string): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(wasmBase);
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  let delegate: "GPU" | "CPU" = "GPU";
  try {
    landmarker = await make("GPU");
  } catch {
    delegate = "CPU";
    landmarker = await make("CPU");
  }
  ctx.postMessage({ type: "ready", delegate });
}

ctx.onmessage = (e: MessageEvent) => {
  const d = e.data as { type: string; wasmBase?: string; modelUrl?: string; bitmap?: ImageBitmap; ts?: number };
  if (d.type === "init") {
    init(d.wasmBase!, d.modelUrl!).catch((err) => ctx.postMessage({ type: "error", message: String(err) }));
    return;
  }
  if (d.type === "frame") {
    const bmp = d.bitmap!;
    if (!landmarker) { bmp.close(); return; }
    let lm: unknown = null;
    try {
      const res = landmarker.detectForVideo(bmp, d.ts!);
      lm = res.landmarks?.[0] ?? null;
    } catch { /* drop this frame */ }
    bmp.close();
    ctx.postMessage({ type: "result", ts: d.ts, lm });
  }
};
