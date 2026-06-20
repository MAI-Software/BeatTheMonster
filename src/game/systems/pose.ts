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
  private restExtL = 0;
  private restExtR = 0;
  private armed: Record<Side, boolean> = { L: true, R: true };

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

    const dt = Math.max(16, nowMs - this.prevT);
    this.prevT = nowMs;
    const shY = (lm[L_SH].y + lm[R_SH].y) / 2;
    const zL = lm[L_WRIST].z ?? 0, zR = lm[R_WRIST].z ?? 0;

    // guard = both hands up around face height (used only for auto-start, not to gate punches)
    const upL = lm[L_WRIST].y < shY + 0.18, upR = lm[R_WRIST].y < shY + 0.18;
    this.guard = upL && upR;

    // smoothed depth toward camera per hand (0..1). A punch = this jumps up fast.
    const shZ = ((lm[L_SH].z ?? 0) + (lm[R_SH].z ?? 0)) / 2;
    const prevDepthL = this.depthL, prevDepthR = this.depthR;
    const dl = Math.max(0, Math.min(1, (shZ - zL) * 2.2));
    const dr = Math.max(0, Math.min(1, (shZ - zR) * 2.2));
    this.depthL += (dl - this.depthL) * 0.5;
    this.depthR += (dr - this.depthR) * 0.5;

    // arm extension (wrist-shoulder distance). Robust jab detection: fire when the
    // extension spikes ABOVE the resting/guard baseline (state machine), re-arming
    // only after the arm pulls back. Speed/fps-independent + depth as a backup.
    const extL = Math.hypot(mx(lm[L_WRIST]) - mx(lm[L_SH]), lm[L_WRIST].y - lm[L_SH].y);
    const extR = Math.hypot(mx(lm[R_WRIST]) - mx(lm[R_SH]), lm[R_WRIST].y - lm[R_SH].y);
    this.restExtL = this.restExtL === 0 ? extL : this.restExtL + (extL - this.restExtL) * 0.05;
    this.restExtR = this.restExtR === 0 ? extR : this.restExtR + (extR - this.restExtR) * 0.05;

    const FIRE = 0.075, REARM = 0.03;
    const fire = (ext: number, rest: number, depth: number, prevDepth: number, side: Side, up: boolean) => {
      const out = ext - rest;
      const dDepth = (depth - prevDepth) / (dt / 1000);
      if (this.armed[side]) {
        if (up && nowMs > this.punchCooldown[side] && (out > FIRE || dDepth > 1.5)) {
          this.queued = side;
          this.punchCooldown[side] = nowMs + 220;
          this.armed[side] = false;
        }
      } else if (out < REARM) {
        this.armed[side] = true;
      }
    };
    fire(extL, this.restExtL, this.depthL, prevDepthL, "L", upL);
    fire(extR, this.restExtR, this.depthR, prevDepthR, "R", upR);
    this.prevZL = zL; this.prevZR = zR;
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
