// Motion input. Captures two kinds of input from the body:
//  1) HEAD x position (nose landmark) — a horizontal lean/weave to dodge.
//  2) PUNCHES — a fast outward/forward wrist thrust; left vs right fist maps to L/R.
//
// Inference is DECOUPLED from rendering: a Web Worker runs MediaPipe off the main
// thread, driven by requestVideoFrameCallback (one detect per camera frame). The render
// loop only reads the latest state and EXTRAPOLATES the tracked points by their velocity,
// so the overlay follows smoothly at full frame rate even when inference is slower.
// Falls back to keyboard/mouse when no camera, so the game stays fully testable headless.

import type { PoseLandmarker as PoseLandmarkerT } from "@mediapipe/tasks-vision";
import PoseWorker from "./poseWorker?worker"; // bundled as a classic worker (broad WebView support)
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type Side = "L" | "R";
export interface Vec2 { x: number; y: number }
export interface Punch { side: Side; tMs: number } // tMs = capture time, for latency-accurate judging

// Set false to force the inline (main-thread) path, e.g. to debug a device.
const USE_WORKER = true;

export interface InputProvider {
  readonly ready: boolean;
  readonly kind: "camera" | "keyboard";
  head(): Vec2; // normalized 0..1, origin top-left, x mirrored (selfie)
  fists(): { L: Vec2; R: Vec2 };
  consumePunch(): Punch | null; // edge-triggered queue, oldest first
  update(nowMs: number): void;
  guardUp(): boolean; // both hands up at face height (camera) — true for keyboard
  // screen-space tracking overlay (head + both hands) + hand depth, or null
  tracking(): { head: Vec2; L: Vec2; R: Vec2; detected: boolean; depthL: number; depthR: number } | null;
  videoEl?: HTMLVideoElement;
  mode?: string;            // active engine, for the on-screen debug overlay
  inferenceHz?(): number;   // measured detections per second
  engineMs?(): number;      // measured inference time per frame (ms)
  usesNativePreview?: boolean; // camera shown by a native layer behind a transparent WebView
  beginCalibration?(): void; // start recording prep jabs to personalize thresholds
  endCalibration?(): void;   // apply the recorded jabs (or silently keep defaults)
  calCount?(): number;       // how many calibration jabs captured so far
  stop(): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Population-grounded firing presets (shoulder-width units / sw-per-second / ms), validated
// against anthropometry (ANSUR) + boxing-jab kinematics. The player picks sensitivity; the
// optional prep calibration nudges per side on top (a clamped factor, never off a cliff).
export type Sensitivity = "sensitive" | "normal" | "strict";
const PRESETS: Record<Sensitivity, { ext: number; thrust: number; cooldown: number }> = {
  sensitive: { ext: 0.12, thrust: 1.7, cooldown: 140 },
  normal: { ext: 0.15, thrust: 2.0, cooldown: 140 },
  strict: { ext: 0.18, thrust: 2.4, cooldown: 160 },
};
let currentSens: Sensitivity = "normal";
try { const s = localStorage.getItem("mbh-sens"); if (s === "sensitive" || s === "normal" || s === "strict") currentSens = s; } catch { /* ignore */ }
export function setSensitivity(s: Sensitivity) { if (PRESETS[s]) { currentSens = s; try { localStorage.setItem("mbh-sens", s); } catch { /* ignore */ } } }
export function getSensitivity(): Sensitivity { return currentSens; }

// One Euro Filter (Casiez et al. 2012). Speed-adaptive low-pass: heavy smoothing when the
// signal is slow (kills jitter) and light smoothing when it moves fast (low lag). The
// standard for real-time pose/AR tracking — works the same on any device, no assumptions.
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(private minCutoff = 1.3, private beta = 0.7, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, tMs: number): number {
    if (this.xPrev === null) { this.xPrev = x; this.tPrev = tMs; return x; }
    const dt = Math.min(0.2, Math.max(0.001, (tMs - this.tPrev) / 1000));
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    this.dxPrev += this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    this.xPrev += this.alpha(cutoff, dt) * (x - this.xPrev);
    return this.xPrev;
  }
  velocity() { return this.dxPrev; } // filtered derivative (units/second) for prediction
}

