// Combat engine v3. Punches: a circle half (L/R) fills to the rim — punch when full.
// Dodges: a sphere appears on the outer rim (L/R); lean your head to that side in
// time or take the hit. Head movement is horizontal only (no crouch). Difficulty
// drives timing windows, dodge tolerance, and incoming damage.
import { COMBO, counterDamage, hitDamage } from "../data/balance";
import type { Beatmap, Note, Side } from "../data/beatmaps";
import type { Enemy } from "../data/enemies";
import type { Difficulty } from "../data/difficulty";
import type { FlowState } from "../data/flowStates";
import type { EffectiveStats } from "./progression";
import type { InputProvider } from "./pose";
import { sfx } from "./audio";

export interface Popup { text: string; color: string; bornMs: number; kind: "perfect" | "good" | "miss" | "flow" | "super" | "dodge" }
export interface CombatResult { won: boolean; perfects: number; goods: number; misses: number; maxCombo: number; superCombos: number; dodges: number; enemyMaxHp: number }
export interface FillState { p: number; full: boolean; flash: number }
export interface DodgeState { side: Side; p: number; inWindow: boolean; aligned: boolean }

const DODGE_TARGET = 0.26; // headX past this toward a side = aligned (forgiving)

export class Combat {
  headX = 0;
  combo = 0; perfectStreak = 0; superCombo = false;
  flowActive = false; flowEndsAt = 0; flowMeter = 0;
  enemyHp: number; enemyMaxHp: number; playerHp: number; playerMaxHp: number;
  popups: Popup[] = [];
  finished = false; result: CombatResult | null = null;

  private notes: Note[];
  private maxCombo = 0; private perfects = 0; private goods = 0; private misses = 0; private superCount = 0; private dodgeCount = 0;
  private flow: FlowState | null; private noMissCount = 0;
  private alignedDodges = new Set<number>();

