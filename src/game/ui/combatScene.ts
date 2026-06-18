// Combat scene: owns the canvas, render loop, and song clock. Draws the tracking
// circle (4 points + 2 vertical halves), orbiting ball, head marker, approaching
// notes, and the full battle HUD. Resolves with the CombatResult when the fight ends.
import { POINTS } from "../data/beatmaps";
import type { Enemy } from "../data/enemies";
import { generateBeatmap } from "../data/beatmaps";
import type { EffectiveStats } from "../systems/progression";
import { Combat, type CombatResult } from "../systems/combat";
import type { FlowState } from "../data/flowStates";
import type { InputProvider } from "../systems/pose";
import { unlockAudio } from "../systems/audio";

export function runCombat(
  root: HTMLElement,
  enemy: Enemy,
  stats: EffectiveStats,
  flow: FlowState | null,
  input: InputProvider,
  seed: number
): Promise<CombatResult> {
  return new Promise((resolve) => {
    unlockAudio();
    const beatmap = generateBeatmap(enemy, seed);
    const combat = new Combat(enemy, beatmap, stats, flow);

    root.innerHTML = `
      <div class="scene combat">
        <video id="cam" autoplay playsinline muted></video>
        <canvas id="ring"></canvas>
        <div class="hud-top">
          <div class="enemy-bar">
            <div class="enemy-name">${enemy.name} <span>· ${enemy.title}</span></div>
            <div class="bar enemy"><div id="ehp" class="fill"></div></div>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="bar player"><div id="php" class="fill"></div><span id="phptext"></span></div>
          <div class="flow-row">
            <div class="bar flow"><div id="flowfill" class="fill"></div></div>
            <span id="flowlabel"></span>
          </div>
        </div>
        <div id="combo" class="combo"></div>
        <div id="countdown" class="countdown"></div>
        <button id="quit" class="quit">✕</button>
      </div>`;

    const video = root.querySelector<HTMLVideoElement>("#cam")!;
    if (input.videoEl && input.kind === "camera") {
      video.srcObject = (input.videoEl.srcObject as MediaStream) ?? null;
      video.style.display = "block";
    } else {
      video.style.display = "none";
    }

    const canvas = root.querySelector<HTMLCanvasElement>("#ring")!;
    const ctx = canvas.getContext("2d")!;
    const ehp = root.querySelector<HTMLDivElement>("#ehp")!;
    const php = root.querySelector<HTMLDivElement>("#php")!;
    const phptext = root.querySelector<HTMLSpanElement>("#phptext")!;
    const comboEl = root.querySelector<HTMLDivElement>("#combo")!;
    const flowfill = root.querySelector<HTMLDivElement>("#flowfill")!;
    const flowlabel = root.querySelector<HTMLSpanElement>("#flowlabel")!;
    const countdown = root.querySelector<HTMLDivElement>("#countdown")!;

    function resize() {
      canvas.width = root.clientWidth;
      canvas.height = root.clientHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let quit = false;
    root.querySelector<HTMLButtonElement>("#quit")!.onclick = () => {
      quit = true;
    };

    const startDelay = 2600; // countdown
    const t0 = performance.now();

    function loop(now: number) {
      const elapsed = now - t0;
      const songMs = elapsed - startDelay;

      // countdown
      if (songMs < 0) {
        const n = Math.ceil(-songMs / 1000);
        countdown.textContent = n > 0 ? String(n) : "¡YA!";
      } else {
        countdown.textContent = "";
        input.update(now);
        combat.update(songMs, now, input);
      }

      draw(songMs);
      sync();

      if (quit) {
        cleanup();
        resolve({ won: false, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, enemyMaxHp: enemy.hp });
        return;
      }
      if (combat.finished && combat.result) {
        cleanup();
        resolve(combat.result);
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    function draw(songMs: number) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.5;
      const R = Math.min(w, h) * 0.34;

      // dim camera overlay
      ctx.fillStyle = "rgba(8,8,18,0.45)";
      ctx.fillRect(0, 0, w, h);

      // outer ring
      ctx.lineWidth = 6;
      ctx.strokeStyle = combat.headOnBall ? "#3bd28a" : "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // vertical halves divider (splits L/R fists)
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      // L / R labels
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("IZQ", cx - R * 0.6, cy - R - 12);
      ctx.fillText("DER", cx + R * 0.6, cy - R - 12);

      // 4 cardinal points
      for (const a of POINTS) {
        const px = cx + Math.cos(a) * R;
        const py = cy - Math.sin(a) * R;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
      }

      if (songMs >= 0) {
        // approaching notes: ring shrinking onto target point
        for (const n of combat.activeNotes(songMs)) {
          const lead = Math.max(0, combat.noteLead(n, songMs));
          const px = cx + Math.cos(n.angle) * R;
          const py = cy - Math.sin(n.angle) * R;
          const rr = 10 + lead * 46;
          ctx.strokeStyle = n.side === "L" ? "#7fd8ff" : "#ff9f6b";
          ctx.lineWidth = 4;
          ctx.globalAlpha = 1 - lead * 0.5;
          ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // orbiting ball (the head target)
        const bx = cx + Math.cos(combat.ballAngle) * R;
        const by = cy - Math.sin(combat.ballAngle) * R;
        ctx.fillStyle = combat.flowActive ? "#ffd23b" : "#ff5bd0";
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // head marker
        const hx = cx + Math.cos(combat.headAngle) * R;
        const hy = cy - Math.sin(combat.headAngle) * R;
        ctx.strokeStyle = combat.headOnBall ? "#3bd28a" : "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(hx, hy, 22, 0, Math.PI * 2); ctx.stroke();
      }

      // popups
      const now = performance.now();
      let i = 0;
      for (const pp of combat.popups) {
        const age = (now - pp.bornMs) / 900;
        if (age > 1) continue;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = pp.color;
        ctx.font = "bold 26px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(pp.text, cx, cy + R + 50 + i * 6 - age * 30);
        ctx.globalAlpha = 1;
        i++;
      }
    }

    function sync() {
      ehp.style.width = `${(combat.enemyHp / combat.enemyMaxHp) * 100}%`;
      php.style.width = `${(combat.playerHp / combat.playerMaxHp) * 100}%`;
      phptext.textContent = `VT ${Math.ceil(combat.playerHp)}/${combat.playerMaxHp}`;
      comboEl.innerHTML =
        combat.combo > 1
          ? `<b>${combat.combo}</b> combo${combat.superCombo ? `<div class="super">SUPER ×2.5</div>` : ""}`
          : "";
      flowfill.style.width = `${combat.flowMeter}%`;
      const f = combat.flowRef();
      flowlabel.textContent = combat.flowActive
        ? `⚡ ${f?.name ?? "FLOW"} ACTIVO`
        : f
        ? f.name
        : "Sin Flow";
      flowlabel.className = combat.flowActive ? "flow-on" : "";
    }

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    }

    raf = requestAnimationFrame(loop);
  });
}