// ---------------- Keyboard / mouse fallback ----------------
export class KeyboardInput implements InputProvider {
  ready = true;
  kind = "keyboard" as const;
  mode = "keyboard";
  inferenceHz() { return 0; }
  engineMs() { return 0; }
  private _head: Vec2 = { x: 0.5, y: 0.5 };
  private queued: Punch | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const t = performance.now();
    if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") this.queued = { side: "L", tMs: t };
    if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") this.queued = { side: "R", tMs: t };
  };
  private onMove = (e: MouseEvent) => {
    this._head = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
  };
  private onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) this._head = { x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight };
  };
  constructor() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("mousemove", this.onMove);
    window.addEventListener("touchmove", this.onTouch, { passive: true });
  }
  head() { return this._head; }
  fists() { return { L: { x: 0.3, y: 0.5 }, R: { x: 0.7, y: 0.5 } }; }
  consumePunch() { const p = this.queued; this.queued = null; return p; }
  guardUp() { return true; }
  tracking() { return null; }
  update() {}
  stop() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("touchmove", this.onTouch);
  }
}

// ---------------- Camera / MediaPipe pose ----------------
const NOSE = 0, L_WRIST = 15, R_WRIST = 16, L_SH = 11, R_SH = 12, L_ELBOW = 13, R_ELBOW = 14;
type LM = { x: number; y: number; z?: number; v?: number };

export class PoseInput implements InputProvider {
  ready = false;
  kind = "camera" as const;
  videoEl: HTMLVideoElement;
  mode = "starting";       // "worker-gpu" | "worker-cpu" | "inline-gpu" | "inline-cpu"
  private detHz = 0;       // measured detections/second (for the on-screen overlay)

  private landmarker: PoseLandmarkerT | null = null; // inline mode only
  private worker: Worker | null = null;
  private useWorker = false;
  private busy = false;     // a frame is in flight to the worker
  private stopped = false;
  private infMs = 16;       // measured inference time (ms) — adapts to each device, no assumptions
  private lastInfEnd = 0;   // when the last inline inference finished
  private stream: MediaStream | null = null;
  private realDelegate = ""; // GPU/CPU actually engaged (measured), not just requested
  private workerMs = 0;      // worker-measured ms/frame
  private lastSendMs = 0;    // when the last frame was sent to the worker (stall watchdog)
  private workerStalls = 0;
  private dsCanvas: HTMLCanvasElement | null = null; // shared downscaler (reliable on every WebView)
  private dsCtx: CanvasRenderingContext2D | null = null;
  // On resume from background, rAF/timestamps jump and `busy` may be stale — reset them.
  private onVis = () => { if (document.visibilityState === "visible") { this.busy = false; this.prevT = 0; this.lastSendMs = 0; } };

  // display positions (extrapolated + smoothed) — what the overlay/dodge read
  private _head: Vec2 = { x: 0.5, y: 0.5 };
  private _L: Vec2 = { x: 0.35, y: 0.5 };
  private _R: Vec2 = { x: 0.65, y: 0.5 };
  // last DETECTED positions + smoothed velocities (units/second) for extrapolation
  private detHead: Vec2 = { x: 0.5, y: 0.5 };
  private detL: Vec2 = { x: 0.35, y: 0.5 };
  private detR: Vec2 = { x: 0.65, y: 0.5 };
  private velHead: Vec2 = { x: 0, y: 0 };
  private velL: Vec2 = { x: 0, y: 0 };
  private velR: Vec2 = { x: 0, y: 0 };
  private lastDetMs = 0;
  // One Euro filters per tracked coordinate — smooth, low-lag display markers at any rate
  private fHeadX = new OneEuro(); private fHeadY = new OneEuro();
  private fLX = new OneEuro(); private fLY = new OneEuro();
  private fRX = new OneEuro(); private fRY = new OneEuro();
  // reversal-aware extrapolation: cut the prediction horizon on a direction reversal (the
  // punch retract), where constant-velocity prediction would overshoot the real hand.
  private prevVelHead: Vec2 = { x: 0, y: 0 };
  private prevVelL: Vec2 = { x: 0, y: 0 };
  private prevVelR: Vec2 = { x: 0, y: 0 };
  private extHead = 1; private extL = 1; private extR = 1;