  constructor(private enemy: Enemy, beatmap: Beatmap, private stats: EffectiveStats, flow: FlowState | null, private diff: Difficulty, private practice = false) {
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
  private flowTakenMult() { if (!this.flowActive || !this.flow) return 1; if (this.flow.buff.invulnerable) return 0; return this.flow.buff.damageTakenMult ?? 1; }

  private tryActivateFlow(now: number) {
    if (!this.flow || this.flowActive) return;
    const c = this.flow.condition;
    const met = c.kind === "comboNoMiss" ? this.noMissCount >= c.value : c.kind === "perfectStreak" ? this.perfectStreak >= c.value : this.flowMeter >= c.value;
    if (met) {
      this.flowActive = true; this.flowEndsAt = now + this.flow.buff.durationMs; this.flowMeter = 0;
      this.addPopup(this.flow.name.toUpperCase(), "#ffd23b", "flow", now); sfx.flow();
    }
  }

  private nextPunch(side: Side, songMs: number): Note | null {
    let best: Note | null = null;
    for (const n of this.notes) {
      if (n.judged || n.kind !== "punch" || n.side !== side) continue;
      if (n.tHit - songMs > n.leadMs) continue;
      if (songMs - n.tHit > this.diff.goodMs) continue;
      if (!best || n.tHit < best.tHit) best = n;
    }
    return best;
  }

  fillFor(side: Side, songMs: number): FillState | null {
    const n = this.nextPunch(side, songMs);
    if (!n) return null;
    const p = Math.max(0, Math.min(1.12, (songMs - (n.tHit - n.leadMs)) / n.leadMs));
    const full = Math.abs(songMs - n.tHit) <= this.diff.goodMs && p >= 0.9;
    const flash = full ? 1 - Math.min(1, Math.abs(songMs - n.tHit) / this.diff.goodMs) : 0;
    return { p, full, flash };
  }

  dodgeState(songMs: number): DodgeState | null {
    let best: Note | null = null;
    for (const n of this.notes) {
      if (n.judged || n.kind !== "dodge") continue;
      if (n.tHit - songMs > n.leadMs) continue;
      if (songMs - n.tHit > this.diff.dodgeWindowMs) continue;
      if (!best || n.tHit < best.tHit) best = n;
    }
    if (!best) return null;
    const p = Math.max(0, Math.min(1, (songMs - (best.tHit - best.leadMs)) / best.leadMs));
    const inWindow = Math.abs(songMs - best.tHit) <= this.diff.dodgeWindowMs;
    const aligned = best.side === "L" ? this.headX < -DODGE_TARGET : this.headX > DODGE_TARGET;
    return { side: best.side, p, inWindow, aligned };
  }

  private judgePunch(side: Side, songMs: number, now: number) {
    const n = this.nextPunch(side, songMs);
    if (!n) { sfx.hit(); return; }
    const dt = Math.abs(songMs - n.tHit);
    const judgement: "perfect" | "good" = dt <= this.diff.perfectMs ? "perfect" : "good";
    n.judged = judgement;
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
    let dmg = hitDamage(this.stats.atk, this.enemy.def, mult, this.flowDmgMult());
    if (this.flowActive && this.flow?.buff.autoCounter) dmg = Math.round(dmg * 1.3);
    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    this.addPopup(`${judgement === "perfect" ? "PERFECT" : "GOOD"}  ${dmg}`, judgement === "perfect" ? "#ffd23b" : "#7fd8ff", judgement, now);
    this.tryActivateFlow(now);
  }

  private takeHit(now: number, factor = 1) {
    if (this.practice) return 0; // no damage / no death in practice
    const dmg = Math.round(counterDamage(this.enemy.atk, this.stats.def) * this.flowTakenMult() * this.diff.incomingDmgMult * factor);
    if (dmg > 0) this.playerHp = Math.max(0, this.playerHp - dmg);
    return dmg;
  }
  private onPunchMiss(now: number) {
    this.combo = 0; this.perfectStreak = 0; this.superCombo = false; this.noMissCount = 0; this.misses++;
    const dmg = this.takeHit(now);
    this.addPopup(dmg > 0 ? `FALLO  ${dmg}` : "BLOQUEO", dmg > 0 ? "#ff5b5b" : "#7fffa0", "miss", now);
    sfx.miss();
  }
  private onDodgeResolve(n: Note, now: number) {
    if (this.alignedDodges.has(n.id)) {
      n.judged = "dodged"; this.dodgeCount++;
      this.flowMeter = Math.min(100, this.flowMeter + 4 * this.stats.flowGainMult);
      this.addPopup("¡ESQUIVA!", "#7fffa0", "dodge", now); sfx.good();
    } else {
      n.judged = "hit";
      this.combo = 0; this.perfectStreak = 0; this.superCombo = false; this.noMissCount = 0;
      const dmg = this.takeHit(now, 1.2);
      this.addPopup(dmg > 0 ? `GOLPEADO  ${dmg}` : "AGUANTAS", dmg > 0 ? "#ff5b5b" : "#7fffa0", "miss", now); sfx.miss();
    }
  }

  update(songMs: number, now: number, input: InputProvider) {
    if (this.finished) return;
    // amplify lean a touch, then smooth so the head stays locked (no jitter)
    const target = Math.max(-1, Math.min(1, (input.head().x - 0.5) * 2 * 1.3));
    this.headX += (target - this.headX) * 0.35;

    // punches
    let p = input.consumePunch();
    while (p) { this.judgePunch(p, songMs, now); p = input.consumePunch(); }

    // record dodge alignment while in window; resolve when window passes
    for (const n of this.notes) {
      if (n.judged) continue;
      if (n.kind === "punch") { if (songMs - n.tHit > this.diff.goodMs) { n.judged = "miss"; this.onPunchMiss(now); } continue; }
      // dodge
      const inWin = Math.abs(songMs - n.tHit) <= this.diff.dodgeWindowMs;
      if (inWin) { const ok = n.side === "L" ? this.headX < -DODGE_TARGET : this.headX > DODGE_TARGET; if (ok) this.alignedDodges.add(n.id); }
      if (songMs - n.tHit > this.diff.dodgeWindowMs) this.onDodgeResolve(n, now);
    }

    if (this.flowActive && now >= this.flowEndsAt) { this.flowActive = false; this.addPopup("FLOW FIN", "#9fb0c8", "flow", now); }
    this.tryActivateFlow(now);

    if (this.practice) { if (this.notes.every((n) => n.judged) && songMs > 1000) this.end(true); }
    else if (this.enemyHp <= 0) this.end(true);
    else if (this.playerHp <= 0) this.end(false);
    else if (this.notes.every((n) => n.judged) && songMs > 1000) this.end(this.enemyHp < this.enemyMaxHp * 0.5);
  }

  private end(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.result = { won, perfects: this.perfects, goods: this.goods, misses: this.misses, maxCombo: this.maxCombo, superCombos: this.superCount, dodges: this.dodgeCount, enemyMaxHp: this.enemyMaxHp };
    won ? sfx.win() : sfx.lose();
  }

  forceEnd(won: boolean) { this.end(won); }
  flowRef() { return this.flow; }
  enemyRef() { return this.enemy; }
}
