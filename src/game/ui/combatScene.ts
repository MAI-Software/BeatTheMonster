// Combat scene v3. Phases: PREP (stand & align to camera + countdown) -> PLAY.
// Circle split into L/R halves that fill to the rim (punch when full). Dodge spheres
// appear on the outer rim (lean head to that side). Head shown as a dot sliding along
// the horizontal diameter — horizontal only, never a crouch. Clock from the SongPlayer.
import type { Enemy } from "../data/enemies";
import { buildBeatmap, practiceBeatmap } from "../data/beatmaps";
import type { Difficulty } from "../data/difficulty";
import type { EffectiveStats } from "../systems/progression";
import { Combat, type CombatResult, type FillState, type DodgeState } from "../systems/combat";
import type { FlowState } from "../data/flowStates";
import type { InputProvider } from "../systems/pose";
import { getSensitivity, setSensitivity, type Sensitivity } from "../systems/pose";
import type { SongPlayer } from "../systems/song";
import { unlockAudio } from "../systems/audio";
import { icon } from "./icons";
import { COMBAT_GUIDE } from "../data/coach";
import { showSpotlight } from "./guide";

// neon palette: blue = left fist, red = right fist, yellow = the triangle/head
const COL = { L: "#1fa2ff", R: "#ff2436", guard: "#ffe11a", rim: "#4a451c", on: "#37e09a", head: "#ffe11a", danger: "#ff2e7a", ball: "#ffe11a" };

