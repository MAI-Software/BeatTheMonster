// Motion input. Captures two kinds of input from the body:
//  1) HEAD position (nose landmark) — the player moves their body so the head
//     follows the orbiting ball around the circle.
//  2) PUNCHES — left/right wrist thrust forward/out detects a jab; left vs right
//     half of the tracked sphere decides which fist (L/R) it counts as.
//
// Falls back to keyboard/mouse when no camera, so the game is fully testable headless.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
// ---------------- Keyboard / mouse fallback ----------------
export class KeyboardInput {
    constructor() {
        this.ready = true;
        this.kind = "keyboard";
        this._head = { x: 0.5, y: 0.5 };
        this.queued = null;
        this.onKey = (e) => {
            if (e.repeat)
                return;
            if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft")
                this.queued = "L";
            if (e.key === "d" || e.key === "D" || e.key === "ArrowRight")
                this.queued = "R";
        };
        this.onMove = (e) => {
            this._head = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
        };
        this.onTouch = (e) => {
            const t = e.touches[0];
            if (t)
                this._head = { x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight };
        };
        window.addEventListener("keydown", this.onKey);
        window.addEventListener("mousemove", this.onMove);
        window.addEventListener("touchmove", this.onTouch, { passive: true });
    }
    head() { return this._head; }
    fists() { return { L: { x: 0.3, y: 0.5 }, R: { x: 0.7, y: 0.5 } }; }
    consumePunch() { const p = this.queued; this.queued = null; return p; }
    update() { }
    stop() {
        window.removeEventListener("keydown", this.onKey);
        window.removeEventListener("mousemove", this.onMove);
        window.removeEventListener("touchmove", this.onTouch);
    }
}
// ---------------- Camera / MediaPipe pose ----------------
const NOSE = 0, L_WRIST = 15, R_WRIST = 16, L_SH = 11, R_SH = 12;
export class PoseInput {
    constructor() {
        this.ready = false;
        this.kind = "camera";
        this.landmarker = null;
        this.stream = null;
        this._head = { x: 0.5, y: 0.5 };
        this._L = { x: 0.35, y: 0.5 };
        this._R = { x: 0.65, y: 0.5 };
        this.prevL = null;
        this.prevR = null;
        this.prevT = 0;
        this.queued = null;
        this.punchCooldown = { L: 0, R: 0 };
        this.videoEl = document.createElement("video");
        this.videoEl.playsInline = true;
        this.videoEl.muted = true;
    }
    async init() {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
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
    update(nowMs) {
        if (!this.ready || !this.landmarker || this.videoEl.readyState < 2)
            return;
        const res = this.landmarker.detectForVideo(this.videoEl, nowMs);
        const lm = res.landmarks?.[0];
        if (!lm)
            return;
        // mirror x for selfie view
        const mx = (p) => 1 - p.x;
        this._head = { x: mx(lm[NOSE]), y: lm[NOSE].y };
        this._L = { x: mx(lm[L_WRIST]), y: lm[L_WRIST].y };
        this._R = { x: mx(lm[R_WRIST]), y: lm[R_WRIST].y };
        // punch detection: wrist moves up/forward fast relative to shoulder, with cooldown.
        const dt = Math.max(16, nowMs - this.prevT);
        this.prevT = nowMs;
        const shY = (lm[L_SH].y + lm[R_SH].y) / 2;
        const detect = (cur, prev, side, wrist) => {
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
    stop() {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.landmarker?.close();
        this.ready = false;
    }
}
export async function createInput(useCamera) {
    if (useCamera) {
        try {
            const p = new PoseInput();
            await p.init();
            return p;
        }
        catch (e) {
            console.warn("Camera init failed, falling back to keyboard:", e);
        }
    }
    return new KeyboardInput();
}