  protected prevT = 0; // previous detection time (for velocity dt)
  private punches: Punch[] = [];
  private punchCooldown: Record<Side, number> = { L: 0, R: 0 };
  protected detected = false;
  private guard = false;
  private depthL = 0;
  private depthR = 0;

  // Punch detector state, per side. Distances are in "shoulder-widths" so thresholds
  // are independent of how far the player stands from the camera.
  private restReach: Record<Side, number> = { L: 0, R: 0 }; // adaptive guard baseline (2D reach)
  private prevReach: Record<Side, number> = { L: 0, R: 0 };
  private vReach: Record<Side, number> = { L: 0, R: 0 };     // smoothed 2D extension velocity
  private restFore: Record<Side, number> = { L: 0, R: 0 };   // adaptive forearm-length baseline
  private prevFore: Record<Side, number> = { L: 0, R: 0 };
  private vFore: Record<Side, number> = { L: 0, R: 0 };       // smoothed foreshortening rate (forward jab)
  private peakReach: Record<Side, number> = { L: 0, R: 0 };
  private armed: Record<Side, boolean> = { L: true, R: true };
  private hotFrames: Record<Side, number> = { L: 0, R: 0 }; // consecutive frames meeting the punch threshold
  private hotStart: Record<Side, number> = { L: 0, R: 0 };  // onset time of the current hot streak (for back-dating)
  // optional prep calibration: per-side multiplier on the preset thresholds (1 = preset default)
  private calFactorExt: Record<Side, number> = { L: 1, R: 1 };
  private calFactorThrust: Record<Side, number> = { L: 1, R: 1 };
  private calOn = false;
  private calPeakT: Record<Side, number> = { L: 0, R: 0 }; // current jab's peak thrust during calibration
  private calPeakE: Record<Side, number> = { L: 0, R: 0 }; // current jab's peak extension
  private calSamples: Record<Side, { t: number; e: number }[]> = { L: [], R: [] };

  constructor() {
    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
  }

