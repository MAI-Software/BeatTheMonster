// Collection / album. Defeating a boss has a small chance to drop its SEAL.
// Every 5 seals of a boss ranks it up (F → SSS). Each rank-up grants a stat ticket.
export const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"] as const;
export type Rank = (typeof RANKS)[number];

export const SEALS_PER_RANK = 5;
export const SEAL_DROP_CHANCE = 0.05; // 5% per boss defeat

export function rankIndex(seals: number): number {
  return Math.min(RANKS.length - 1, Math.floor(seals / SEALS_PER_RANK));
}
export function rankLabel(seals: number): Rank {
  return RANKS[rankIndex(seals)];
}
// seals collected toward the NEXT rank (0..SEALS_PER_RANK), and whether maxed.
export function rankProgress(seals: number): { have: number; need: number; maxed: boolean } {
  if (rankIndex(seals) >= RANKS.length - 1) return { have: SEALS_PER_RANK, need: SEALS_PER_RANK, maxed: true };
  return { have: seals % SEALS_PER_RANK, need: SEALS_PER_RANK, maxed: false };
}
