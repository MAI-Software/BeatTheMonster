// Shared coach spotlight engine: dims the screen with a "hole" over a target, a red
// arrow, and a big coach bubble on the right. Drives multi-target, multi-line guided
// sequences (menus, prefight, combat stages, result screen) from one place so the
// hole/bubble/coach positioning logic only lives once. No dependency on `App` — the
// target can be a live DOM element (menus/prefight/result) or a synthetic DOMRect
// (canvas-relative regions in combat).
import { COACH_NAME } from "../data/coach";

export interface GuideStep {
  target: () => HTMLElement | DOMRect | null;
  lines: string[]; // pre-chunked to ≤3 lines each; bubble taps advance line-by-line
  actionable?: boolean; // true = only tapping the target rect proceeds (forwards a real click); bubble taps only page through this step's lines
}

function rectOf(t: HTMLElement | DOMRect): DOMRect {
  return t instanceof HTMLElement ? t.getBoundingClientRect() : t;
}
function inRect(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// Returns a close() handle so the caller can tear the overlay down early (e.g. the
// player quits combat mid-tutorial).
export function showSpotlight(coachImg: string, steps: GuideStep[], opts?: { onDone?: () => void }): () => void {
  document.querySelectorAll(".guide-fx").forEach((e) => e.remove());
  let si = 0, li = 0;
  const g = document.createElement("div");
  g.className = "guide-fx";
  g.innerHTML = `<div class="guide-hole"></div>
    <div class="guide-arrow">▼</div>
    <img class="gb-coach" src="${coachImg}" alt="" onerror="this.remove()">
    <div class="guide-bubble"><div class="gb-txt"><span class="gb-name">${COACH_NAME}</span><span class="gb-line"></span></div></div>`;
  document.body.appendChild(g);
  const hole = g.querySelector<HTMLElement>(".guide-hole")!;
  const arrow = g.querySelector<HTMLElement>(".guide-arrow")!;
  const bubble = g.querySelector<HTMLElement>(".guide-bubble")!;
  const line = g.querySelector<HTMLElement>(".gb-line")!;
  const coach = g.querySelector<HTMLElement>(".gb-coach");

  const paintText = () => {
    const cur = steps[si];
    const isLastLine = li === cur.lines.length - 1;
    const isLastStep = si === steps.length - 1;
    const showNext = !(isLastLine && isLastStep); // hide the hint on the very final line
    line.innerHTML = cur.lines[li] + (showNext ? `<div class="gb-next">Toca para continuar</div>` : "");
  };
  paintText();

  const close = () => { g.remove(); };
  const finish = () => { close(); opts?.onDone?.(); };
  const bubbleTap = () => {
    const cur = steps[si];
    if (li < cur.lines.length - 1) { li++; paintText(); return; }
    if (cur.actionable) return; // must land the real tap on the target to proceed
    if (si < steps.length - 1) { si++; li = 0; paintText(); return; }
    finish();
  };

  const pad = 8;
  // reposition against the CURRENT step's target rect. Runs on a rAF loop (real devices)
  // AND on fixed-delay timers, so it still settles where rAF is throttled (e.g. a
  // backgrounded preview tab) and after the target grows late (its image loads).
  const reposition = () => {
    if (!g.isConnected) return;
    const t = steps[si].target();
    if (!t) return; // target not mounted yet — keep last known position, retry next frame
    const r = rectOf(t); const H = window.innerHeight, W = window.innerWidth;
    hole.style.left = `${r.left - pad}px`; hole.style.top = `${r.top - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`; hole.style.height = `${r.height + pad * 2}px`;
    // box never at the top. If the target sits low (would be covered by a bottom box),
    // put the box ABOVE the target with the arrow pointing DOWN; otherwise box at the
    // bottom with the arrow pointing UP at the target.
    const targetLow = r.top > H * 0.5;
    arrow.style.left = `${r.left + r.width / 2}px`;
    if (targetLow) {
      bubble.style.top = "auto"; bubble.style.bottom = `${Math.round(H - r.top + 14)}px`;
      arrow.textContent = "▼"; arrow.style.top = `${r.top - 14}px`; arrow.style.transform = "translate(-50%,-100%)";
    } else {
      bubble.style.top = "auto"; bubble.style.bottom = "calc(env(safe-area-inset-bottom) + 20px)";
      arrow.textContent = "▲"; arrow.style.top = `${r.bottom + 6}px`; arrow.style.transform = "translate(-50%,0)";
    }
    // coach emerges BIG from behind the box, on its RIGHT side (bottom sits at the box
    // bottom, legs hidden; rises well above the box top). Box paints over it (later in DOM).
    if (coach) {
      const br = bubble.getBoundingClientRect();
      coach.style.bottom = `${Math.round(H - br.bottom)}px`;
      coach.style.height = `${Math.round(br.height + 270)}px`;
      coach.style.left = "auto";
      coach.style.right = `${Math.round(W - br.right + 8)}px`;
    }
  };
  const loop = () => { if (!g.isConnected) return; reposition(); requestAnimationFrame(loop); };
  loop();
  [90, 250, 550, 1000, 1600].forEach((ms) => setTimeout(() => { if (g.isConnected) reposition(); }, ms));

  g.onclick = (e) => {
    const cur = steps[si];
    const t = cur.target();
    if (t) {
      const r = rectOf(t);
      if (inRect(e.clientX, e.clientY, r)) {
        if (cur.actionable) { if (t instanceof HTMLElement) t.click(); finish(); return; }
        bubbleTap(); return;
      }
    }
    const br = bubble.getBoundingClientRect();
    if (inRect(e.clientX, e.clientY, br)) { bubbleTap(); return; }
    if (!cur.actionable) bubbleTap(); // informational step: any tap in the dark scene advances too
  };

  return close;
}
