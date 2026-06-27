// Generates app icon + splash source PNGs from the game's OWN title logo (public/title.webp),
// composited on the brand's dark cosmic backdrop, so the launcher/splash match the game art.
// Run: node tools/gen-assets.mjs   (then: npx capacitor-assets generate --android)
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("assets", { recursive: true });
const TITLE = "public/title.webp";

// Dark cosmic backdrop with rhythm rings + a red brand glow (matches the title's red/black art).
const cosmicBg = (W) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.44" r="0.8">
      <stop offset="0" stop-color="#3a1d5c"/><stop offset="0.55" stop-color="#1a0e2e"/><stop offset="1" stop-color="#0a0a12"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e7202b" stop-opacity="0.45"/><stop offset="1" stop-color="#e7202b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${W}" fill="url(#bg)"/>
  <g fill="none" stroke="#a855f7" stroke-opacity="0.14">
    <circle cx="${W / 2}" cy="${W * 0.47}" r="${W * 0.30}" stroke-width="${W * 0.012}"/>
    <circle cx="${W / 2}" cy="${W * 0.47}" r="${W * 0.39}" stroke-width="${W * 0.012}"/>
    <circle cx="${W / 2}" cy="${W * 0.47}" r="${W * 0.47}" stroke-width="${W * 0.012}"/>
  </g>
  <circle cx="${W / 2}" cy="${W * 0.47}" r="${W * 0.34}" fill="url(#glow)"/>
</svg>`;

const renderBg = (W) =>
  new Resvg(cosmicBg(W), { fitTo: { mode: "width", value: W }, background: "rgba(0,0,0,0)" }).render().asPng();

// Place the title (fit to `frac` of the canvas width) centered, optionally over a background.
async function compose(W, frac, bg) {
  const t = await sharp(TITLE).resize({ width: Math.round(W * frac) }).png().toBuffer();
  const m = await sharp(t).metadata();
  const base = bg ?? (await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
  return sharp(base)
    .composite([{ input: t, top: Math.round((W - (m.height ?? W)) / 2), left: Math.round((W - (m.width ?? W)) / 2) }])
    .png()
    .toBuffer();
}

const out = (buf, f) => { writeFileSync(`assets/${f}`, buf); console.log(`  assets/${f}`); };

console.log("Rendering title-based assets...");
const bg1024 = renderBg(1024);
out(await compose(1024, 0.95, bg1024), "icon-only.png");
out(await compose(1024, 0.95, bg1024), "logo.png");
out(await compose(1024, 0.90, null), "icon-foreground.png"); // transparent foreground (adaptive inset shrinks it)
out(renderBg(1024), "icon-background.png");
out(await compose(2732, 0.5, renderBg(2732)), "splash.png");
out(await compose(2732, 0.5, renderBg(2732)), "splash-dark.png");
console.log("Done.");