export function runCombat(
  root: HTMLElement, enemy: Enemy, stats: EffectiveStats, flow: FlowState | null,
  input: InputProvider, song: SongPlayer, diff: Difficulty,
  opts: { practiceKind?: "punch" | "dodge"; freeplay?: boolean; tutorial?: boolean; coachImg?: string } = {}
): Promise<CombatResult> {
  return new Promise((resolve) => {
    unlockAudio();
    const practice = !!opts.practiceKind || !!opts.freeplay; // no death in practice/freeplay
    const beatmap = opts.practiceKind
      ? practiceBeatmap(song.beats, song.durationMs, opts.practiceKind)
      : buildBeatmap(song.beats, song.durationMs, enemy, diff, (enemy.bpm | 0) + 7);
    const combat = new Combat(enemy, beatmap, stats, flow, diff, practice);

    root.innerHTML = `
      <div class="scene combat">
        <video id="cam" autoplay playsinline muted></video>
        <div class="cam-tint"></div>
        <canvas id="ring"></canvas>
        <div class="hud-top ${opts.tutorial ? "tut-dim" : ""}">
          <div class="enemy-bar">
            <div class="enemy-face" style="--c:${enemy.color}">
              <img src="characters/enemies/${enemy.id}.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
              <span style="display:none">${enemy.emoji}</span>
            </div>
            <div class="enemy-info">
              <div class="enemy-name">${enemy.name}<span>${enemy.title}</span></div>
              <div class="bar enemy"><i id="ehp" class="fill"></i></div>
            </div>
          </div>
        </div>
        <div class="hud-bottom ${opts.tutorial ? "tut-dim" : ""}">
          <div class="bar player"><i id="php" class="fill"></i><b id="phptext"></b></div>
          <div class="flow-row"><div class="bar flow"><i id="flowfill" class="fill"></i></div><span id="flowlabel"></span></div>
        </div>
        <div id="info" class="combat-info"></div>
        <div id="judge" class="judge-feed"></div>
        <div id="drillCount" class="drill-count" style="display:none"></div>
        <div id="prephint" class="prep-hint"></div>
        <div id="countdown" class="countdown"></div>
        <button id="quit" class="quit">${icon("close", 18)}</button>
        <button id="omit" class="omit-btn" ${opts.tutorial ? "style=\"display:none\"" : ""}>OMITIR COMBATE</button>
        <button id="dbgtoggle" style="position:absolute;top:calc(env(safe-area-inset-top) + 12px);right:64px;z-index:21;width:34px;height:34px;border-radius:50%;border:0;background:#0007;color:#9fffce;font:700 15px system-ui">i</button>
        <button id="sensbtn" style="position:absolute;top:calc(env(safe-area-inset-top) + 12px);right:106px;z-index:21;height:34px;padding:0 12px;border-radius:17px;border:0;background:#0007;color:#ffe11a;font:700 12px system-ui">Sens</button>
        <div id="dbg" style="display:none;position:absolute;top:calc(env(safe-area-inset-top) + 8px);left:50%;transform:translateX(-50%);z-index:21;font:700 11px/1.3 system-ui;color:#9fffce;background:#000a;padding:4px 9px;border-radius:10px;pointer-events:none;white-space:nowrap"></div>
      </div>`;

    const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
    const video = $<HTMLVideoElement>("#cam");
    const nativePreview = !!input.usesNativePreview;
    const isCam = input.kind === "camera";
    if (nativePreview) {
      // Native camera renders behind a transparent WebView — hide the web <video> and let it through.
      video.style.display = "none";
      document.documentElement.classList.add("native-cam");
    } else if (isCam && input.videoEl) {
      video.srcObject = (input.videoEl.srcObject as MediaStream) ?? null;
    } else {
      video.style.display = "none";
    }

    const canvas = $<HTMLCanvasElement>("#ring"), ctx = canvas.getContext("2d")!;
    const ehp = $<HTMLElement>("#ehp"), php = $<HTMLElement>("#php"), phptext = $<HTMLElement>("#phptext");
    const infoEl = $<HTMLElement>("#info"), judgeEl = $<HTMLElement>("#judge"), flowfill = $<HTMLElement>("#flowfill"), flowlabel = $<HTMLElement>("#flowlabel");
    const countdown = $<HTMLElement>("#countdown"), prephint = $<HTMLElement>("#prephint");
    const dbgEl = $<HTMLElement>("#dbg");

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = root.clientWidth * dpr; canvas.height = root.clientHeight * dpr;
      canvas.style.width = root.clientWidth + "px"; canvas.style.height = root.clientHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); window.addEventListener("resize", resize);

    let raf = 0, quit = false;
    let phase: "tutdim" | "prep" | "countdown" | "play" = opts.tutorial ? "tutdim" : "prep";
    let countStart = 0, holdStart = 0;
    let dbgOn = false, frames = 0, lastFpsT = 0, fps = 0;
    $<HTMLButtonElement>("#quit").onclick = () => { quit = true; };
    let omit = false;
    const omitBtn = $<HTMLButtonElement>("#omit");
    if (!opts.tutorial) omitBtn.onclick = () => { omit = true; }; // mandatory drill: no skipping it via a hidden button
    const hudTop = $<HTMLElement>(".hud-top"), hudBottom = $<HTMLElement>(".hud-bottom");
    const drillCountEl = $<HTMLElement>("#drillCount");

    // ----- Staged first-fight tutorial (opts.tutorial only): coach reveals the HUD piece
    // by piece, then runs a mandatory 5-punch / 5-dodge drill before the real fight starts.
    let closeGuide: (() => void) | null = null;
    let tutTriRevealed = false;
    let drill: "punch" | "dodge" | null = null;
    let drillCount = 0, drillSide: "L" | "R" = "R", drillPromptAt = 0, drillWasAligned = false;
    const DRILL_TARGET = 5, DRILL_LOOP_MS = 1100, DRILL_DODGE_TARGET = 0.18;

    function triRect(): DOMRect {
      const g = tri(0, performance.now());
      // tri()/geom() work in ROOT-LOCAL coordinates. On desktop #app is a centered
      // "phone frame" (not viewport-filling), so add its on-screen offset to get real
      // viewport coordinates — same space getBoundingClientRect() returns for DOM targets.
      const off = root.getBoundingClientRect();
      const left = off.left + Math.min(g.apex.x, g.BL.x, g.BR.x) - 12, right = off.left + Math.max(g.apex.x, g.BL.x, g.BR.x) + 12;
      return new DOMRect(left, off.top + g.apexY - 40, right - left, g.baseY - g.apexY + 52);
    }
    function drillCounter(show: boolean, label?: string) {
      drillCountEl.style.display = show ? "block" : "none";
      if (label) drillCountEl.textContent = label;
    }
    function nextDrillPrompt(now: number) { drillSide = drillSide === "L" ? "R" : "L"; drillPromptAt = now; drillWasAligned = false; }
    function startDrill(kind: "punch" | "dodge") {
      drill = kind; drillCount = 0; drillSide = "R"; drillPromptAt = performance.now(); drillWasAligned = false;
      while (input.consumePunch()) {} // don't let a stray punch thrown while reading count early
      drillCounter(true, `${kind === "punch" ? "GOLPES" : "ESQUIVAS"} 0/${DRILL_TARGET}`);
    }
    function tutStageHp() {
      closeGuide = showSpotlight(opts.coachImg ?? "", [{ target: () => root.querySelector<HTMLElement>(".enemy-bar"), lines: COMBAT_GUIDE.hp }], {
        onDone: () => { hudTop.classList.remove("tut-dim"); tutStageTriangle(); },
      });
    }
    function tutStageTriangle() {
      closeGuide = showSpotlight(opts.coachImg ?? "", [{ target: triRect, lines: COMBAT_GUIDE.triangle }], {
        onDone: () => { tutTriRevealed = true; tutStagePunchIntro(); },
      });
    }
    function tutStagePunchIntro() {
      closeGuide = showSpotlight(opts.coachImg ?? "", [{ target: triRect, lines: COMBAT_GUIDE.punchIntro }], {
        onDone: () => startDrill("punch"),
      });
    }
    function tutStageDodgeIntro() {
      closeGuide = showSpotlight(opts.coachImg ?? "", [{ target: triRect, lines: COMBAT_GUIDE.dodgeIntro }], {
        onDone: () => startDrill("dodge"),
      });
    }
    function tutStageReady() {
      closeGuide = showSpotlight(opts.coachImg ?? "", [{ target: triRect, lines: COMBAT_GUIDE.ready }], {
        onDone: () => { hudBottom.classList.remove("tut-dim"); phase = "prep"; },
      });
    }
    if (opts.tutorial) tutStageHp();

    $<HTMLButtonElement>("#dbgtoggle").onclick = () => { dbgOn = !dbgOn; dbgEl.style.display = dbgOn ? "block" : "none"; };
    const updateDbg = () => {
      if (!dbgOn) return;
      const hz = Math.round(input.inferenceHz?.() ?? 0);
      const ems = Math.round(input.engineMs?.() ?? 0);
      dbgEl.textContent = `${fps}fps · ${input.mode ?? "?"} ${hz}Hz/${ems}ms · lat ${Math.round(combat.lastPunchLatencyMs)}ms`;
    };

    // sensitivity preset (population default) + optional prep calibration
    let calStart = 0, calDone = false;
    const sensLabel = (s: Sensitivity) => (s === "sensitive" ? "Sensible" : s === "strict" ? "Estricto" : "Normal");
    const sensBtn = $<HTMLButtonElement>("#sensbtn");
    const sensCycle: Sensitivity[] = ["sensitive", "normal", "strict"];
    sensBtn.textContent = sensLabel(getSensitivity());
    sensBtn.onclick = () => { const next = sensCycle[(sensCycle.indexOf(getSensitivity()) + 1) % 3]; setSensitivity(next); sensBtn.textContent = sensLabel(next); };
    if (isCam) input.beginCalibration?.();

    function beginCountdown() { if (phase !== "prep") return; phase = "countdown"; countStart = performance.now(); prephint.textContent = ""; }

    function headX(): number { return Math.max(-1, Math.min(1, (input.head().x - 0.5) * 2)); }

    function loop(now: number) {
     try {
      input.update(now);
      frames++;
      if (now - lastFpsT >= 500) { fps = Math.round((frames * 1000) / (now - lastFpsT)); frames = 0; lastFpsT = now; updateDbg(); }
      if (phase === "tutdim") {
        if (drill === "punch") {
          let p = input.consumePunch();
          while (p) {
            if (p.side === drillSide) {
              drillCount++;
              if (drillCount >= DRILL_TARGET) { drill = null; drillCounter(false); tutStageDodgeIntro(); break; }
              drillCounter(true, `GOLPES ${drillCount}/${DRILL_TARGET}`); nextDrillPrompt(now);
            }
            p = input.consumePunch();
          }
        } else if (drill === "dodge") {
          const aligned = drillDodgeAligned();
          if (aligned && !drillWasAligned) {
            drillCount++;
            if (drillCount >= DRILL_TARGET) { drill = null; drillCounter(false); tutStageReady(); }
            else { drillCounter(true, `ESQUIVAS ${drillCount}/${DRILL_TARGET}`); nextDrillPrompt(now); }
          }
          drillWasAligned = aligned;
        }
        drawTutorial(now);
      } else if (phase === "prep") {
        if (isCam && !calDone) {
          // optional calibration: throw 2 quick jabs. Auto-skips after 6s (or if no jabs land),
          // and endCalibration() silently keeps the preset defaults when there aren't enough.
          if (!calStart) calStart = now;
          const got = input.calCount?.() ?? 0;
          prephint.textContent = got >= 2 ? "¡LISTO!" : `TIRA 2 GOLPES PARA CALIBRAR (${got}/2)`;
          prephint.className = got >= 2 ? "prep-hint ok" : "prep-hint";
          if (got >= 2 || now - calStart > 6000) { input.endCalibration?.(); calDone = true; holdStart = 0; }
        } else {
          // start automatically once in guard + head aligned (camera). No instructions box.
          const centered = Math.abs(headX()) < 0.26;
          const guard = input.guardUp?.() ?? true;
          if (isCam) {
            if (!guard) { holdStart = 0; prephint.textContent = "GUARDIA"; prephint.className = "prep-hint"; }
            else if (!centered) { holdStart = 0; prephint.textContent = "ALINEA"; prephint.className = "prep-hint"; }
            else { if (!holdStart) holdStart = now; prephint.textContent = "¡LISTO!"; prephint.className = "prep-hint ok"; if (now - holdStart > 900) beginCountdown(); }
          } else { if (!holdStart) holdStart = now; prephint.textContent = "ALÍNEATE"; if (now - holdStart > 1400) beginCountdown(); }
        }
        drawPrep();
      } else if (phase === "countdown") {
        const left = 2200 - (now - countStart);
        countdown.textContent = left > 0 ? String(Math.ceil(left / 1000)) : "";
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

      if (omit) { combat.forceEnd(true); return finish(combat.result ?? { won: true, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, dodges: 0, enemyMaxHp: enemy.hp }); }
      if (quit) return finish({ won: false, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, dodges: 0, enemyMaxHp: enemy.hp });
      if (combat.finished && combat.result) return finish(combat.result);
      raf = requestAnimationFrame(loop);
     } catch (e) {
       // A frame threw — never strand the player: route through finish() so the native-cam
       // class is cleared, audio stops, the camera/wake-lock is released and the promise resolves.
       console.error("combat loop error", e);
       return finish({ won: false, perfects: 0, goods: 0, misses: 0, maxCombo: 0, superCombos: 0, dodges: 0, enemyMaxHp: enemy.hp });
     }
    }

    let finished = false;
    function finish(r: CombatResult) {
      if (finished) return; finished = true; // guard against re-entrancy (e.g. error during finish path)
      closeGuide?.(); drillCounter(false); // tear down a lingering tutorial overlay if quit mid-drill
      document.documentElement.classList.remove("native-cam");
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize); song.stop();
      try { input.stop(); } catch { /* idempotent: main.ts also stops on next createInput */ }
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
      // the triangle stays put (only a tiny idle bob); the HEAD marker moves, not the guard
      void lean;
      const apex = { x: cx + bobX, y: apexY + bobY };
      return { w, h, cx, cy, R, baseHalf, baseY, apexY, apex, BL: { x: cx - baseHalf, y: baseY }, BR: { x: cx + baseHalf, y: baseY } };
    }
    // hit target at the middle of each half — Perfect = the approach ring lands here
    function target(g: Tri, side: "L" | "R") { return { x: g.cx + (side === "L" ? -g.baseHalf * 0.42 : g.baseHalf * 0.42), y: g.cy + g.R * 0.12 }; }
    function triPath(g: Tri) { ctx.beginPath(); ctx.moveTo(g.apex.x, g.apex.y); ctx.lineTo(g.BR.x, g.BR.y); ctx.lineTo(g.BL.x, g.BL.y); ctx.closePath(); }

    function drawGuard(g: Tri) {
      ctx.save();
      triPath(g); ctx.lineWidth = 4; ctx.strokeStyle = COL.guard; ctx.lineJoin = "round";
      ctx.shadowColor = COL.guard; ctx.shadowBlur = 16; ctx.stroke();
      ctx.restore();
      // centre divider (L/R fists)
      ctx.lineWidth = 2; ctx.strokeStyle = COL.guard + "88";
      ctx.beginPath(); ctx.moveTo(g.cx, g.baseY); ctx.lineTo(g.cx, g.apexY + g.R * 0.5); ctx.stroke();
      // dashed guard line across the UPPER THIRD — where your fists should rest before & after a punch
      const gy = g.apexY + (g.baseY - g.apexY) / 3;
      const t3 = 1 / 3; // fraction from apex -> base
      const lx = g.apex.x + t3 * (g.BL.x - g.apex.x), rx = g.apex.x + t3 * (g.BR.x - g.apex.x);
      ctx.save();
      ctx.setLineDash([7, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = COL.guard + "cc";
      ctx.shadowColor = COL.guard; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(lx, gy); ctx.lineTo(rx, gy); ctx.stroke();
      ctx.restore();
      ctx.font = "600 10px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = COL.guard + "aa";
      ctx.fillText("GUARDIA", g.cx, gy - 6);
      // fixed apex node (the head's home corner) — anchors the triangle visually
      ctx.fillStyle = COL.guard; ctx.shadowColor = COL.guard; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(g.apex.x, g.apex.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      // guard gloves at the base corners
      for (const corner of [g.BL, g.BR]) { ctx.fillStyle = "#0006"; ctx.beginPath(); ctx.arc(corner.x, corner.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COL.rim; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.font = "600 12px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#9fb0c8";
      ctx.fillText("IZQ", g.cx - g.baseHalf * 0.45, g.baseY + 22);
      ctx.fillText("DER", g.cx + g.baseHalf * 0.45, g.baseY + 22);
    }

    // the head marker slides horizontally with the lean; it can travel out past the
    // triangle edges to reach the dodge arrows.
    function drawHead(g: Tri, headLean: number, glow: boolean) {
      const r = Math.max(20, g.R * 0.12);
      const x = g.cx + Math.max(-1, Math.min(1, headLean)) * g.baseHalf * 1.08;
      const y = g.apexY - r - 14; // floats clearly ABOVE the (fixed) triangle
      ctx.save();
      ctx.shadowColor = glow ? COL.on : COL.head; ctx.shadowBlur = glow ? 32 : 16;
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
      drawHead(g, headX(), Math.abs(headX()) < 0.22);
    }

    // Each triangle HALF fills with colour from the base up as the beat approaches; the half
    // is FULL right at tHit — punch THAT fist then for a Perfect (white flash = the window).
    // Only the half with an incoming punch fills, so it also tells you which fist to throw.
    function halfPath(g: Tri, side: "L" | "R") {
      ctx.beginPath();
      ctx.moveTo(g.apex.x, g.apex.y);
      if (side === "L") { ctx.lineTo(g.cx, g.baseY); ctx.lineTo(g.BL.x, g.BL.y); }
      else { ctx.lineTo(g.BR.x, g.BR.y); ctx.lineTo(g.cx, g.baseY); }
      ctx.closePath();
    }
    function drawHalfFill(g: Tri, side: "L" | "R", f: FillState | null) {
      if (!f) return;
      const c = side === "L" ? COL.L : COL.R;
      const p = Math.max(0, Math.min(1, f.p));
      ctx.save();
      halfPath(g, side); ctx.clip(); // paint only inside this half of the triangle
      const fillTop = g.baseY - p * (g.baseY - g.apex.y); // the "liquid" level rises with p
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = f.full ? 28 : 8;
      ctx.globalAlpha = f.full ? 0.9 : 0.3 + p * 0.45;
      ctx.fillRect(g.cx - g.baseHalf - 2, fillTop, g.baseHalf * 2 + 4, g.baseY - fillTop + 4);
      if (f.full) { // perfect window — bright flash over the full half
        ctx.globalAlpha = f.flash * 0.6; ctx.fillStyle = "#fff";
        ctx.fillRect(g.cx - g.baseHalf - 2, g.apex.y, g.baseHalf * 2 + 4, g.baseY - g.apex.y + 4);
      }
      ctx.restore();
    }

    // a chevron arrow ABOVE the triangle pointing up-and-out. Lean the head a little
    // toward it (head exits the triangle on that side) to dodge.
    function arrow(ax: number, ay: number, dir: -1 | 1, size: number, col: string, glow: number) {
      ctx.save(); ctx.translate(ax, ay); ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = col; ctx.shadowBlur = glow;
      ctx.beginPath();
      ctx.moveTo(dir * -size, size * 0.7);
      ctx.lineTo(dir * size, 0);
      ctx.lineTo(dir * -size, -size * 0.7);
      ctx.stroke(); ctx.restore();
    }

    function drawDodge(g: Tri, d: DodgeState | null) {
      if (!d) return;
      const dir = d.side === "L" ? -1 : 1;
      const col = d.aligned ? COL.on : COL.danger;
      // arrow sits just OUTSIDE the triangle's top corner on that side
      const ax = g.cx + dir * g.baseHalf * 0.95;
      const ay = g.apexY + g.R * 0.05;
      const glow = d.inWindow ? 30 : 14;
      arrow(ax, ay, dir as -1 | 1, 22 + (1 - d.p) * 10, col, glow);
      // incoming telegraph ring closing onto the arrow
      const rr = 18 + (1 - d.p) * 56;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.globalAlpha = 0.4 + d.p * 0.6;
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(ax, ay, rr, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      // sustained note: arc fills while you hold the lean out
      if (d.holdMs > 0) {
        ctx.lineWidth = 5; ctx.strokeStyle = "#0009";
        ctx.beginPath(); ctx.arc(ax, ay, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = COL.on; ctx.shadowColor = COL.on; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(ax, ay, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.holdFilled); ctx.stroke(); ctx.shadowBlur = 0;
      }
    }

    // Cosmetic-only pacing loop for the drill prompts (never gates hit detection — the
    // drill teaches which control to use, not rhythm precision; that's the real fight).
    function drillFillState(now: number): FillState {
      const p = ((now - drillPromptAt) % DRILL_LOOP_MS) / DRILL_LOOP_MS;
      const full = p > 0.85;
      return { p, full, flash: full ? (p - 0.85) / 0.15 : 0 };
    }
    // headX() (not combat.headX — that's only updated by combat.update(), which never
    // runs during the tutorial stages) reads the live lean directly from the input.
    function drillDodgeAligned(): boolean {
      return drillSide === "L" ? headX() < -DRILL_DODGE_TARGET : headX() > DRILL_DODGE_TARGET;
    }
    function drillDodgeState(now: number): DodgeState {
      const p = ((now - drillPromptAt) % DRILL_LOOP_MS) / DRILL_LOOP_MS;
      return { side: drillSide, p, inWindow: true, aligned: drillDodgeAligned(), holdMs: 0, holdProgress: 0, holdFilled: drillDodgeAligned() ? 1 : 0 };
    }
    function drawTutorial(now: number) {
      const { w, h } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      if (!tutTriRevealed) return;
      const g = tri(0, now);
      if (drill === "punch") drawHalfFill(g, drillSide, drillFillState(now));
      drawGuard(g);
      if (drill === "dodge") drawDodge(g, drillDodgeState(now));
      drawHead(g, headX(), drill === "dodge" && drillDodgeAligned());
    }

    function draw(songMs: number, now: number) {
      const { w, h } = geom();
      ctx.clearRect(0, 0, w, h);
      drawTracking();
      const g = tri(combat.headX, now);
      drawHalfFill(g, "L", combat.fillFor("L", songMs)); drawHalfFill(g, "R", combat.fillFor("R", songMs));
      drawGuard(g);
      const d = combat.dodgeState(songMs);
      drawDodge(g, d);
      drawHead(g, combat.headX, !!d?.aligned);
    }

    function sync() {
      ehp.style.width = `${(combat.enemyHp / combat.enemyMaxHp) * 100}%`;
      php.style.width = `${(combat.playerHp / combat.playerMaxHp) * 100}%`;
      phptext.textContent = `${Math.ceil(combat.playerHp)} / ${combat.playerMaxHp}`;
      // combo + points, OUTSIDE the triangle (top-left)
      infoEl.innerHTML =
        `<div class="ci-score">${combat.score.toLocaleString()} <span>PTS</span></div>` +
        (combat.combo > 1 ? `<div class="ci-combo ${combat.superCombo ? "super" : ""}">${combat.combo} <span>COMBO${combat.superCombo ? " · SUPER ×2.5" : ""}</span></div>` : "");
      // judgement feed (PERFECT / GOOD / ...), top-right
      const now = performance.now();
      judgeEl.innerHTML = combat.popups.slice(-5).map((pp) => {
        const age = (now - pp.bornMs) / 1100; if (age > 1) return "";
        return `<div class="jl" style="color:${pp.color};opacity:${(1 - age).toFixed(2)}">${pp.text}</div>`;
      }).join("");
      flowfill.style.width = `${combat.flowMeter}%`;
      const f = combat.flowRef();
      flowlabel.textContent = combat.flowActive ? `${f?.name ?? "FLOW"} ACTIVO` : f ? f.name : "Sin Flow";
      flowlabel.className = combat.flowActive ? "flow-on" : "";
    }

    raf = requestAnimationFrame(loop);
  });
}
