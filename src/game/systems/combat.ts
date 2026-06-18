// Combat engine: rhythm sparring. The ball orbits the circle; the player keeps
// their HEAD on it (gate) while throwing L/R punches on the beat. Good vs Perfect,
// Perfect streaks build Super Combos (damage multiplier), and equipped Flow State
// auto-triggers when its condition is met.
import { COMBO, TIMING, counterDamage, hitDamage } from "../data/balance";
import type { Beatmap, Note } from "../data/beatmaps";
import type { Enemy } from "../data/enemies";
import type { FlowState } from "../data/flowStates";
import type { EffectiveStats } from "./progression";
import type { InputProvider, Side } from "./pose";
import { sfx } from "./audio";

export interface Popup { text: string; color: string; bornMs: number; x: number; y: number }

export interface CombatResult {
  won: boolean;
  perfects: number;
  goods: number;
  misses: number;
  maxCombo: number;
  superCombos: number;
  enemyMaxHp: number;
}

export class Combat {
  // public render-facing state
  ballAngle = 0;
  headAngle = 0;
  headOnBall = false;
  combo = 0;
  perfectStreak = 0;
  superCombo = false;
  flowActive = false;
  flowEndsAt = 0;
  flowMeter = 0; // 0..100
  enemyHp: number;
  enemyMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  popups: Popup[] = [];
  finished = false;
  result: CombatResult | null = null;

  private notes: Note[];
  private orbitPeriodMs: number;
  private maxCombo = 0;
  private perfects = 0;
  private goods = 0;
  private misses = 0;
  private superCount = 0;
  private flow: FlowState | null;
  private noMissCount = 0; // combo without a miss, for flow conditions

  constructor(
    private enemy: Enemy,
    beatmap: Beatmap,
    private stats: EffectiveStats,
    flow: FlowState | null
  ) {
    this.notes = beatmap.notes.map((n) => ({ ...n }));
    this.orbitPeriodMs = (60000 / beatmap.bpm) * 4; // one revolution per 4 beats
    this.enemyHp = this.enemyMaxHp = enemy.hp;
    this.playerHp = this.playerMaxHp = stats.vt;
    this.flow = flow;
  }

  private addPopup(text: string, color: string, now: number) {
    this.popups.push({ text, color, bornMs: now, x: 0, y: 0 });
    if (this.popups.length > 8) this.popups.shift();
  }

  private flowDmgMult(): number {
    if (this.flowActive && this.flow?.buff.damageDealtMult) return this.flow.buff.damageDealtMult;
    return 1;
  }
  private flowTakenMult(): number {
    if (!this.flowActive || !this.flow) return 1;
    if (this.flow.buff.invulnerable) return 0;
    return this.flow.buff.damageTakenMult ?? 1;
  }

  private tryActivateFlow(now: number) {
    if (!this.flow || this.flowActive) return;
    const c = this.flow.condition;
    let met = false;
    if (c.kind === "comboNoMiss") met = this.noMissCount >= c.value;
    else if (c.kind === "perfectStreak") met = this.perfectStreak >= c.value;
    else if (c.kind === "meter") met = this.flowMeter >= c.value;
    if (met) {
      this.flowActive = true;
      this.flowEndsAt = now + this.flow.buff.durationMs;
      this.flowMeter = 0;
      this.addPopup(`¡${this.flow.name}!`, "#ffd23b", now);
      sfx.flow();
    }
  }

