// Combat engine v2. Punches: each circle half (L/R) FILLS from centre to the rim;
// punch the instant it reaches the contour (tHit). Head tracking is decoupled —
// only a gentle horizontal "weave" (lean left/right), never a crouch — and feeds
// the flow meter without gating punches. Combo / Perfect / Super / Flow preserved.
import { COMBO, TIMING, counterDamage, hitDamage } from "../data/balance";
import type { Beatmap, Note, Side } from "../data/beatmaps";
import type { Enemy } from "../data/enemies";
import type { FlowState } from "../data/flowStates";
import type { EffectiveStats } from "./progression";
import type { InputProvider } from "./pose";
import { sfx } from "./audio";

export interface Popup { text: string; color: string; bornMs: number; kind: "perfect" | "good" | "miss" | "flow" | "super" }

export interface CombatResult {
  won: boolean; perfects: number; goods: number; misses: number;
  maxCombo: number; superCombos: number; enemyMaxHp: number;
}

export interface FillState { p: number; full: boolean; tHit: number; flash: number }

const GROOVE_PERIOD = 2000; // ms for a full left-right-left weave

export class Combat {
  grooveX = 0; headX = 0; grooveOn = false;
  combo = 0; perfectStreak = 0; superCombo = false;
  flowActive = false; flowEndsAt = 0; flowMeter = 0;
  enemyHp: number; enemyMaxHp: number; playerHp: number; playerMaxHp: number;
  popups: Popup[] = [];
  finished = false; result: CombatResult | null = null;
  lastJudge: "perfect" | "good" | "miss" | null = null;

  private notes: Note[];
  private maxCombo = 0; private perfects = 0; private goods = 0; private misses = 0; private superCount = 0;
  private flow: FlowState | null; private noMissCount = 0;

  constructor(private enemy: Enemy, beatmap: Beatmap, private stats: EffectiveStats, flow: FlowState | null) {
    this.notes = beatmap.notes.map((n) => ({ ...n }));
    this.enemyHp = this.enemyMaxHp = enemy.hp;
    this.playerHp = this.playerMaxHp = stats.vt;
    this.flow = flow;
  }

  private addPopup(text: string, color: string, kind: Popup["kind"], now: number) {
    this.popups.push({ text, color, bornMs: now, kind });
    if (this.popups.length > 6) this.popups.shift();
  }

  private flowDmgMult() { return this.flowActive && this.flow?.buff.damageDealtMult ? this.flow.buff.damageDealtMult : 1; }
  private flowTakenMult() {
    if (!this.flowActive || !this.flow) return 1;
    if (this.flow.buff.invulnerable) return 0;
    return this.flow.buff.damageTakenMult ?? 1;
  }

  private tryActivateFlow(now: number) {
    if (!this.flow || this.flowActive) return;
    const c = this.flow.condition;
    const met =
      c.kind === "comboNoMiss" ? this.noMissCount >= c.value :
      c.kind === "perfectStreak" ? this.perfectStreak >= c.value :
      this.flowMeter >= c.value;
    if (met) {
      this.flowActive = true;
      this.flowEndsAt = now + this.flow.buff.durationMs;
      this.flowMeter = 0;
      this.addPopup(this.flow.name.toUpperCase(), "#ffd23b", "flow", now);
      sfx.flow();
    }
  }

  // soonest unjudged note for a side that is currently in its fill window
  private nextNote(side: Side, songMs: number): Note | null {
    let best: Note | null = null;
    for (const n of this.notes) {
      if (n.judged || n.side !== side) continue;
      if (n.tHit - songMs > n.leadMs) continue; // not started filling yet
      if (songMs - n.tHit > TIMING.GOOD_MS) continue; // window passed
      if (!best || n.tHit < best.tHit) best = n;
    }
    return best;
  }

  fillFor(side: Side, songMs: number): FillState | null {
    const n = this.nextNote(side, songMs);
    if (!n) return null;
    const p = Math.max(0, Math.min(1.12, (songMs - (n.tHit - n.leadMs)) / n.leadMs));
    const full = Math.abs(songMs - n.tHit) <= TIMING.GOOD_MS && p >= 0.92;
    const flash = full ? 1 - Math.min(1, Math.abs(songMs - n.tHit) / TIMING.GOOD_MS) : 0;
    return { p, full, tHit: n.tHit, flash };
  }

