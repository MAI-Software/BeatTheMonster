// Motion input. Captures two kinds of input from the body:
//  1) HEAD position (nose landmark) — the player moves their body so the head
//     follows the orbiting ball around the circle.
//  2) PUNCHES — left/right wrist thrust forward/out detects a jab; left vs right
//     half of the tracked sphere decides which fist (L/R) it counts as.
//
// Falls back to keyboard/mouse when no camera, so the game is fully testable headless.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type Side = "L" | "R";
export interface Vec2 { x: number; y: number }

export interface InputProvider {
  readonly ready: boolean;
  readonly kind: "camera" | "keyboard";
  head(): Vec2; // normalized 0..1, origin top-left, x mirrored (selfie)
  fists(): { L: Vec2; R: Vec2 };
  consumePunch(): Side | null; // edge-triggered, cleared on read
  update(nowMs: number): void;
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
  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private _head: Vec2 = { x: 0.5, y: 0.5 };
  private _L: Vec2 = { x: 0.35, y: 0.5 };
  private _R: Vec2 = { x: 0.65, y: 0.5 };
  private prevL: Vec2 | null = null;
  private prevR: Vec2 | null = null;
  private prevT = 0;
  private queued: Side | null = null;
  private punchCooldown: Record<Side, number> = { L: 0, R: 0 };

  constructor() {
    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
  }

  async init(): Promise<void> {
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

  update(nowMs: number): void {
    if (!this.ready || !this.landmarker || this.videoEl.readyState < 2) return;
    const res = this.landmarker.detectForVideo(this.videoEl, nowMs);
    const lm = res.landmarks?.[0];
    if (!lm) return;

    // mirror x for selfie view
    const mx = (p: { x: number }) => 1 - p.x;
    this._head = { x: mx(lm[NOSE]), y: lm[NOSE].y };
    this._L = { x: mx(lm[L_WRIST]), y: lm[L_WRIST].y };
    this._R = { x: mx(lm[R_WRIST]), y: lm[R_WRIST].y };

    // punch detection: wrist moves up/forward fast relative to shoulder, with cooldown.
    const dt = Math.max(16, nowMs - this.prevT);
    this.prevT = nowMs;
    const shY = (lm[L_SH].y + lm[R_SH].y) / 2;
    const detect = (cur: Vec2, prev: Vec2 | null, side: Side, wrist: { y: number }) => {
      if (prev) {
        const speed = Math.hypot(cur.x - prev.x, cur.y - prev.y) / (dt / 1000);
        const extended = wrist.y < shY + 0.05; // hand around/above shoulder line
        if (speed > 1.6 && extended && nowMs > this.punchCooldown[side]) {
          this.queued = side;
          this.punchCooldown[side] = nowMs + 220;
        }
      }
    };
    detect(this._L, this.prevL, "L", lm[L_WRIST]);
    detect(this._R, this.prevR, "R", lm[R_WRIST]);
    this.prevL = { ...this._L };
    this.prevR = { ...this._R };
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
