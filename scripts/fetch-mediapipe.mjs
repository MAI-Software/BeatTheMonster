// Generates public/mediapipe/ at build time so the heavy wasm + model are NOT committed
// to git. The wasm ships inside node_modules (@mediapipe/tasks-vision); the pose model is
// downloaded once and cached on disk. Runtime stays fully offline (assets get bundled into
// dist / the APK). Wired as a `prebuild`/`predev` npm hook — runs automatically.
import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDst = join(root, "public", "mediapipe", "wasm");
const modelDst = join(root, "public", "mediapipe", "models", "pose_landmarker_lite.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
// SIMD + nosimd, .js loader + .wasm — covers the full device range (minSdk 22).
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

mkdirSync(wasmDst, { recursive: true });
mkdirSync(dirname(modelDst), { recursive: true });

// 1) wasm — copy from node_modules (idempotent)
if (!existsSync(wasmSrc)) {
  console.error("[mediapipe] @mediapipe/tasks-vision not found in node_modules. Run `npm install` first.");
  process.exit(1);
}
let copied = 0;
for (const f of WASM_FILES) {
  const dst = join(wasmDst, f);
  if (existsSync(dst)) continue;
  copyFileSync(join(wasmSrc, f), dst);
  copied++;
}
console.log(`[mediapipe] wasm ready${copied ? ` (copied ${copied})` : " (cached)"}`);

// 2) model — download once, cache on disk
if (existsSync(modelDst) && statSync(modelDst).size > 1_000_000) {
  console.log("[mediapipe] model ready (cached)");
} else {
  if (typeof fetch !== "function") {
    console.error("[mediapipe] global fetch unavailable — use Node 18+ to download the model.");
    process.exit(1);
  }
  console.log("[mediapipe] downloading pose model (~5.5 MB)...");
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`[mediapipe] model download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(modelDst, buf);
  console.log(`[mediapipe] model ready (downloaded ${(buf.length / 1048576).toFixed(1)} MB)`);
}