  async init(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Lower resolution + high frame rate = faster inference and fresher frames,
      // i.e. lower input latency for punch timing.
      video: { facingMode: "user", width: 480, height: 360, frameRate: { ideal: 60, min: 30 } },
      audio: false,
    });
    this.videoEl.srcObject = this.stream;
    await this.videoEl.play();

    this.dsCanvas = document.createElement("canvas");
    this.dsCanvas.width = 320; this.dsCanvas.height = 240;
    this.dsCtx = this.dsCanvas.getContext("2d");
    document.addEventListener("visibilitychange", this.onVis);

    // Local, offline-bundled wasm + model (no CDN), resolved against the document base
    // so it works on web (root/subpath) and inside the Capacitor WebView.
    const mp = new URL("mediapipe/", document.baseURI).href;
    const wasmBase = mp + "wasm";
    const modelUrl = mp + "models/pose_landmarker_lite.task";

    let workerErr = "";
    if (USE_WORKER && typeof Worker !== "undefined" && typeof createImageBitmap === "function") {
      try {
        await this.initWorker(wasmBase, modelUrl);
        this.useWorker = true;
      } catch (e) {
        workerErr = ((e as Error)?.message || "fail").slice(0, 20);
        this.useWorker = false;
      }
    } else {
      workerErr = "unsupported";
    }
    if (!this.useWorker) {
      await this.initInline(wasmBase, modelUrl);
      this.mode += ` wkr:${workerErr}`; // surface why the worker didn't engage (on-screen)
    }

    this.ready = true;
    this.startCaptureLoop();
  }

  private initWorker(wasmBase: string, modelUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let w: Worker;
      try { w = new PoseWorker(); } catch (e) { reject(new Error("ctor:" + ((e as Error)?.name || "x"))); return; }
      // First run compiles an ~11MB wasm module — slow on weak devices. Use a STALL
      // watchdog reset by progress heartbeats (not a short flat timeout that kills a
      // worker that would have worked) plus a generous absolute cap.
      let stall: ReturnType<typeof setTimeout>;
      const arm = () => { clearTimeout(stall); stall = setTimeout(() => { w.terminate(); reject(new Error("stall")); }, 15000); };
      const hardCap = setTimeout(() => { w.terminate(); reject(new Error("timeout")); }, 40000);
      const done = () => { clearTimeout(stall); clearTimeout(hardCap); };
      arm();
      w.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === "loading") { arm(); return; } // progress: still working, reset the stall
        if (d.type === "ready") {
          done();
          this.worker = w;
          this.realDelegate = String(d.delegate ?? "?").toLowerCase();
          this.mode = "worker-" + this.realDelegate;
          w.onmessage = (ev: MessageEvent) => this.onWorkerMessage(ev);
          resolve();
        } else if (d.type === "error") {
          done(); w.terminate(); reject(new Error("init:" + String(d.message).slice(0, 14)));
        }
      };
      w.onerror = (ev: ErrorEvent) => { done(); w.terminate(); reject(new Error("load:" + (ev?.message ? ev.message.slice(0, 14) : "x"))); };
      w.postMessage({ type: "init", wasmBase, modelUrl });
    });
  }

  private onWorkerMessage(e: MessageEvent) {
    const d = e.data;
    if (d.type === "recovered") { this.realDelegate = String(d.delegate).toLowerCase(); this.mode = "worker-" + this.realDelegate; return; }
    if (d.type !== "result") return;
    this.busy = false;
    this.workerStalls = 0;
    if (typeof d.ms === "number") this.workerMs = d.ms;
    // The worker reports the REAL delegate it measured (GPU can silently degrade to CPU).
    if (d.delegate && String(d.delegate).toLowerCase() !== this.realDelegate) {
      this.realDelegate = String(d.delegate).toLowerCase();
      this.mode = "worker-" + this.realDelegate;
    }
    if (d.lm) this.onLandmarks(d.lm as LM[], d.ts as number);
    else this.detected = false;
  }

  private async initInline(wasmBase: string, modelUrl: string) {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(wasmBase);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    try { this.landmarker = await make("GPU"); this.mode = "inline-gpu"; }
    catch { this.landmarker = await make("CPU"); this.mode = "inline-cpu"; }
  }

  // Drive detection in its OWN loop, independent of the game's render loop. In worker
  // mode each tick only grabs+sends a frame (a few ms); the heavy inference happens on
  // the worker thread, so rendering is never blocked. A dedicated rAF is used (rather
  // than requestVideoFrameCallback) because it reliably ticks for an off-DOM <video>.
  private startCaptureLoop() {
    const tick = () => {
      if (this.stopped) return;
      this.grabAndDetect();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private grabAndDetect() {
    if (!this.ready || this.videoEl.readyState < 2) return;
    const ts = performance.now();
    if (this.useWorker && this.worker) {
      if (this.busy) {
        // Watchdog: if the worker hasn't answered for a while it stalled (WebGL context
        // loss / crash). Un-stick so inference resumes instead of freezing forever while
        // the render loop keeps running (looks alive, is dead).
        if (ts - this.lastSendMs > 2000) { this.busy = false; this.workerStalls++; }
        else return;
      }
      const src = this.snapshot();
      if (!src) return;
      this.busy = true; this.lastSendMs = ts;
      createImageBitmap(src)
        .then((b) => {
          if (this.stopped || !this.worker) { b.close(); this.busy = false; return; }
          this.worker.postMessage({ type: "frame", bitmap: b, ts }, [b]);
        })
        .catch(() => { this.busy = false; });
    } else if (this.landmarker) {
      // Adaptive pacing (device-agnostic): inline inference blocks the main thread, so run
      // it at most once per measured inference time, leaving the rest for the render loop.
      // Fast devices -> high rate; slow devices -> render still breathes. Measures, never assumes.
      if (ts - this.lastInfEnd < this.infMs) return;
      const src = this.snapshot() ?? this.videoEl;
      const t0 = performance.now();
      try {
        const res = this.landmarker.detectForVideo(src, ts);
        const lm = res.landmarks?.[0];
        if (lm) this.onLandmarks(lm as unknown as LM[], ts); else this.detected = false;
      } catch { /* drop frame */ }
      this.lastInfEnd = performance.now();
      this.infMs += ((this.lastInfEnd - t0) - this.infMs) * 0.3;
    }
  }

  // Draw the current frame into the shared low-res canvas. Reliable downscale on every
  // WebView — we don't trust createImageBitmap's resize options being honored.
  private snapshot(): HTMLCanvasElement | null {
    if (!this.dsCanvas || !this.dsCtx) return null;
    try { this.dsCtx.drawImage(this.videoEl, 0, 0, this.dsCanvas.width, this.dsCanvas.height); }
    catch { return null; }
    return this.dsCanvas;
  }

  // Called whenever fresh landmarks arrive (worker / inline / native). Runs at camera rate.
  protected onLandmarks(lm: LM[], ts: number) {
    if (!lm || lm.length < 17) { this.detected = false; return; }
    this.detected = true;
    const mx = (p: { x: number }) => 1 - p.x; // mirror x for a selfie view
    const rawDt = (ts - this.prevT) / 1000;
    const dt = Math.min(0.12, Math.max(0.008, rawDt)); // clamped wide enough for low detection rates
    this.prevT = ts;
    if (rawDt > 0.001 && rawDt < 2) this.detHz += (1 / rawDt - this.detHz) * 0.1; // TRUE rate

    // The pose model marks the WRIST, but the fist is past it. Extend along the forearm
    // (elbow -> wrist) so the tracked point sits on the knuckles — more accurate to aim
    // with, and it travels further during a jab so detection is more sensitive too.
    const FIST = 0.22; // how far past the wrist toward the knuckles. Lower = less lever-
    // amplified jitter (less to smooth out), still ahead of the wrist for accuracy.
    const fist = (w: LM, e: LM): LM => ({
      x: w.x + (w.x - e.x) * FIST,
      y: w.y + (w.y - e.y) * FIST,
      z: (w.z ?? 0) + ((w.z ?? 0) - (e.z ?? 0)) * FIST,
    });
    const fistL = fist(lm[L_WRIST], lm[L_ELBOW]);
    const fistR = fist(lm[R_WRIST], lm[R_ELBOW]);

    // One Euro filtered positions + their clean derivatives (for render-rate prediction).
    // dt is unused here on purpose — the filter tracks its own timing from ts.
    const filt = (fX: OneEuro, fY: OneEuro, det: Vec2, vel: Vec2, rawX: number, rawY: number) => {
      det.x = fX.filter(rawX, ts); vel.x = fX.velocity();
      det.y = fY.filter(rawY, ts); vel.y = fY.velocity();
    };
    // One Euro already smooths the markers; just follow the fist every frame. (A previous
    // visibility-based "freeze" made markers stick/jump off-screen when confidence dipped on
    // a fully-visible hand — removed: it hurt tracking far more than it helped wobble.)
    filt(this.fHeadX, this.fHeadY, this.detHead, this.velHead, mx(lm[NOSE]), lm[NOSE].y);
    filt(this.fLX, this.fLY, this.detL, this.velL, mx(fistL), fistL.y);
    filt(this.fRX, this.fRY, this.detR, this.velR, mx(fistR), fistR.y);
    // shrink the extrapolation horizon when a point reverses direction (dot(prevVel,vel)<0),
    // then recover — kills marker overshoot at the punch retract.
    const revScale = (prev: Vec2, vel: Vec2, cur: number) =>
      prev.x * vel.x + prev.y * vel.y < 0 ? 0.15 : Math.min(1, cur + 0.3);
    this.extHead = revScale(this.prevVelHead, this.velHead, this.extHead); this.prevVelHead.x = this.velHead.x; this.prevVelHead.y = this.velHead.y;
    this.extL = revScale(this.prevVelL, this.velL, this.extL); this.prevVelL.x = this.velL.x; this.prevVelL.y = this.velL.y;
    this.extR = revScale(this.prevVelR, this.velR, this.extR); this.prevVelR.x = this.velR.x; this.prevVelR.y = this.velR.y;
    this.lastDetMs = ts;

    // body scale = shoulder width; everything below measured in these units
    const sw = Math.hypot(mx(lm[L_SH]) - mx(lm[R_SH]), lm[L_SH].y - lm[R_SH].y) || 0.2;
    const shY = (lm[L_SH].y + lm[R_SH].y) / 2;
    const shZ = ((lm[L_SH].z ?? 0) + (lm[R_SH].z ?? 0)) / 2;

    const upL = fistL.y < shY + 0.34, upR = fistR.y < shY + 0.34;
    this.guard = upL && upR;

    const dl = clamp01((shZ - (fistL.z ?? 0)) * 2.2);
    const dr = clamp01((shZ - (fistR.z ?? 0)) * 2.2);
    this.depthL += (dl - this.depthL) * 0.5;
    this.depthR += (dr - this.depthR) * 0.5;

    // Forearm apparent length (elbow->wrist, shoulder-width-normalized). It SHRINKS when the
    // arm points at the camera — a straight jab — so its shrink rate is the forward signal,
    // replacing the noisy MediaPipe normalized-z the jab was failing on. (Do NOT gate firing
    // on visibility: a fast real punch blurs and drops confidence exactly when thrown.)
    const foreArm = (wIdx: number, eIdx: number) =>
      Math.hypot(mx(lm[wIdx]) - mx(lm[eIdx]), lm[wIdx].y - lm[eIdx].y) / sw;
    this.detectPunch("L", fistL, lm[L_SH], sw, foreArm(L_WRIST, L_ELBOW), dt, ts, upL);
    this.detectPunch("R", fistR, lm[R_SH], sw, foreArm(R_WRIST, R_ELBOW), dt, ts, upR);
  }

  // A jab = the wrist thrusting OUT / FORWARD fast. Fire on the ONSET of that thrust
  // (not at full extension) to minimise latency, and re-arm as soon as the arm starts
  // coming back so quick combos register. Units are shoulder-widths and sw/second.
  private detectPunch(side: Side, wrist: LM, sh: LM, sw: number, foreArm: number, dt: number, nowMs: number, up: boolean): void {
    const mx = (p: { x: number }) => 1 - p.x;
    const reach = Math.hypot(mx(wrist) - mx(sh), wrist.y - sh.y) / sw; // 2D arm extension

    if (this.restReach[side] === 0) this.restReach[side] = reach;
    if (this.restFore[side] === 0) this.restFore[side] = foreArm;
    const prevReach = this.prevReach[side]; this.prevReach[side] = reach;
    const prevFore = this.prevFore[side]; this.prevFore[side] = foreArm;

    this.vReach[side] += (((reach - prevReach) / dt) - this.vReach[side]) * 0.5;
    const v = this.vReach[side];
    // foreshortening rate: the forearm SHRINKS as it points at the camera (a straight jab).
    // Same units as reach velocity (shoulder-widths/s), so it shares the thrust scale + gate.
    this.vFore[side] += ((-(foreArm - prevFore) / dt) - this.vFore[side]) * 0.5;
    const vFore = this.vFore[side];

    const thrust = v + 0.9 * Math.max(0, vFore);   // a jab toward the camera rides vFore
    const out = reach - this.restReach[side];      // extension in the image plane (hooks/crosses)
    const outFwd = this.restFore[side] - foreArm;  // extension TOWARD the camera (forearm shorter)
    const ext = Math.max(out, outFwd);             // extended in 2D OR toward the lens

    if (this.calOn) { // record each jab's PEAK thrust/ext for optional threshold personalization
      if (ext > 0.1 && thrust > 1.0) { this.calPeakT[side] = Math.max(this.calPeakT[side], thrust); this.calPeakE[side] = Math.max(this.calPeakE[side], ext); }
      else if (this.calPeakT[side] > 1.2) { this.calSamples[side].push({ t: this.calPeakT[side], e: this.calPeakE[side] }); this.calPeakT[side] = 0; this.calPeakE[side] = 0; }
    }

    // firing gates = chosen preset scaled by the optional per-side calibration factor
    const gExt = PRESETS[currentSens].ext * this.calFactorExt[side];
    const gThrust = PRESETS[currentSens].thrust * this.calFactorThrust[side];
    if (this.armed[side]) {
      const hot = up && ext > gExt && thrust > gThrust;
      if (hot && this.hotFrames[side] === 0) this.hotStart[side] = nowMs; // onset instant
      this.hotFrames[side] = hot ? this.hotFrames[side] + 1 : 0;
      // hold ~2 frames (rejects single-frame spikes = false punches) but back-date to the
      // ONSET, so this adds NO latency.
      if (hot && nowMs > this.punchCooldown[side] && this.hotFrames[side] >= 2) {
        this.punches.push({ side, tMs: this.hotStart[side] });
        if (this.punches.length > 4) this.punches.shift();
        this.punchCooldown[side] = nowMs + PRESETS[currentSens].cooldown;
        this.armed[side] = false;
        this.peakReach[side] = ext;
        this.hotFrames[side] = 0;
      }
    } else {
      this.peakReach[side] = Math.max(this.peakReach[side], ext);
      if (v < -1.0 || vFore < -1.0 || ext < this.peakReach[side] - 0.22 || ext < 0.10) this.armed[side] = true;
    }

    // adapt both guard baselines slowly while the arm is fairly still and not extended
    if (Math.abs(v) < 1.2 && out < 0.5) this.restReach[side] += (reach - this.restReach[side]) * 0.04;
    if (Math.abs(vFore) < 1.2 && outFwd < 0.5) this.restFore[side] += (foreArm - this.restFore[side]) * 0.04;
  }

  head() { return this._head; }
  fists() { return { L: this._L, R: this._R }; }
  consumePunch() { return this.punches.shift() ?? null; }
  guardUp() { return this.guard; }
  inferenceHz() { return this.detHz; }
  engineMs() { return this.useWorker ? this.workerMs : Math.round(this.infMs); }

  beginCalibration() { this.calOn = true; this.calSamples = { L: [], R: [] }; this.calPeakT = { L: 0, R: 0 }; this.calPeakE = { L: 0, R: 0 }; }
  // Progress toward a usable calibration: endCalibration applies PER SIDE only with >=2 samples,
  // so report the best-covered side (not the L+R sum, which could read "2" as 1L+1R and apply nothing).
  calCount() { return Math.max(this.calSamples.L.length, this.calSamples.R.length); }
  endCalibration() {
    this.calOn = false;
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    (["L", "R"] as Side[]).forEach((side) => {
      const s = this.calSamples[side];
      if (s.length < 2) return; // too few clean jabs -> keep the preset default for this side
      const peakT = med(s.map((x) => x.t)), peakE = med(s.map((x) => x.e));
      const w = s.length / (s.length + 3); // empirical-Bayes shrink toward the default (N=3 -> 0.5)
      // gate at ~55% of the player's median peak, shrunk toward 1, clamped (a bad calib can't go off a cliff)
      const fT = w * (peakT * 0.55 / PRESETS[currentSens].thrust) + (1 - w);
      const fE = w * (peakE * 0.55 / PRESETS[currentSens].ext) + (1 - w);
      this.calFactorThrust[side] = Math.max(0.6, Math.min(1.6, fT));
      this.calFactorExt[side] = Math.max(0.6, Math.min(1.6, fE));
    });
  }
  tracking() { return { head: this._head, L: this._L, R: this._R, detected: this.detected, depthL: this.depthL, depthR: this.depthR }; }

  // Render-rate step: extrapolate the tracked points to "now" using their last velocity,
  // then ease the displayed point toward that prediction. Smooth AND low-latency.
  update(nowMs: number): void {
    if (!this.ready) return;
    const age = Math.min(0.10, Math.max(0, (nowMs - this.lastDetMs) / 1000)); // s, capped (covers low detection rates)
    const k = 0.6; // ease factor toward the predicted target
    const ext = (disp: Vec2, det: Vec2, vel: Vec2, scale: number) => {
      const a = age * scale;
      const tx = clamp01(det.x + vel.x * a);
      const ty = clamp01(det.y + vel.y * a);
      disp.x += (tx - disp.x) * k;
      disp.y += (ty - disp.y) * k;
    };
    ext(this._head, this.detHead, this.velHead, this.extHead);
    ext(this._L, this.detL, this.velL, this.extL);
    ext(this._R, this.detR, this.velR, this.extR);
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVis);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.worker?.terminate(); this.worker = null;
    this.landmarker?.close(); this.landmarker = null;
    this.ready = false;
  }
}

