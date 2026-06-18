// Combat scene v2. Renders the tracking circle split into two halves; each half
// fills from centre to the contour and the player punches that fist the moment it
// reaches the rim. A slim horizontal "weave" track decouples head movement (lean
// side to side, never crouch). Clock is driven by the selected SongPlayer for sync.
import type { Enemy } from "../data/enemies";
import { syntheticBeatmap } from "../data/beatmaps";
import type { EffectiveStats } from "../systems/progression";
import { Combat, type CombatResult } from "../systems/combat";
import type { FlowState } from "../data/flowStates";
import type { InputProvider } from "../systems/pose";
import type { SongPlayer } from "../systems/song";
import { unlockAudio } from "../systems/audio";
import { icon } from "./icons";

const COL = { L: "#5db4ff", R: "#ff8a4d", rim: "#2e3550", on: "#3bd28a", ball: "#ff5bd0", gold: "#ffd23b" };

export function runCombat(
  root: HTMLElement, enemy: Enemy, stats: EffectiveStats,
  flow: FlowState | null, input: InputProvider, song: SongPlayer
): Promise<CombatResult> {
  return new Promise((resolve) => {
    unlockAudio();
    const beatmap = syntheticBeatmap(enemy, song.beats, song.durationMs, (enemy.bpm | 0) + 7);
    const combat = new Combat(enemy, beatmap, stats, flow);

    root.innerHTML = `
      <div class="scene combat">
        <video id="cam" autoplay playsinline muted></video>
        <div class="cam-tint"></div>
        <canvas id="ring"></canvas>
        <div class="hud-top">
          <div class="enemy-bar">
            <div class="enemy-name">${enemy.name}<span>${enemy.title}</span></div>
            <div class="bar enemy"><i id="ehp" class="fill"></i></div>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="bar player"><i id="php" class="fill"></i><b id="phptext"></b></div>
          <div class="flow-row"><div class="bar flow"><i id="flowfill" class="fill"></i></div><span id="flowlabel"></span></div>
        </div>
        <div id="combo" class="combo"></div>
        <div id="countdown" class="countdown"></div>
        <button id="quit" class="quit">${icon("close", 18)}</button>
      </div>`;

    const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
    const video = $<HTMLVideoElement>("#cam");
    if (input.videoEl && input.kind === "camera") {
      video.srcObject = (input.videoEl.srcObject as MediaStream) ?? null;
    } else video.style.display = "none";

    const canvas = $<HTMLCanvasElement>("#ring");
    const ctx = canvas.getContext("2d")!;
    const ehp = $<HTMLElement>("#ehp"), php = $<HTMLElement>("#php"), phptext = $<HTMLElement>("#phptext");
    const comboEl = $<HTMLElement>("#combo"), flowfill = $<HTMLElement>("#flowfill"), flowlabel = $<HTMLElement>("#flowlabel");
    const countdown = $<HTMLElement>("#countdown");

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = root.clientWidth * dpr; canvas.height = root.clientHeight * dpr;
      canvas.style.width = root.clientWidth + "px"; canvas.style.height = root.clientHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); window.addEventListener("resize", resize);

    let raf = 0, quit = false, started = false;
    $<HTMLButtonElement>("#quit").onclick = () => { quit = true; };

    const t0 = performance.now();
    const COUNT = 2600;

    function loop(now: number) {
      const pre = now - t0 - COUNT;
      if (pre < 0) { countdown.textContent = String(Math.ceil(-pre / 1000)); }
      else {
        if (!started) { started = true; song.start(); }
        countdown.textContent = "";
        const songMs = song.timeMs();
        input.update(now);
        combat.update(songMs >= 0 ? songMs : 0, now, input);
        draw(songMs >= 0 ? songMs : 0, now);
      }
      if (pre < 0) draw(0, now);
      sync();

      if (quit) return finish({ won: false, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, enemyMaxHp: enemy.hp });
      if (combat.finished && combat.result) return finish(combat.result);
      if (started && song.durationMs > 0 && song.timeMs() > song.durationMs + 200 && !combat.finished) {
        // song ended -> resolve by remaining hp
        return finish({ won: combat.enemyHp <= combat.playerHp, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, enemyMaxHp: enemy.hp });
      }
      raf = requestAnimationFrame(loop);
    }

    function finish(r: CombatResult) {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize); song.stop();
      resolve(combat.result ?? r);
    }

    function drawHalfFill(cx: number, cy: number, R: number, side: "L" | "R", songMs: number) {
      const f = combat.fillFor(side, songMs);
      ctx.save();
      // clip to the half
      ctx.beginPath();
      if (side === "L") ctx.rect(cx - R - 4, cy - R - 4, R + 4, (R + 4) * 2);
      else ctx.rect(cx, cy - R - 4, R + 4, (R + 4) * 2);
      ctx.clip();
      const c = side === "L" ? COL.L : COL.R;
      if (f) {
        const fr = Math.min(1, f.p) * R;
        // radial gradient fill growing to the rim
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, fr));
        g.addColorStop(0, c + "22");
        g.addColorStop(0.7, c + (f.full ? "cc" : "66"));
        g.addColorStop(1, c + (f.full ? "ff" : "aa"));
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, fr), 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        if (f.full) {
          ctx.lineWidth = 6 + f.flash * 6; ctx.strokeStyle = c;
          ctx.shadowColor = c; ctx.shadowBlur = 24 * f.flash;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
    }

    function draw(songMs: number, now: number) {
      const w = root.clientWidth, h = root.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.46, R = Math.min(w, h) * 0.33;

      drawHalfFill(cx, cy, R, "L", songMs);
      drawHalfFill(cx, cy, R, "R", songMs);

      // outer contour
      ctx.lineWidth = 3; ctx.strokeStyle = COL.rim;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      // vertical divider
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

      // side labels (text, no emoji)
      ctx.font = "600 13px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#9fb0c8";
      ctx.fillText("IZQUIERDA", cx - R * 0.5, cy - R - 14);
      ctx.fillText("DERECHA", cx + R * 0.5, cy - R - 14);

      // "GOLPEA" prompt when a side is full
      const fl = combat.fillFor("L", songMs), fr = combat.fillFor("R", songMs);
      ctx.font = "800 20px system-ui";
      if (fl?.full) { ctx.fillStyle = COL.L; ctx.globalAlpha = fl.flash; ctx.fillText("¡GOLPEA!", cx - R * 0.5, cy); ctx.globalAlpha = 1; }
      if (fr?.full) { ctx.fillStyle = COL.R; ctx.globalAlpha = fr.flash; ctx.fillText("¡GOLPEA!", cx + R * 0.5, cy); ctx.globalAlpha = 1; }

      // weave track (horizontal lean) below circle — comfortable, no crouch
      const wy = cy + R + 42, half = R;
      ctx.strokeStyle = COL.rim; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - half, wy); ctx.lineTo(cx + half, wy); ctx.stroke();
      const tx = cx + combat.grooveX * half;     // target
      const hx = cx + combat.headX * half;       // head
      ctx.fillStyle = COL.ball; ctx.shadowColor = COL.ball; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(tx, wy, 9, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = combat.grooveOn ? COL.on : "#fff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hx, wy, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "600 11px system-ui"; ctx.fillStyle = "#9fb0c8";
      ctx.fillText("inclina la cabeza para esquivar", cx, wy + 28);

      // popups
      let i = 0;
      for (const pp of combat.popups) {
        const age = (now - pp.bornMs) / 850; if (age > 1) continue;
        ctx.globalAlpha = 1 - age; ctx.fillStyle = pp.color;
        ctx.font = `800 ${pp.kind === "super" || pp.kind === "flow" ? 30 : 24}px system-ui`;
        ctx.fillText(pp.text, cx, cy - R * 0.35 - age * 26 - i * 4);
        ctx.globalAlpha = 1; i++;
      }
    }

    function sync() {
      ehp.style.width = `${(combat.enemyHp / combat.enemyMaxHp) * 100}%`;
      php.style.width = `${(combat.playerHp / combat.playerMaxHp) * 100}%`;
      phptext.textContent = `${Math.ceil(combat.playerHp)} / ${combat.playerMaxHp}`;
      comboEl.innerHTML = combat.combo > 1
        ? `<b>${combat.combo}</b><small>COMBO</small>${combat.superCombo ? `<div class="super">SUPER ×2.5</div>` : ""}`
        : "";
      flowfill.style.width = `${combat.flowMeter}%`;
      const f = combat.flowRef();
      flowlabel.textContent = combat.flowActive ? `${f?.name ?? "FLOW"} ACTIVO` : f ? f.name : "Sin Flow";
      flowlabel.className = combat.flowActive ? "flow-on" : "";
    }

    raf = requestAnimationFrame(loop);
  });
}
