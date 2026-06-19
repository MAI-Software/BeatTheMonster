// Motion input. Captures two kinds of input from the body:
//  1) HEAD x position (nose landmark) — used only for a horizontal lean/weave to
//     dodge; never requires crouching.
//  2) PUNCHES — left/right wrist thrust up/forward detects a jab; left vs right
//     fist maps to the left/right half of the circle.
//
// MediaPipe is dynamically imported so menus boot without loading the vision wasm.
// Falls back to keyboard/mouse when no camera, so the game is fully testable headless.

import type { PoseLandmarker as PoseLandmarkerT } from "@mediapipe/tasks-vision";

export type Side = "L" | "R";
export interface Vec2 { x: number; y: number }

export interface InputProvider {
  readonly ready: boolean;
  readonly kind: "camera" | "keyboard";
  head(): Vec2; // normalized 0..1, origin top-left, x mirrored (selfie)
  fists(): { L: Vec2; R: Vec2 };
  consumePunch(): Side | null; // edge-triggered, cleared on read
  update(nowMs: number): void;
  guardUp(): boolean; // both hands up at face height (camera) — true for keyboard
  // screen-space tracking overlay (head + both hands) + hand depth, or null
  tracking(): { head: Vec2; L: Vec2; R: Vec2; detected: boolean; depthL: number; depthR: number } | null;
  videoEl?: HTMLVideoElement;
  stop(): void;
}

// ---------------- Keyboard / mouse fallback ----------------
export class KeyboardInput implements InputProvider {
  ready = true;
  kind = "keyboard" as const;
  private _head: Vec2 = { x: 0.5, y: 0.5 };
  private queued: Side | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") this.queued = "L";
    if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") this.queued = "R";
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
const NOSE = 0, L_WRIST = 15, R_WRIST = 16, L_SH = 11, R_SH = 12;

export class PoseInput implements InputProvider {
  ready = false;
  kind = "camera" as const;
  videoEl: HTMLVideoElement;
  private landmarker: PoseLandmarkerT | null = null;
  private stream: MediaStream | null = null;
  private _head: Vec2 = { x: 0.5, y: 0.5 };
  private _L: Vec2 = { x: 0.35, y: 0.5 };
  private _R: Vec2 = { x: 0.65, y: 0.5 };
  private prevL: Vec2 | null = null;
  private prevR: Vec2 | null = null;
  private prevT = 0;
  private queued: Side | null = null;
  private punchCooldown: Record<Side, number> = { L: 0, R: 0 };
  private detected = false;
  private guard = false;
  private depthL = 0;
  private depthR = 0;
  private rawPrevL: Vec2 | null = null;
  private rawPrevR: Vec2 | null = null;
  private prevZL: number | null = null;
  private prevZR: number | null = null;

  constructor() {
    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
  }

  async init(): Promise<void> {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
      audio: false,
    });
    this.videoEl.srcObject = this.stream;
    await this.videoEl.play();
    this.ready = true;
  }

  head() { return this._head; }
  fists() { return { L: this._L, R: this._R }; }
  consumePunch() { const p = this.queued; this.queued = null; return p; }
  guardUp() { return this.guard; }
  tracking() { return { head: this._head, L: this._L, R: this._R, detected: this.detected, depthL: this.depthL, depthR: this.depthR }; }

  update(nowMs: number): void {
    if (!this.ready || !this.landmarker || this.videoEl.readyState < 2) return;
    const res = this.landmarker.detectForVideo(this.videoEl, nowMs);
    const lm = res.landmarks?.[0];
    if (!lm) { this.detected = false; return; }
    this.detected = true;

    // mirror x for selfie view + exponential smoothing to kill jitter
    const mx = (p: { x: number }) => 1 - p.x;
    const k = 0.45; // smoothing factor (higher = snappier)
    const ema = (cur: Vec2, nx: number, ny: number): Vec2 => ({ x: cur.x + (nx - cur.x) * k, y: cur.y + (ny - cur.y) * k });
    this._head = ema(this._head, mx(lm[NOSE]), lm[NOSE].y);
    this._L = ema(this._L, mx(lm[L_WRIST]), lm[L_WRIST].y);
    this._R = ema(this._R, mx(lm[R_WRIST]), lm[R_WRIST].y);

    // punch detection: a jab is the hand THRUSTING TOWARD the camera. MediaPipe gives
    // a depth z per landmark (more negative = closer). We trigger on forward z-velocity
    // (hand approaching) and fall back to fast 2D motion. Hand must be up near guard.
    const dt = Math.max(16, nowMs - this.prevT);
    this.prevT = nowMs;
    const shY = (lm[L_SH].y + lm[R_SH].y) / 2;
    const rawL: Vec2 = { x: mx(lm[L_WRIST]), y: lm[L_WRIST].y };
    const rawR: Vec2 = { x: mx(lm[R_WRIST]), y: lm[R_WRIST].y };
    const zL = lm[L_WRIST].z ?? 0, zR = lm[R_WRIST].z ?? 0;
    const detect = (cur: Vec2, prev: Vec2 | null, z: number, prevZ: number | null, side: Side, wristY: number) => {
      if (prev == null) return;
      const speed2d = Math.hypot(cur.x - prev.x, cur.y - prev.y) / (dt / 1000);
      const forward = prevZ != null ? (prevZ - z) / (dt / 1000) : 0; // >0 = approaching camera
      const extended = wristY < shY + 0.12; // around/above shoulder line
      const thrust = forward > 0.6 || speed2d > 1.4;
      if (thrust && extended && nowMs > this.punchCooldown[side]) {
        this.queued = side;
        this.punchCooldown[side] = nowMs + 210;
      }
    };
    detect(rawL, this.rawPrevL, zL, this.prevZL, "L", lm[L_WRIST].y);
    detect(rawR, this.rawPrevR, zR, this.prevZR, "R", lm[R_WRIST].y);
    this.rawPrevL = rawL; this.rawPrevR = rawR;
    this.prevZL = zL; this.prevZR = zR;

    // hand depth toward camera (forward = positive), smoothed, ~0..1
    const shZ = ((lm[L_SH].z ?? 0) + (lm[R_SH].z ?? 0)) / 2;
    const dl = Math.max(0, Math.min(1, (shZ - zL) * 2.2));
    const dr = Math.max(0, Math.min(1, (shZ - zR) * 2.2));
    this.depthL += (dl - this.depthL) * 0.4;
    this.depthR += (dr - this.depthR) * 0.4;

    // guard = both hands up near face height
    this.guard = lm[L_WRIST].y < shY + 0.06 && lm[R_WRIST].y < shY + 0.06;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
    this.ready = false;
  }
}

export async function createInput(useCamera: boolean): Promise<InputProvider> {
  if (useCamera) {
    try {
      const p = new PoseInput();
      await p.init();
      return p;
    } catch (e) {
      console.warn("Camera init failed, falling back to keyboard:", e);
    }
  }
  return new KeyboardInput();
}