// ---------------- Native pose (Android APK): real GPU/NNAPI inference off the WebView ----
interface NativePosePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: "pose",
    cb: (d: { lm?: number[]; age: number; ms: number; delegate: string }) => void,
  ): Promise<PluginListenerHandle>;
}
const NativePose = registerPlugin<NativePosePlugin>("NativePose");

// Reuses the ENTIRE web detection pipeline (One Euro, onset/velocity punch detection,
// shoulder-width normalization, extrapolation) — only the landmark SOURCE changes: a native
// Capacitor plugin runs the camera + MediaPipe on the real GPU and streams landmarks here.
export class NativePoseInput extends PoseInput {
  usesNativePreview = true;
  private sub: PluginListenerHandle | null = null;
  private nativeMs = 0;

  async init(): Promise<void> {
    this.mode = "native-?";
    this.sub = await NativePose.addListener("pose", (d) => this.onNative(d));
    await NativePose.start(); // native opens the camera + MediaPipe (GPU) and emits landmarks
    this.ready = true;
    // No getUserMedia, no worker, no capture loop — native events drive onLandmarks().
  }

  private onNative(d: { lm?: number[]; age: number; ms: number; delegate: string }) {
    if (typeof d.ms === "number") this.nativeMs = d.ms;
    this.mode = "native-" + (d.delegate || "?");
    const flat = d.lm;
    if (!flat || flat.length < 68) { this.detected = false; return; } // native sends 33 landmarks x 4 floats; need >=17 (68 floats) for the wrist/elbow indices (max idx R_WRIST=16)
    const n = Math.floor(flat.length / 4);
    const lm: LM[] = new Array(n);
    for (let i = 0; i < n; i++) lm[i] = { x: flat[i * 4], y: flat[i * 4 + 1], z: flat[i * 4 + 2], v: flat[i * 4 + 3] };
    // Back-date to capture time in the JS clock using the native-measured age (a duration,
    // so the two clocks never need to be reconciled). Keeps punch judging on-beat.
    const tMs = performance.now() - (d.age || 0);
    this.onLandmarks(lm, tMs);
  }

  engineMs() { return this.nativeMs; }

  stop(): void {
    this.sub?.remove().catch(() => {});
    this.sub = null;
    NativePose.stop().catch(() => {});
    this.ready = false;
  }
}

export async function createInput(useCamera: boolean): Promise<InputProvider> {
  if (useCamera) {
    // On the Android APK, run inference NATIVELY (real GPU) — the WebView's WebGL is software.
    if (Capacitor.isNativePlatform()) {
      try { const n = new NativePoseInput(); await n.init(); return n; }
      catch (e) { console.warn("Native pose unavailable, web fallback:", e); }
    }
    try { const p = new PoseInput(); await p.init(); return p; }
    catch (e) { console.warn("Camera init failed, falling back to keyboard:", e); }
  }
  return new KeyboardInput();
}
