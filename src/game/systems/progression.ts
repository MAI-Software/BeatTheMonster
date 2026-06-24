// Player progression: XP/level, training, vouchers, and EFFECTIVE stats (base + gear).
import { CAPS, clampStat, trainCost, xpToNext } from "../data/balance";
import { getEquipment } from "../data/equipment";
import type { SaveState } from "../core/storage";

export interface EffectiveStats {
  atk: number;
  def: number;
  vt: number;
  flowGainMult: number;
}

export function effectiveStats(s: SaveState): EffectiveStats {
  let atk = s.stats.atk;
  let def = s.stats.def;
  let vt = s.stats.vt;
  let flowGainMult = 1;
  for (const slot of Object.keys(s.equippedGear)) {
    const id = s.equippedGear[slot];
    if (!id) continue;
    const e = getEquipment(id);
    if (!e) continue;
    atk += e.bonus.atk ?? 0;
    def += e.bonus.def ?? 0;
    vt += e.bonus.vt ?? 0;
    flowGainMult *= e.bonus.flowGainMult ?? 1;
  }
  return {
    atk: Math.min(CAPS.ATK, atk),
    def: Math.min(CAPS.DEF, def),
    vt: Math.min(CAPS.VT, vt),
    flowGainMult,
  };
}

export function grantXp(s: SaveState, amount: number): { leveled: boolean; levels: number } {
  if (s.level >= CAPS.PLAYER_LEVEL) return { leveled: false, levels: 0 };
  s.xp += amount;
  let levels = 0;
  while (s.level < CAPS.PLAYER_LEVEL && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    levels++;
    // small auto stat gains per level
    s.stats.atk = clampStat("atk", s.stats.atk + 1);
    s.stats.def = clampStat("def", s.stats.def + 1);
    s.stats.vt = clampStat("vt", s.stats.vt + 8);
  }
  if (s.level >= CAPS.PLAYER_LEVEL) s.xp = 0;
  return { leveled: levels > 0, levels };
}

export function canTrain(s: SaveState, stat: "atk" | "def" | "vt"): boolean {
  const cur = s.stats[stat];
  const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
  return cur < max && s.coins >= trainCost(stat, cur);
}

export function train(s: SaveState, stat: "atk" | "def" | "vt"): boolean {
  if (!canTrain(s, stat)) return false;
  const cur = s.stats[stat];
  s.coins -= trainCost(stat, cur);
  s.stats[stat] = clampStat(stat, cur + (stat === "vt" ? 10 : 1));
  return true;
}

// Gem (gemalma) price to train a stat — small, scales with the coin cost.
export function gemTrainCost(stat: "atk" | "def" | "vt", current: number): number {
  return Math.max(1, Math.ceil(trainCost(stat, current) / 60));
}

// Train paying with gems instead of coins.
export function trainWithGems(s: SaveState, stat: "atk" | "def" | "vt"): boolean {
  const cur = s.stats[stat];
  const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
  const price = gemTrainCost(stat, cur);
  if (cur >= max || s.premium < price) return false;
  s.premium -= price;
  s.stats[stat] = clampStat(stat, cur + (stat === "vt" ? 10 : 1));
  return true;
}

// Spend a stat voucher: +1 atk/def or +10 vt, ignores coin cost, respects caps.
export function spendVoucher(s: SaveState, stat: "atk" | "def" | "vt"): boolean {
  if (s.statVouchers <= 0) return false;
  const cur = s.stats[stat];
  const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
  if (cur >= max) return false;
  s.statVouchers--;
  s.stats[stat] = clampStat(stat, cur + (stat === "vt" ? 10 : 1));
  return true;
}

export { xpToNext, trainCost };
