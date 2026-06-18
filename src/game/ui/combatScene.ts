// Combat scene v3. Phases: PREP (stand & align to camera + countdown) -> PLAY.
// Circle split into L/R halves that fill to the rim (punch when full). Dodge spheres
// appear on the outer rim (lean head to that side). Head shown as a dot sliding along
// the horizontal diameter — horizontal only, never a crouch. Clock from the SongPlayer.
import type { Enemy } from "../data/enemies";
import { buildBeatmap } from "../data/beatmaps";
import type { Difficulty } from "../data/difficulty";
import type { EffectiveStats } from "../systems/progression";
import { Combat, type CombatResult } from "../systems/combat";
import type { FlowState } from "../data/flowStates";
import type { InputProvider } from "../systems/pose";
import type { SongPlayer } from "../systems/song";
import { unlockAudio } from "../systems/audio";
import { icon } from "./icons";

const COL = { L: "#5db4ff", R: "#ff8a4d", rim: "#2e3550", on: "#3bd28a", head: "#ffffff", danger: "#ff5b6e", ball: "#ff5bd0" };

export function runCombat(
  root: HTMLElement, enemy: Enemy, stats: EffectiveStats, flow: FlowState | null,
  input: InputProvider, song: SongPlayer, diff: Difficulty
): Promise<CombatResult> {
  return new Promise((resolve) => {
    unlockAudio();
    const beatmap = buildBeatmap(song.beats, song.durationMs, enemy, diff, (enemy.bpm | 0) + 7);
    const combat = new Combat(enemy, beatmap, stats, flow, diff);

    root.innerHTML = `
      <div class="scene combat">
        <video id="cam" autoplay playsinline muted></video>
        <div class="cam-tint"></div>
        <canvas id="ring"></canvas>
        <div class="hud-top">
          <div class="enemy-bar"><div class="enemy-name">${enemy.name}<span>${enemy.title}</span></div>
            <div class="bar enemy"><i id="ehp" class="fill"></i></div></div>
        </div>
        <div class="hud-bottom">
          <div class="bar player"><i id="php" class="fill"></i><b id="phptext"></b></div>
          <div class="flow-row"><div class="bar flow"><i id="flowfill" class="fill"></i></div><span id="flowlabel"></span></div>
        </div>
        <div id="combo" class="combo"></div>
        <div id="prep" class="prep-overlay">
          <div class="prep-box">
            <h3>Prepárate · ${diff.name}</h3>
            <p>Ponte de pie frente a la cámara, cuerpo erguido y centrado. Alinea tu cabeza con la guía. Inclínate a los lados para esquivar; lanza puños cuando una mitad se llene.</p>
            <div id="prepstatus" class="prep-status">Centra tu cabeza…</div>
            <button id="prepstart" class="primary">${icon("play", 18)} Estoy listo</button>
          </div>
        </div>
        <div id="countdown" class="countdown"></div>
        <button id="quit" class="quit">${icon("close", 18)}</button>
      </div>`;

    const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
    const video = $<HTMLVideoElement>("#cam");
    const isCam = input.kind === "camera" && !!input.videoEl;
    if (isCam) video.srcObject = (input.videoEl!.srcObject as MediaStream) ?? null; else video.style.display = "none";

    const canvas = $<HTMLCanvasElement>("#ring"), ctx = canvas.getContext("2d")!;
    const ehp = $<HTMLElement>("#ehp"), php = $<HTMLElement>("#php"), phptext = $<HTMLElement>("#phptext");
    const comboEl = $<HTMLElement>("#combo"), flowfill = $<HTMLElement>("#flowfill"), flowlabel = $<HTMLElement>("#flowlabel");
    const countdown = $<HTMLElement>("#countdown"), prep = $<HTMLElement>("#prep"), prepstatus = $<HTMLElement>("#prepstatus");

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = root.clientWidth * dpr; canvas.height = root.clientHeight * dpr;
      canvas.style.width = root.clientWidth + "px"; canvas.style.height = root.clientHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); window.addEventListener("resize", resize);

    let raf = 0, quit = false;
    let phase: "prep" | "countdown" | "play" = "prep";
    let countStart = 0, holdStart = 0;
    $<HTMLButtonElement>("#quit").onclick = () => { quit = true; };
    $<HTMLButtonElement>("#prepstart").onclick = () => beginCountdown();

    function beginCountdown() { if (phase !== "prep") return; phase = "countdown"; countStart = performance.now(); prep.style.display = "none"; }

    function headX(): number { return Math.max(-1, Math.min(1, (input.head().x - 0.5) * 2)); }

    function loop(now: number) {
      input.update(now);
      if (phase === "prep") {
        // auto-ready when head held near centre (camera); button always works
        const centered = Math.abs(headX()) < 0.22;
        if (isCam) {
          if (centered) { if (!holdStart) holdStart = now; const held = now - holdStart;
            prepstatus.textContent = `Mantén… ${Math.max(0, (1.4 - held / 1000)).toFixed(1)}s`;
            if (held > 1400) beginCountdown();
          } else { holdStart = 0; prepstatus.textContent = "Centra tu cabeza…"; }
        } else prepstatus.textContent = "Pulsa Estoy listo para empezar.";
        drawPrep();
      } else if (phase === "countdown") {
        const left = 2600 - (now - countStart);
        countdown.textContent = left > 0 ? String(Math.ceil(left / 1000)) : "¡YA!";
        drawPrep();
        if (left <= 0) { phase = "play"; song.start(); countdown.textContent = ""; }
      } else {
        const songMs = Math.max(0, song.timeMs());
        combat.update(songMs, now, input);
        draw(songMs, now);
        if (song.durationMs > 0 && song.timeMs() > song.durationMs + 200 && !combat.finished)
          combat.forceEnd(combat.enemyHp <= combat.playerHp);
      }
      sync();

      if (quit) return finish({ won: false, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, dodges: 0, enemyMaxHp: enemy.hp });
      if (combat.finished && combat.result) return finish(combat.result);
      raf = requestAnimationFrame(loop);
    }

    function finish(r: CombatResult) {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize); song.stop();
      resolve(combat.result ?? r);
    }

    function geom() { const w = root.clientWidth, h = root.clientHeight; return { w, h, cx: w / 2, cy: h * 0.46, R: Math.min(w, h) * 0.33 }; }

    function drawRing(cx: number, cy: number, R: number) {
      ctx.lineWidth = 3; ctx.strokeStyle = COL.rim;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.font = "600 13px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#9fb0c8";
      ctx.fillText("IZQUIERDA", cx - R * 0.5, cy - R - 14);
      ctx.fillText("DERECHA", cx + R * 0.5, cy - R - 14);
    }
    function drawHeadDot(cx: number, cy: number, R: number, hx: number, glow = false) {
      const x = cx + hx * R;
      ctx.strokeStyle = glow ? COL.on : COL.head; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, cy, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = glow ? COL.on : "#fff"; ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill();
    }

    // overlay markers for what the camera tracks: head + both hands, in screen space
    function drawTracking() {
      if (!isCam) return;
      const t = input.tracking?.(); if (!t || !t.detected) return;
      const { w, h } = geom();
      const dot = (p: { x: number; y: number }, col: string, r: number, label: string) => {
        const x = p.x * w, y = p.y * h;
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.font = "700 10px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#0009";
        ctx.fillText(label, x, y - r - 4); ctx.fillStyle = "#fff"; ctx.fillText(label, x, y - r - 5);
      };
      dot(t.head, "#ffffff", 9, "CABEZA");
      dot(t.L, COL.L, 11, "IZQ");
      dot(t.R, COL.R, 11, "DER");
    }

    function drawPrep() {
      const { w, h, cx, cy, R } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      drawRing(cx, cy, R);
      // centre guide
      ctx.setLineDash([6, 6]); ctx.strokeStyle = "#9fb0c8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      drawHeadDot(cx, cy, R, headX(), Math.abs(headX()) < 0.22);
    }

    function drawHalfFill(cx: number, cy: number, R: number, side: "L" | "R", songMs: number) {
      const f = combat.fillFor(side, songMs); if (!f) return;
      ctx.save();
      ctx.beginPath();
      if (side === "L") ctx.rect(cx - R - 4, cy - R - 4, R + 4, (R + 4) * 2); else ctx.rect(cx, cy - R - 4, R + 4, (R + 4) * 2);
      ctx.clip();
      const c = side === "L" ? COL.L : COL.R, fr = Math.min(1, f.p) * R;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, fr));
      g.addColorStop(0, c + "22"); g.addColorStop(0.7, c + (f.full ? "cc" : "66")); g.addColorStop(1, c + (f.full ? "ff" : "aa"));
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, fr), 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      if (f.full) { ctx.lineWidth = 6 + f.flash * 6; ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 24 * f.flash; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
      ctx.restore();
    }

    function drawDodge(cx: number, cy: number, R: number, songMs: number) {
      const d = combat.dodgeState(songMs); if (!d) return;
      const x = cx + (d.side === "L" ? -R : R), y = cy;
      // incoming telegraph ring shrinking onto the sphere
      const rr = 14 + (1 - d.p) * 60;
      ctx.strokeStyle = d.aligned ? COL.on : COL.danger; ctx.lineWidth = 4; ctx.globalAlpha = 0.5 + d.p * 0.5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      // the dodge sphere on the rim
      ctx.fillStyle = d.aligned ? COL.on : COL.danger; ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = d.inWindow ? 26 : 12;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = "800 16px system-ui"; ctx.fillStyle = d.aligned ? COL.on : "#fff"; ctx.textAlign = "center";
      ctx.fillText(d.side === "L" ? "ESQUIVA ←" : "→ ESQUIVA", cx, cy - R * 0.62);
    }

    function draw(songMs: number, now: number) {
      const { w, h, cx, cy, R } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      drawHalfFill(cx, cy, R, "L", songMs); drawHalfFill(cx, cy, R, "R", songMs);
      drawRing(cx, cy, R);
      drawDodge(cx, cy, R, songMs);
      // full prompt
      const fl = combat.fillFor("L", songMs), fr = combat.fillFor("R", songMs);
      ctx.font = "800 20px system-ui"; ctx.textAlign = "center";
      if (fl?.full) { ctx.fillStyle = COL.L; ctx.globalAlpha = fl.flash; ctx.fillText("¡GOLPEA!", cx - R * 0.5, cy); ctx.globalAlpha = 1; }
      if (fr?.full) { ctx.fillStyle = COL.R; ctx.globalAlpha = fr.flash; ctx.fillText("¡GOLPEA!", cx + R * 0.5, cy); ctx.globalAlpha = 1; }
      const d = combat.dodgeState(songMs);
      drawHeadDot(cx, cy, R, combat.headX, !!d?.aligned);
      // popups
      let i = 0;
      for (const pp of combat.popups) {
        const age = (now - pp.bornMs) / 850; if (age > 1) continue;
        ctx.globalAlpha = 1 - age; ctx.fillStyle = pp.color;
        ctx.font = `800 ${pp.kind === "super" || pp.kind === "flow" ? 30 : 24}px system-ui`;
        ctx.fillText(pp.text, cx, cy - R * 0.32 - age * 26 - i * 4); ctx.globalAlpha = 1; i++;
      }
    }

    function sync() {
      ehp.style.width = `${(combat.enemyHp / combat.enemyMaxHp) * 100}%`;
      php.style.width = `${(combat.playerHp / combat.playerMaxHp) * 100}%`;
      phptext.textContent = `${Math.ceil(combat.playerHp)} / ${combat.playerMaxHp}`;
      comboEl.innerHTML = combat.combo > 1 ? `<b>${combat.combo}</b><small>COMBO</small>${combat.superCombo ? `<div class="super">SUPER ×2.5</div>` : ""}` : "";
      flowfill.style.width = `${combat.flowMeter}%`;
      const f = combat.flowRef();
      flowlabel.textContent = combat.flowActive ? `${f?.name ?? "FLOW"} ACTIVO` : f ? f.name : "Sin Flow";
      flowlabel.className = combat.flowActive ? "flow-on" : "";
    }

    raf = requestAnimationFrame(loop);
  });
}