  private judgePunch(side: Side, songMs: number, now: number) {
    // find nearest matching-side unjudged note within GOOD window
    let best: Note | null = null;
    let bestDt = Infinity;
    for (const n of this.notes) {
      if (n.judged || n.side !== side) continue;
      const dt = Math.abs(songMs - n.tMs);
      if (dt <= TIMING.GOOD_MS && dt < bestDt) { best = n; bestDt = dt; }
    }
    if (!best) { sfx.hit(); return; } // stray jab, no penalty

    // head must be roughly on the ball for a clean hit; otherwise downgrade.
    const gateOk = this.headOnBall;
    let judgement: "perfect" | "good";
    if (bestDt <= TIMING.PERFECT_MS && gateOk) judgement = "perfect";
    else judgement = "good";

    best.judged = judgement;
    best.hit = true;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.noMissCount++;

    let mult: number;
    if (judgement === "perfect") {
      this.perfects++;
      this.perfectStreak++;
      mult = COMBO.PERFECT_DMG_MULT;
      sfx.perfect();
      this.flowMeter = Math.min(100, this.flowMeter + 6 * this.stats.flowGainMult);
      if (this.perfectStreak === COMBO.SUPER_THRESHOLD) {
        this.superCount++;
        this.addPopup("¡SUPER COMBO!", "#ff5bd0", now);
        sfx.super();
      }
    } else {
      this.goods++;
      this.perfectStreak = 0; // good breaks the perfect streak (and super)
      mult = COMBO.GOOD_DMG_MULT;
      sfx.good();
      this.flowMeter = Math.min(100, this.flowMeter + 2 * this.stats.flowGainMult);
    }
    this.superCombo = this.perfectStreak >= COMBO.SUPER_THRESHOLD;
    if (this.superCombo) mult *= COMBO.SUPER_DMG_MULT;

    let dmg = hitDamage(this.stats.atk, this.enemy.def, mult, this.flowDmgMult());
    if (this.flowActive && this.flow?.buff.autoCounter) dmg = Math.round(dmg * 1.3); // ora-ora flurry
    this.enemyHp = Math.max(0, this.enemyHp - dmg);

    this.addPopup(`${judgement === "perfect" ? "PERFECT" : "GOOD"} -${dmg}`, judgement === "perfect" ? "#ffd23b" : "#7fd8ff", now);
    this.tryActivateFlow(now);
  }

  private onMiss(now: number) {
    this.combo = 0;
    this.perfectStreak = 0;
    this.superCombo = false;
    this.noMissCount = 0;
    this.misses++;
    const dmg = Math.round(counterDamage(this.enemy.atk, this.stats.def) * this.flowTakenMult());
    if (dmg > 0) this.playerHp = Math.max(0, this.playerHp - dmg);
    this.addPopup(dmg > 0 ? `MISS -${dmg}` : "BLOCK", dmg > 0 ? "#ff5b5b" : "#7fffa0", now);
    sfx.miss();
  }

  update(songMs: number, now: number, input: InputProvider) {
    if (this.finished) return;

    // ball orbit
    this.ballAngle = ((songMs % this.orbitPeriodMs) / this.orbitPeriodMs) * Math.PI * 2;

    // head angle from input (relative to screen center)
    const h = input.head();
    const dx = h.x - 0.5;
    const dy = h.y - 0.5;
    this.headAngle = Math.atan2(-dy, dx); // y inverted to match math angle
    if (Math.hypot(dx, dy) < 0.06) this.headOnBall = false; // too centered, not tracking
    else {
      let diff = Math.abs(this.headAngle - this.ballAngle);
      diff = Math.min(diff, Math.PI * 2 - diff);
      this.headOnBall = diff < 0.5; // ~28° tolerance
    }
    if (this.headOnBall) this.flowMeter = Math.min(100, this.flowMeter + 0.06 * this.stats.flowGainMult);

    // consume punches
    let p = input.consumePunch();
    while (p) { this.judgePunch(p, songMs, now); p = input.consumePunch(); }

    // auto-miss notes whose window has fully passed
    for (const n of this.notes) {
      if (!n.judged && songMs - n.tMs > TIMING.GOOD_MS) { n.judged = "miss"; this.onMiss(now); }
    }

    // flow expiry
    if (this.flowActive && now >= this.flowEndsAt) {
      this.flowActive = false;
      this.addPopup("Flow terminado", "#9fb0c8", now);
    }
    this.tryActivateFlow(now);

    // win/lose checks
    if (this.enemyHp <= 0) this.end(true);
    else if (this.playerHp <= 0) this.end(false);
    else if (this.notes.every((n) => n.judged) && songMs > 1000) this.end(this.enemyHp < this.enemyMaxHp * 0.5);
  }

  private end(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.result = {
      won,
      perfects: this.perfects,
      goods: this.goods,
      misses: this.misses,
      maxCombo: this.maxCombo,
      superCombos: this.superCount,
      enemyMaxHp: this.enemyMaxHp,
    };
    won ? sfx.win() : sfx.lose();
  }

  // expose for render
  activeNotes(songMs: number): Note[] {
    return this.notes.filter((n) => !n.judged && n.tMs - songMs < 1400 && n.tMs - songMs > -TIMING.GOOD_MS);
  }
  noteLead(n: Note, songMs: number): number {
    return (n.tMs - songMs) / 1400; // 1 = far, 0 = now
  }
  enemyRef(): Enemy { return this.enemy; }
  flowRef(): FlowState | null { return this.flow; }
}
