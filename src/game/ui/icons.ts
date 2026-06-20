// Inline SVG icon set. No emojis anywhere. All use currentColor so CSS controls hue.
// Each returns an <svg> string; size via the `s` param (px).

type IconName =
  | "coin" | "gem" | "glove" | "boot" | "headband" | "charm"
  | "bolt" | "trophy" | "calendar" | "dumbbell" | "fist" | "target"
  | "play" | "back" | "close" | "lock" | "check" | "star" | "note" | "swords";

const P: Record<IconName, string> = {
  coin: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/>`,
  gem: `<path d="M6 3h12l3 5-9 13L3 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 8h18M9 3 7 8l5 13 5-13-2-5" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  glove: `<path d="M7 9V5a2 2 0 0 1 4 0v4m0-1a2 2 0 0 1 4 0v1m0-1a2 2 0 0 1 3 1.5V14a6 6 0 0 1-6 6H10a5 5 0 0 1-5-5v-3a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  boot: `<path d="M7 3h3v8l8 4a3 3 0 0 1 1.5 2.6V21H5a2 2 0 0 1-2-2v-3l4-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  headband: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 9h15M16 17l3 4M14 18l2 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  charm: `<path d="M12 21s-7-4.3-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 4.5C19 16.7 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  trophy: `<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  dumbbell: `<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  fist: `<path d="M5 11V8a2 2 0 0 1 4 0m0 0V6a2 2 0 0 1 4 0v2m0 0a2 2 0 0 1 4 0v5a6 6 0 0 1-6 6H9a4 4 0 0 1-4-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  target: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  play: `<path d="M7 5l12 7-12 7z" fill="currentColor"/>`,
  back: `<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  lock: `<rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>`,
  check: `<path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  star: `<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  note: `<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>`,
  swords: `<path d="M14 4h6v6M20 4l-8 8M10 4H4v6M4 4l16 16M14 14l6 6h-6v-6M10 14l-6 6h6v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
};

export function icon(name: IconName, s = 20): string {
  return `<svg class="ic ic-${name}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${P[name]}</svg>`;
}

export type { IconName };

// ---- swappable game-icon placeholders ----
// Each game icon tries an image at public/icons/<name>.(png) and falls back to an
// emoji placeholder. Drop real icons later to replace them one by one.
export type GIconName =
  | "campaign" | "practice" | "tutorial" | "training" | "equip" | "gacha"
  | "challenges" | "ranking" | "coin" | "gem" | "flow" | "vt" | "atk" | "def";

const EMOJI: Record<GIconName, string> = {
  campaign: "⚔️", practice: "🎯", tutorial: "🥊", training: "💪", equip: "🧤", gacha: "🎰",
  challenges: "📅", ranking: "🏆", coin: "🪙", gem: "💎", flow: "⚡", vt: "❤️", atk: "👊", def: "🛡️",
};

// install the onerror fallback once
if (typeof window !== "undefined" && !(window as any).__iconFail) {
  (window as any).__iconFail = (el: HTMLElement, emoji: string) => {
    const s = document.createElement("span");
    s.className = "gi-emoji"; s.textContent = emoji;
    s.style.fontSize = (el.getAttribute("width") || "20") + "px";
    el.replaceWith(s);
  };
}

export function gicon(name: GIconName, size = 24): string {
  return `<img class="gi" width="${size}" height="${size}" src="icons/${name}.png" alt="" onerror="window.__iconFail(this,'${EMOJI[name]}')">`;
}
