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
  input: InputProvider, song: SongPlayer, diff: Difficulty,
  opts: { practiceKind?: "punch" | "dodge" } = {}
): Promise<CombatResult> {
  return new Promise((resolve) => {
    unlockAudio();
    const practice = !!opts.practiceKind;
    const beatmap = buildBeatmap(song.beats, song.durationMs, enemy, diff, (enemy.bpm | 0) + 7);
    if (opts.practiceKind) beatmap.notes = beatmap.notes.filter((n) => n.kind === opts.practiceKind);
    const combat = new Combat(enemy, beatmap, stats, flow, diff, practice);

    root.innerHTML = `
      <div class="scene combat">
        <video id="cam" autoplay playsinline muted></video>
        <div class="cam-tint"></div>
        <canvas id="ring"></canvas>
        <div class="hud-top">
          <div class="enemy-bar">
            <div class="enemy-face" style="--c:${enemy.color}">
              <img src="characters/enemies/${enemy.id}.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
              <span style="display:none">${enemy.name[0]}</span>
            </div>
            <div class="enemy-info">
              <div class="enemy-name">${enemy.name}<span>${enemy.title}</span></div>
              <div class="bar enemy"><i id="ehp" class="fill"></i></div>
            </div>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="bar player"><i id="php" class="fill"></i><b id="phptext"></b></div>
          <div class="flow-row"><div class="bar flow"><i id="flowfill" class="fill"></i></div><span id="flowlabel"></span></div>
        </div>
        <div id="combo" class="combo"></div>
        <div id="prep" class="prep-overlay">
          <div class="prep-box">
            <h3>Prepárate · ${practice ? "Práctica" : diff.name}</h3>
            <p>De pie frente a la cámara. <b>Sube la GUARDIA</b> (las dos manos a la altura de la cara) y centra la cabeza. Inclínate a los lados para esquivar; empuja el puño hacia la cámara para golpear.</p>
            <div id="prepstatus" class="prep-status">Sube la guardia…</div>
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
        // auto-ready when guard is up AND head centred for a moment (camera)
        const centered = Math.abs(headX()) < 0.24;
        const guard = input.guardUp?.() ?? true;
        if (isCam) {
          if (!guard) { holdStart = 0; prepstatus.textContent = "Sube la guardia (manos arriba)…"; }
          else if (!centered) { holdStart = 0; prepstatus.textContent = "¡Guardia! Ahora centra la cabeza…"; }
          else { if (!holdStart) holdStart = now; const held = now - holdStart;
            prepstatus.textContent = `¡Listo! Empezamos… ${Math.max(0, (1.0 - held / 1000)).toFixed(1)}s`;
            if (held > 1000) beginCountdown();
          }
        } else prepstatus.textContent = "Pulsa Estoy listo para empezar.";
        drawPrep();
      } else if (phase === "countdown") {
        const left = 2600 - (now - countStart);
        countdown.textContent = left > 0 ? String(Math.ceil(left / 1000)) : "¡YA!";
        drawPrep();
        if (left <= 0) { phase = "play"; while (input.consumePunch()) {} song.start(); countdown.textContent = ""; }
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

    function geom() { const w = root.clientWidth, h = root.clientHeight; return { w, h, cx: w / 2, cy: h * 0.49, R: Math.min(w, h) * 0.26 }; }

    interface Tri { w: number; h: number; cx: number; cy: number; R: number; baseHalf: number; baseY: number; apexY: number; apex: { x: number; y: number }; BL: { x: number; y: number }; BR: { x: number; y: number } }
    // Boxer-guard triangle: apex on top = the head, slipping left/right organically
    // with a small idle bob. Base = the guard. lean in [-1,1].
    function tri(lean: number, now: number): Tri {
      const { w, h, cx, cy, R } = geom();
      const baseHalf = R * 1.0, baseY = cy + R * 0.8, apexY = cy - R * 1.0;
      const bobX = Math.sin(now / 700) * 2.5, bobY = Math.sin(now / 520) * 2;
      // limited apex travel keeps the head "locked" near the top centre
      const apex = { x: cx + lean * baseHalf * 0.5 + bobX, y: apexY + bobY };
      return { w, h, cx, cy, R, baseHalf, baseY, apexY, apex, BL: { x: cx - baseHalf, y: baseY }, BR: { x: cx + baseHalf, y: baseY } };
    }
    // hit target at the middle of each half — Perfect = the approach ring lands here
    function target(g: Tri, side: "L" | "R") { return { x: g.cx + (side === "L" ? -g.baseHalf * 0.42 : g.baseHalf * 0.42), y: g.cy + g.R * 0.12 }; }
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
      // hands grow as they approach the camera (depth feedback)
      dot(t.L, COL.L, 10 + t.depthL * 18, "IZQ");
      dot(t.R, COL.R, 10 + t.depthR * 18, "DER");
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

    // Guitar-Hero style: a target ring sits at the middle of each half; an approach
    // ring shrinks onto it and you punch the instant it lands ("justo encima").
    function drawApproach(g: Tri, side: "L" | "R", songMs: number, depth: number) {
      const c = side === "L" ? COL.L : COL.R;
      const t = target(g, side);
      const targetR = 24 + depth * 18; // the punch circle grows as your hand nears the camera
      // static target ring
      ctx.lineWidth = 3; ctx.strokeStyle = c + "66";
      ctx.beginPath(); ctx.arc(t.x, t.y, targetR, 0, Math.PI * 2); ctx.stroke();
      const f = combat.fillFor(side, songMs); if (!f) return;
      const p = Math.min(1, f.p);
      const approachR = targetR + (1 - p) * g.R * 0.95; // converges onto the target at tHit
      ctx.save();
      ctx.lineWidth = f.full ? 7 : 5; ctx.strokeStyle = c;
      ctx.shadowColor = c; ctx.shadowBlur = f.full ? 30 : 12; ctx.globalAlpha = 0.4 + p * 0.6;
      ctx.beginPath(); ctx.arc(t.x, t.y, approachR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (f.full) { // landed — flash the target
        ctx.save(); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 26; ctx.globalAlpha = f.flash;
        ctx.beginPath(); ctx.arc(t.x, t.y, targetR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
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
      const trk = isCam ? input.tracking?.() : null;
      drawTracking();
      const g = tri(combat.headX, now);
      drawApproach(g, "L", songMs, trk?.depthL ?? 0); drawApproach(g, "R", songMs, trk?.depthR ?? 0);
      drawGuard(g);
      drawDodge(g, songMs);
      // landed prompt near each target
      const fl = combat.fillFor("L", songMs), fr = combat.fillFor("R", songMs);
      ctx.font = "900 26px system-ui"; ctx.textAlign = "center";
      const golpea = (side: "L" | "R", c: string, flash: number) => {
        const t = target(g, side);
        ctx.save(); ctx.globalAlpha = Math.max(0.5, flash); ctx.fillStyle = "#fff";
        ctx.shadowColor = c; ctx.shadowBlur = 22; ctx.fillText("¡YA!", t.x, t.y - 46);
        ctx.fillStyle = c; ctx.fillText("¡YA!", t.x, t.y - 46); ctx.restore();
      };
      if (fl?.full) golpea("L", COL.L, fl.flash);
      if (fr?.full) golpea("R", COL.R, fr.flash);
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
