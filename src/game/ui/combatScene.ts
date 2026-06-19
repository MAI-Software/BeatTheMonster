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

    function geom() { const w = root.clientWidth, h = root.clientHeight; return { w, h, cx: w / 2, cy: h * 0.48, R: Math.min(w, h) * 0.32 }; }

    interface Tri { w: number; h: number; cx: number; cy: number; R: number; baseHalf: number; baseY: number; apexY: number; apex: { x: number; y: number }; BL: { x: number; y: number }; BR: { x: number; y: number } }
    // Boxer-guard triangle: apex on top = the head, slipping left/right organically
    // with a small idle bob. Base = the guard. lean in [-1,1].
    function tri(lean: number, now: number): Tri {
      const { w, h, cx, cy, R } = geom();
      const baseHalf = R * 1.0, baseY = cy + R * 0.78, apexY = cy - R * 1.02;
      const bobX = Math.sin(now / 620) * 4, bobY = Math.sin(now / 470) * 3;
      const apex = { x: cx + lean * baseHalf * 0.72 + bobX, y: apexY + bobY };
      return { w, h, cx, cy, R, baseHalf, baseY, apexY, apex, BL: { x: cx - baseHalf, y: baseY }, BR: { x: cx + baseHalf, y: baseY } };
    }
    function triPath(g: Tri) { ctx.beginPath(); ctx.moveTo(g.apex.x, g.apex.y); ctx.lineTo(g.BR.x, g.BR.y); ctx.lineTo(g.BL.x, g.BL.y); ctx.closePath(); }

    function drawGuard(g: Tri) {
      triPath(g); ctx.lineWidth = 3; ctx.strokeStyle = COL.rim; ctx.lineJoin = "round"; ctx.stroke();
      // centre divider (L/R fists)
      ctx.beginPath(); ctx.moveTo(g.cx, g.baseY); ctx.lineTo(g.cx, g.apexY + g.R * 0.5); ctx.stroke();
      // guard gloves at the base corners
      for (const corner of [g.BL, g.BR]) { ctx.fillStyle = "#0006"; ctx.beginPath(); ctx.arc(corner.x, corner.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COL.rim; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.font = "600 12px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#9fb0c8";
      ctx.fillText("IZQ", g.cx - g.baseHalf * 0.45, g.baseY + 22);
      ctx.fillText("DER", g.cx + g.baseHalf * 0.45, g.baseY + 22);
    }

    function drawHead(g: Tri, glow: boolean) {
      const { x, y } = g.apex; const r = Math.max(22, g.R * 0.13);
      ctx.save();
      ctx.shadowColor = glow ? COL.on : COL.head; ctx.shadowBlur = glow ? 30 : 16;
      ctx.fillStyle = glow ? COL.on : "#10131f"; ctx.strokeStyle = glow ? "#eaffe9" : COL.head; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = glow ? "#06210f" : "#fff";
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.12, 2.2, 0, Math.PI * 2); ctx.arc(x + r * 0.3, y - r * 0.12, 2.2, 0, Math.PI * 2); ctx.fill();
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
        ctx.font = "700 10px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
        ctx.fillText(label, x, y - r - 5);
      };
      dot(t.head, "#ffffff", 9, "CABEZA");
      dot(t.L, COL.L, 11, "IZQ");
      dot(t.R, COL.R, 11, "DER");
    }

    function drawPrep() {
      const { w, h } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      const g = tri(headX(), performance.now());
      drawGuard(g);
      // centre guide line for aligning the head
      ctx.setLineDash([6, 6]); ctx.strokeStyle = "#9fb0c8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.cx, g.apexY - 20); ctx.lineTo(g.cx, g.apexY + 20); ctx.stroke(); ctx.setLineDash([]);
      drawHead(g, Math.abs(headX()) < 0.22);
    }

    function drawFill(g: Tri, side: "L" | "R", songMs: number) {
      const f = combat.fillFor(side, songMs); if (!f) return;
      const c = side === "L" ? COL.L : COL.R, p = Math.min(1, f.p);
      const level = g.baseY - p * (g.baseY - g.apexY);
      ctx.save();
      triPath(g); ctx.clip();
      ctx.beginPath();
      if (side === "L") ctx.rect(0, 0, g.cx, g.h); else ctx.rect(g.cx, 0, g.w - g.cx, g.h);
      ctx.clip();
      const grad = ctx.createLinearGradient(0, g.baseY, 0, level);
      grad.addColorStop(0, c + (f.full ? "ff" : "bb")); grad.addColorStop(1, c + "33");
      if (f.full) { ctx.shadowColor = c; ctx.shadowBlur = 30; }
      ctx.fillStyle = grad; ctx.fillRect(0, level, g.w, g.baseY - level);
      ctx.restore();
      if (f.full) { ctx.save(); triPath(g); ctx.clip(); ctx.beginPath(); if (side === "L") ctx.rect(0, 0, g.cx, g.h); else ctx.rect(g.cx, 0, g.w - g.cx, g.h); ctx.clip(); triPath(g); ctx.lineWidth = 9; ctx.strokeStyle = "#fff"; ctx.shadowColor = c; ctx.shadowBlur = 34; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke(); ctx.restore(); }
    }

    function drawDodge(g: Tri, songMs: number) {
      const d = combat.dodgeState(songMs); if (!d) return;
      // sphere on the outer side of the guard; slip head that way to dodge
      const sx = g.cx + (d.side === "L" ? -g.baseHalf * 1.12 : g.baseHalf * 1.12);
      const sy = g.cy - g.R * 0.1;
      const rr = 18 + (1 - d.p) * 72;
      ctx.strokeStyle = d.aligned ? COL.on : COL.danger; ctx.lineWidth = 6; ctx.globalAlpha = 0.55 + d.p * 0.45;
      ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = d.aligned ? COL.on : COL.danger; ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = d.inWindow ? 34 : 18;
      ctx.beginPath(); ctx.arc(sx, sy, 21, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = "900 19px system-ui"; ctx.fillStyle = d.aligned ? COL.on : "#fff"; ctx.textAlign = "center";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
      ctx.fillText(d.side === "L" ? "ESQUIVA ←" : "→ ESQUIVA", g.cx, g.apexY - 12); ctx.shadowBlur = 0;
    }

    function draw(songMs: number, now: number) {
      const { w, h } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      const g = tri(combat.headX, now);
      drawFill(g, "L", songMs); drawFill(g, "R", songMs);
      drawGuard(g);
      drawDodge(g, songMs);
      // full prompt — large + glowing so it reads from far away
      const fl = combat.fillFor("L", songMs), fr = combat.fillFor("R", songMs);
      ctx.font = "900 34px system-ui"; ctx.textAlign = "center";
      const golpea = (x: number, c: string, flash: number) => {
        ctx.save(); ctx.globalAlpha = Math.max(0.5, flash); ctx.fillStyle = "#fff";
        ctx.shadowColor = c; ctx.shadowBlur = 28; ctx.fillText("¡GOLPEA!", x, g.cy + 6);
        ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.fillText("¡GOLPEA!", x, g.cy + 6); ctx.restore();
      };
      if (fl?.full) golpea(g.cx - g.baseHalf * 0.45, COL.L, fl.flash);
      if (fr?.full) golpea(g.cx + g.baseHalf * 0.45, COL.R, fr.flash);
      const d = combat.dodgeState(songMs);
      drawHead(g, !!d?.aligned);
      // popups
      let i = 0;
      for (const pp of combat.popups) {
        const age = (now - pp.bornMs) / 850; if (age > 1) continue;
        ctx.globalAlpha = 1 - age; ctx.fillStyle = pp.color;
        ctx.font = `800 ${pp.kind === "super" || pp.kind === "flow" ? 30 : 24}px system-ui`;
        ctx.fillText(pp.text, g.cx, g.apexY - 30 - age * 26 - i * 4); ctx.globalAlpha = 1; i++;
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