  private judgePunch(side: Side, songMs: number, now: number) {
    const n = this.nextNote(side, songMs);
    if (!n) { sfx.hit(); return; } // stray jab, no penalty
    const dt = Math.abs(songMs - n.tHit);
    const judgement: "perfect" | "good" = dt <= TIMING.PERFECT_MS ? "perfect" : "good";
    n.judged = judgement;
    this.lastJudge = judgement;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.noMissCount++;

    let mult: number;
    if (judgement === "perfect") {
      this.perfects++; this.perfectStreak++; mult = COMBO.PERFECT_DMG_MULT; sfx.perfect();
      this.flowMeter = Math.min(100, this.flowMeter + 6 * this.stats.flowGainMult);
      if (this.perfectStreak === COMBO.SUPER_THRESHOLD) { this.superCount++; this.addPopup("SUPER COMBO", "#ff5bd0", "super", now); sfx.super(); }
    } else {
      this.goods++; this.perfectStreak = 0; mult = COMBO.GOOD_DMG_MULT; sfx.good();
      this.flowMeter = Math.min(100, this.flowMeter + 2 * this.stats.flowGainMult);
    }
    this.superCombo = this.perfectStreak >= COMBO.SUPER_THRESHOLD;
    if (this.superCombo) mult *= COMBO.SUPER_DMG_MULT;
    if (this.grooveOn) mult *= 1.1; // weave bonus, not required

    let dmg = hitDamage(this.stats.atk, this.enemy.def, mult, this.flowDmgMult());
    if (this.flowActive && this.flow?.buff.autoCounter) dmg = Math.round(dmg * 1.3);
    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    this.addPopup(`${judgement === "perfect" ? "PERFECT" : "GOOD"}  ${dmg}`, judgement === "perfect" ? "#ffd23b" : "#7fd8ff", judgement, now);
    this.tryActivateFlow(now);
  }

  private onMiss(now: number) {
    this.combo = 0; this.perfectStreak = 0; this.superCombo = false; this.noMissCount = 0; this.misses++;
    this.lastJudge = "miss";
    const dmg = Math.round(counterDamage(this.enemy.atk, this.stats.def) * this.flowTakenMult());
    if (dmg > 0) this.playerHp = Math.max(0, this.playerHp - dmg);
    this.addPopup(dmg > 0 ? `FALLO  ${dmg}` : "BLOQUEO", dmg > 0 ? "#ff5b5b" : "#7fffa0", "miss", now);
    sfx.miss();
  }

  update(songMs: number, now: number, input: InputProvider) {
    if (this.finished) return;
    // gentle horizontal weave; head leans to follow. Never vertical -> no crouch.
    this.grooveX = Math.sin((songMs / GROOVE_PERIOD) * Math.PI * 2);
    const h = input.head();
    this.headX = Math.max(-1, Math.min(1, (h.x - 0.5) * 2));
    this.grooveOn = Math.abs(this.headX - this.grooveX) < 0.4;
    if (this.grooveOn) this.flowMeter = Math.min(100, this.flowMeter + 0.05 * this.stats.flowGainMult);

    let p = input.consumePunch();
    while (p) { this.judgePunch(p, songMs, now); p = input.consumePunch(); }

    for (const n of this.notes)
      if (!n.judged && songMs - n.tHit > TIMING.GOOD_MS) { n.judged = "miss"; this.onMiss(now); }

    if (this.flowActive && now >= this.flowEndsAt) { this.flowActive = false; this.addPopup("FLOW FIN", "#9fb0c8", "flow", now); }
    this.tryActivateFlow(now);

    if (this.enemyHp <= 0) this.end(true);
    else if (this.playerHp <= 0) this.end(false);
    else if (this.notes.every((n) => n.judged) && songMs > 1000) this.end(this.enemyHp < this.enemyMaxHp * 0.5);
  }

  private end(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.result = { won, perfects: this.perfects, goods: this.goods, misses: this.misses, maxCombo: this.maxCombo, superCombos: this.superCount, enemyMaxHp: this.enemyMaxHp };
    won ? sfx.win() : sfx.lose();
  }

  flowRef() { return this.flow; }
  enemyRef() { return this.enemy; }
}
