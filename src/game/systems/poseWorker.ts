// Pose inference Web Worker. Keeps MediaPipe OFF the render thread. Classic worker
// (MediaPipe calls importScripts, illegal in module workers). It AUTO-BENCHMARKS the GPU
// vs CPU delegate on the actual device and keeps whichever is faster — because "GPU" can
// silently run on software (SwiftShader) at CPU-or-worse speed. Reports the real delegate
// and measured ms/frame, heartbeats during the slow first-run wasm compile, and recovers
// from WebGL context loss.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarker as PoseLandmarkerT } from "@mediapipe/tasks-vision";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

let vision: unknown = null; // retained so we can recreate / switch delegate
let landmarker: PoseLandmarkerT | null = null;
let delegate: "GPU" | "CPU" = "CPU";
let modelUrlG = "";
let infEma = 0;
let consecFail = 0;
let recreating = false;

// delegate benchmark
let phase: "run" | "benchGpu" | "benchCpu" = "run";
let bench: number[] = [];
let gpuMs = Infinity;
const GPU_GOOD_MS = 45;   // if GPU is already this fast, don't bother testing CPU
const BENCH_FRAMES = 8;

function make(del: "GPU" | "CPU") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return PoseLandmarker.createFromOptions(vision as any, {
    baseOptions: { modelAssetPath: modelUrlG, delegate: del },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }

async function swap(del: "GPU" | "CPU"): Promise<boolean> {
  recreating = true;
  try { landmarker?.close(); } catch { /* ignore */ }
  landmarker = null;
  try { landmarker = await make(del); delegate = del; consecFail = 0; infEma = 0; return true; }
  catch (e) { ctx.postMessage({ type: "error", message: "swap:" + String(e).slice(0, 12) }); return false; }
  finally { recreating = false; }
}

async function init(wasmBase: string, modelUrl: string): Promise<void> {
  modelUrlG = modelUrl;
  ctx.postMessage({ type: "loading", stage: "wasm" });
  vision = await FilesetResolver.forVisionTasks(wasmBase);
  ctx.postMessage({ type: "loading", stage: "model" });
  let canGpu = false;
  try { canGpu = !!new OffscreenCanvas(1, 1).getContext("webgl2"); } catch { canGpu = false; }
  if (canGpu) {
    try { landmarker = await make("GPU"); delegate = "GPU"; phase = "benchGpu"; bench = []; }
    catch { landmarker = await make("CPU"); delegate = "CPU"; phase = "run"; }
  } else {
    landmarker = await make("CPU"); delegate = "CPU"; phase = "run";
  }
  ctx.postMessage({ type: "ready", delegate });
}

ctx.onmessage = (e: MessageEvent) => {
  const d = e.data as { type: string; wasmBase?: string; modelUrl?: string; bitmap?: ImageBitmap; ts?: number };
  if (d.type === "init") {
    init(d.wasmBase!, d.modelUrl!).catch((err) => ctx.postMessage({ type: "error", message: String(err).slice(0, 40) }));
    return;
  }
  if (d.type !== "frame") return;
  const bmp = d.bitmap!;
  if (!landmarker || recreating) { bmp.close(); ctx.postMessage({ type: "result", ts: d.ts, lm: null, ms: Math.round(infEma), delegate }); return; }

  let lm: unknown = null;
  const t0 = performance.now(); // worker-local duration only (never used as a detect timestamp)
  try {
    const res = landmarker.detectForVideo(bmp, d.ts!);
    lm = res.landmarks?.[0] ?? null;
    consecFail = 0;
  } catch { consecFail++; }
  bmp.close();
  const dur = performance.now() - t0;
  infEma = infEma ? infEma + (dur - infEma) * 0.2 : dur;
  ctx.postMessage({ type: "result", ts: d.ts, lm, ms: Math.round(infEma), delegate });

  // --- adaptive delegate benchmark (pick the genuinely faster path on THIS device) ---
  if (phase !== "run") {
    bench.push(dur);
    if (bench.length >= BENCH_FRAMES) {
      const med = median(bench); // median ignores the first-frame shader-compile outlier
      if (phase === "benchGpu") {
        gpuMs = med;
        if (med <= GPU_GOOD_MS) { phase = "run"; }
        else { phase = "benchCpu"; bench = []; swap("CPU"); } // GPU slow (likely software) -> try CPU
      } else {
        if (gpuMs < med) swap("GPU"); // GPU was actually faster, go back
        phase = "run"; bench = [];
      }
    }
    return;
  }

  if (consecFail >= 3 && !recreating) swap(consecFail >= 6 ? "CPU" : delegate); // context-loss recovery
};
