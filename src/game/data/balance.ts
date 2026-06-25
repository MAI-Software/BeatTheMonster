// Central balance constants + formulas. Single source of truth for caps.

export const CAPS = {
  PLAYER_LEVEL: 999,
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
  PERFECT_DMG_MULT: 2.0,
  GOOD_DMG_MULT: 1.0,
  MISS_DMG_MULT: 0,
} as const;

// XP curve: xp needed to go from level L to L+1.
export function xpToNext(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.35) + 50);
}

// Hit damage: flat atk minus defender def, minimum 1. Perfect doubles it
// (PERFECT_DMG_MULT = 2). Flow buffs still apply on top.
export function hitDamage(
  atk: number,
  defenderDef: number,
  judgementMult: number,
  flowDmgMult = 1
): number {
  const base = Math.max(1, atk - defenderDef);
  return Math.max(1, Math.round(base * judgementMult * flowDmgMult));
}

// Incoming damage to player when a beat is missed: enemy atk minus player def, min 1.
export function counterDamage(enemyAtk: number, playerDef: number): number {
  return Math.max(1, enemyAtk - playerDef);
}

// Training cost (coins) to raise a stat, scales with current value AND steps up
// in brackets (tramos): each tier of progress adds a flat multiplier. Approximate.
export function trainCost(stat: "atk" | "def" | "vt", current: number): number {
  const base = stat === "vt" ? 8 : 25;
  const tierSize = stat === "vt" ? 200 : 20;
  const bracketMult = 1 + Math.floor(current / tierSize) * 0.5; // +50% per bracket
  return Math.floor(base * (1 + current * 0.06) * bracketMult);
}

// Player rank by level.
export function playerRank(level: number): string {
  if (level >= 700) return "Maestro";
  if (level >= 350) return "Experto";
  if (level >= 150) return "Profesional";
  if (level >= 50) return "Avanzado";
  if (level >= 10) return "Novato";
  return "Inútil";
}

export function clampStat(stat: "atk" | "def" | "vt", v: number): number {
  const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
  return Math.max(stat === "vt" ? 1 : 0, Math.min(max, v));
}
