// Local ranking board. No PvP (cost/difficulty) — instead a score leaderboard the
// player climbs against seeded "ghost" entries plus their own best runs.
import type { SaveState } from "../core/storage";

export interface RankEntry { name: string; score: number; you?: boolean }

const GHOSTS: RankEntry[] = [
  { name: "K.O. King", score: 98000 },
  { name: "RhythmRey", score: 86500 },
  { name: "FlowMaster", score: 72000 },
  { name: "ComboKid", score: 61000 },
  { name: "JabJabJab", score: 50500 },
  { name: "Pibe del Ritmo", score: 41000 },
  { name: "NovatoPro", score: 28000 },
  { name: "GuanteRoto", score: 15500 },
];

// Score for a single fight.
export function fightScore(opts: {
  perfects: number;
  goods: number;
  maxCombo: number;
  superCombos: number;
  won: boolean;
  enemyHp: number;
}): number {
  const base = opts.perfects * 300 + opts.goods * 100;
  const comboBonus = opts.maxCombo * 50;
  const superBonus = opts.superCombos * 1500;
  const winBonus = opts.won ? opts.enemyHp * 3 : 0;
  return Math.round(base + comboBonus + superBonus + winBonus);
}

export function leaderboard(s: SaveState): RankEntry[] {
  const me: RankEntry = { name: s.nick || "TÚ", score: s.bestScore, you: true };
  return [...GHOSTS, me].sort((a, b) => b.score - a.score);
}

export function myRank(s: SaveState): number {
  return leaderboard(s).findIndex((e) => e.you) + 1;
}
