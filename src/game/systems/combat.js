// Combat engine: rhythm sparring. The ball orbits the circle; the player keeps
// their HEAD on it (gate) while throwing L/R punches on the beat. Good vs Perfect,
// Perfect streaks build Super Combos (damage multiplier), and equipped Flow State
// auto-triggers when its condition is met.
import { COMBO, TIMING, counterDamage, hitDamage } from "../data/balance";
import { sfx } from "./audio";
export class Combat {
    constructor(enemy, beatmap, stats, flow) {
        this.enemy = enemy;
        this.stats = stats;
        // public render-facing state
        this.ballAngle = 0;
        this.headAngle = 0;
        this.headOnBall = false;
        this.combo = 0;
        this.perfectStreak = 0;
        this.superCombo = false;
        this.flowActive = false;
        this.flowEndsAt = 0;
        this.flowMeter = 0; // 0..100
        this.popups = [];
        this.finished = false;
        this.result = null;
        this.maxCombo = 0;
        this.perfects = 0;
        this.goods = 0;
        this.misses = 0;
        this.superCount = 0;
        this.noMissCount = 0; // combo without a miss, for flow conditions
        this.notes = beatmap.notes.map((n) => ({ ...n }));
        this.orbitPeriodMs = (60000 / beatmap.bpm) * 4; // one revolution per 4 beats
        this.enemyHp = this.enemyMaxHp = enemy.hp;
        this.playerHp = this.playerMaxHp = stats.vt;
        this.flow = flow;
    }
    addPopup(text, color, now) {
        this.popups.push({ text, color, bornMs: now, x: 0, y: 0 });
        if (this.popups.length > 8)
            this.popups.shift();
    }
    flowDmgMult() {
        if (this.flowActive && this.flow?.buff.damageDealtMult)
            return this.flow.buff.damageDealtMult;
        return 1;
    }
    flowTakenMult() {
        if (!this.flowActive || !this.flow)
            return 1;
        if (this.flow.buff.invulnerable)
            return 0;
        return this.flow.buff.damageTakenMult ?? 1;
    }
    tryActivateFlow(now) {
        if (!this.flow || this.flowActive)
            return;
        const c = this.flow.condition;
        let met = false;
        if (c.kind === "comboNoMiss")
            met = this.noMissCount >= c.value;
        else if (c.kind === "perfectStreak")
            met = this.perfectStreak >= c.value;
        else if (c.kind === "meter")
            met = this.flowMeter >= c.value;
        if (met) {
            this.flowActive = true;
            this.flowEndsAt = now + this.flow.buff.durationMs;
            this.flowMeter = 0;
            this.addPopup(`¡${this.flow.name}!`, "#ffd23b", now);
            sfx.flow();
        }
    }
    judgePunch(side, songMs, now) {
        // find nearest matching-side unjudged note within GOOD window
        let best = null;
        let bestDt = Infinity;
        for (const n of this.notes) {
            if (n.judged || n.side !== side)
                continue;
            const dt = Math.abs(songMs - n.tMs);
            if (dt <= TIMING.GOOD_MS && dt < bestDt) {
                best = n;
                bestDt = dt;
            }
        }
        if (!best) {
            sfx.hit();
            return;
        } // stray jab, no penalty
        // head must be roughly on the ball for a clean hit; otherwise downgrade.
        const gateOk = this.headOnBall;
        let judgement;
        if (bestDt <= TIMING.PERFECT_MS && gateOk)
            judgement = "perfect";
        else
            judgement = "good";
        best.judged = judgement;
        best.hit = true;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.noMissCount++;
        let mult;
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
        }
        else {
            this.goods++;
            this.perfectStreak = 0; // good breaks the perfect streak (and super)
            mult = COMBO.GOOD_DMG_MULT;
            sfx.good();
            this.flowMeter = Math.min(100, this.flowMeter + 2 * this.stats.flowGainMult);
        }
        this.superCombo = this.perfectStreak >= COMBO.SUPER_THRESHOLD;
        if (this.superCombo)
            mult *= COMBO.SUPER_DMG_MULT;
        let dmg = hitDamage(this.stats.atk, this.enemy.def, mult, this.flowDmgMult());
        if (this.flowActive && this.flow?.buff.autoCounter)
            dmg = Math.round(dmg * 1.3); // ora-ora flurry
        this.enemyHp = Math.max(0, this.enemyHp - dmg);
        this.addPopup(`${judgement === "perfect" ? "PERFECT" : "GOOD"} -${dmg}`, judgement === "perfect" ? "#ffd23b" : "#7fd8ff", now);
        this.tryActivateFlow(now);
    }
    onMiss(now) {
        this.combo = 0;
        this.perfectStreak = 0;
        this.superCombo = false;
        this.noMissCount = 0;
        this.misses++;
        const dmg = Math.round(counterDamage(this.enemy.atk, this.stats.def) * this.flowTakenMult());
        if (dmg > 0)
            this.playerHp = Math.max(0, this.playerHp - dmg);
        this.addPopup(dmg > 0 ? `MISS -${dmg}` : "BLOCK", dmg > 0 ? "#ff5b5b" : "#7fffa0", now);
        sfx.miss();
    }
    update(songMs, now, input) {
        if (this.finished)
            return;
        // ball orbit
        this.ballAngle = ((songMs % this.orbitPeriodMs) / this.orbitPeriodMs) * Math.PI * 2;
        // head angle from input (relative to screen center)
        const h = input.head();
        const dx = h.x - 0.5;
        const dy = h.y - 0.5;
        this.headAngle = Math.atan2(-dy, dx); // y inverted to match math angle
        if (Math.hypot(dx, dy) < 0.06)
            this.headOnBall = false; // too centered, not tracking
        else {
            let diff = Math.abs(this.headAngle - this.ballAngle);
            diff = Math.min(diff, Math.PI * 2 - diff);
            this.headOnBall = diff < 0.5; // ~28° tolerance
        }
        if (this.headOnBall)
            this.flowMeter = Math.min(100, this.flowMeter + 0.06 * this.stats.flowGainMult);
        // consume punches
        let p = input.consumePunch();
        while (p) {
            this.judgePunch(p, songMs, now);
            p = input.consumePunch();
        }
        // auto-miss notes whose window has fully passed
        for (const n of this.notes) {
            if (!n.judged && songMs - n.tMs > TIMING.GOOD_MS) {
                n.judged = "miss";
                this.onMiss(now);
            }
        }
        // flow expiry
        if (this.flowActive && now >= this.flowEndsAt) {
            this.flowActive = false;
            this.addPopup("Flow terminado", "#9fb0c8", now);
        }
        this.tryActivateFlow(now);
        // win/lose checks
        if (this.enemyHp <= 0)
            this.end(true);
        else if (this.playerHp <= 0)
            this.end(false);
        else if (this.notes.every((n) => n.judged) && songMs > 1000)
            this.end(this.enemyHp < this.enemyMaxHp * 0.5);
    }
    end(won) {
        if (this.finished)
            return;
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
    activeNotes(songMs) {
        return this.notes.filter((n) => !n.judged && n.tMs - songMs < 1400 && n.tMs - songMs > -TIMING.GOOD_MS);
    }
    noteLead(n, songMs) {
        return (n.tMs - songMs) / 1400; // 1 = far, 0 = now
    }
    enemyRef() { return this.enemy; }
    flowRef() { return this.flow; }
}
