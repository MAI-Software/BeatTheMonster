// Generates source app-icon + splash PNGs for @capacitor/assets.
// Theme: Monsters Boxing Hero — boxing glove over a cosmic rhythm backdrop.
// Run: node tools/gen-assets.mjs   (then: npx capacitor-assets generate --android)
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("assets", { recursive: true });

// ---- shared building blocks -------------------------------------------------
const gloveDefs = `
  <linearGradient id="glove" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffd24a"/>
    <stop offset="0.45" stop-color="#ff7a18"/>
    <stop offset="1" stop-color="#e11d48"/>
  </linearGradient>
  <linearGradient id="cuff" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fdebc6"/>
    <stop offset="1" stop-color="#dcab68"/>
  </linearGradient>`;

// Boxing glove, fist-up, drawn in a 512x512 design box. Returns a <g> placed by
// scale s and translation (tx,ty) into the target canvas.
const glove = (s, tx, ty) => `
<g transform="translate(${tx} ${ty}) scale(${s})">
  <g transform="translate(0 12)" opacity="0.28">
    <path d="M160 250 Q160 90 256 90 Q360 90 360 250 L360 360 Q360 384 336 384 L176 384 Q160 384 160 360 Z" fill="#000"/>
  </g>
  <rect x="150" y="356" width="212" height="86" rx="26" fill="url(#cuff)"/>
  <rect x="150" y="356" width="212" height="18" rx="9" fill="#000" opacity="0.16"/>
  <rect x="234" y="350" width="40" height="98" rx="12" fill="url(#cuff)"/>
  <circle cx="254" cy="399" r="8" fill="#9a3412"/>
  <path d="M168 250 Q116 250 116 300 Q116 342 168 332 Z" fill="url(#glove)"/>
  <path d="M160 250 Q160 90 256 90 Q360 90 360 250 L360 360 Q360 372 348 372 L172 372 Q160 372 160 360 Z" fill="url(#glove)"/>
  <g stroke="#9a3412" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.5">
    <path d="M212 122 L212 236"/>
    <path d="M258 110 L258 242"/>
    <path d="M304 122 L304 236"/>
    <path d="M170 270 Q150 292 168 314"/>
  </g>
  <ellipse cx="214" cy="166" rx="40" ry="58" fill="#ffffff" opacity="0.20"/>
</g>`;

const cosmicBg = (W) => `
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.78">
    <stop offset="0" stop-color="#3a1d5c"/>
    <stop offset="0.55" stop-color="#1a0e2e"/>
    <stop offset="1" stop-color="#0a0a12"/>
  </radialGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ff7a18" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#ff7a18" stop-opacity="0"/>
  </radialGradient>`;

const rings = (cx, cy, base) => `
<g fill="none" stroke="#a855f7" stroke-opacity="0.16">
  <circle cx="${cx}" cy="${cy}" r="${base}" stroke-width="${base*0.02}"/>
  <circle cx="${cx}" cy="${cy}" r="${base*1.3}" stroke-width="${base*0.02}"/>
  <circle cx="${cx}" cy="${cy}" r="${base*1.58}" stroke-width="${base*0.02}"/>
</g>`;

// ---- SVG documents ----------------------------------------------------------
// Glove geometric center in design box ≈ (239, 266).
const ICON_BG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${cosmicBg(1024)}</defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${rings(512, 470, 300)}
  <circle cx="512" cy="470" r="300" fill="url(#glow)"/>
</svg>`;

const ICON_FG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${gloveDefs}</defs>
  ${glove(1.5, 512 - 239*1.5, 512 - 266*1.5)}
</svg>`;

const ICON_FULL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${cosmicBg(1024)}${gloveDefs}</defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${rings(512, 480, 300)}
  <circle cx="512" cy="480" r="300" fill="url(#glow)"/>
  ${glove(1.42, 512 - 239*1.42, 512 - 266*1.42)}
</svg>`;

const SPLASH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <defs>${cosmicBg(2732)}${gloveDefs}</defs>
  <rect width="2732" height="2732" fill="url(#bg)"/>
  ${rings(1366, 1366, 620)}
  <circle cx="1366" cy="1366" r="640" fill="url(#glow)"/>
  ${glove(2.3, 1366 - 239*2.3, 1366 - 266*2.3)}
</svg>`;

// ---- render -----------------------------------------------------------------
const render = (svg, w, file) => {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: w },
    background: "rgba(0,0,0,0)",
  }).render().asPng();
  writeFileSync(`assets/${file}`, png);
  console.log(`  assets/${file}  (${w}px, ${(png.length/1024).toFixed(0)} KB)`);
};

console.log("Rendering source assets...");
render(ICON_BG, 1024, "icon-background.png");
render(ICON_FG, 1024, "icon-foreground.png");
render(ICON_FULL, 1024, "icon-only.png");
render(ICON_FULL, 1024, "logo.png");
render(SPLASH, 2732, "splash.png");
render(SPLASH, 2732, "splash-dark.png");
console.log("Done.");
