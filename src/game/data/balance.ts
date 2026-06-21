// Central balance constants + formulas. Single source of truth for caps.

export const CAPS = {
  PLAYER_LEVEL: 100,
  ATK: 9999,
  DEF: 9999,
  VT: 99999,
} as const;

// Timing windows in milliseconds (half-width around the beat).
export const TIMING = {
  PERFECT_MS: 70,
  GOOD_MS: 150, // good if within this but outside perfect
} as const;

// Combo / super combo.
export const COMBO = {
  SUPER_THRESHOLD: 8, // perfects in a row to enter Super Combo
  SUPER_DMG_MULT: 2.5, // damage multiplier while in Super Combo
  PERFECT_DMG_MULT: 1.5,
  GOOD_DMG_MULT: 1.0,
  MISS_DMG_MULT: 0,
} as const;

// XP curve: xp needed to go from level L to L+1.
export function xpToNext(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.35) + 50);
}

// Hit damage: attacker atk vs defender def, scaled by judgement mult and flow buffs.
export function hitDamage(
  atk: number,
  defenderDef: number,
  judgementMult: number,
  flowDmgMult = 1
): number {
  const base = atk * (100 / (100 + defenderDef)); // soft diminishing def
  return Math.max(1, Math.round(base * judgementMult * flowDmgMult));
}

// Incoming damage to player when a beat is missed (enemy counter).
export function counterDamage(enemyAtk: number, playerDef: number): number {
  const base = enemyAtk * (100 / (100 + playerDef));
  return Math.max(1, Math.round(base));
}

// Training cost (coins) to raise a stat by one point, scales with current value.
export function trainCost(stat: "atk" | "def" | "vt", current: number): number {
  const base = stat === "vt" ? 8 : 25;
  return Math.floor(base * (1 + current * 0.06));
}

export function clampStat(stat: "atk" | "def" | "vt", v: number): number {
  const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
  return Math.max(stat === "vt" ? 1 : 0, Math.min(max, v));
}
