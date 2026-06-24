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

// Collection rank by number of repeated copies of a collectible.
// Thresholds: 1=F, 2=E, 4=D, 8=C, 16=B, 32=A, 64=S. Past S, +1 every 100 copies.
const COPY_LETTERS = ["F", "E", "D", "C", "B", "A", "S"] as const;
const COPY_THRESH = [1, 2, 4, 8, 16, 32, 64];
const SUPER_STEP = 100; // copies per extra rank / ticket beyond S

export function collectRank(copies: number): string {
  if (copies < 1) return "—";
  let idx = 0;
  for (let i = 0; i < COPY_THRESH.length; i++) if (copies >= COPY_THRESH[i]) idx = i;
  if (copies >= 64) {
    const extra = Math.floor((copies - 64) / SUPER_STEP);
    if (extra > 0) return `S+${extra}`;
  }
  return COPY_LETTERS[idx];
}

// Copies toward the next rank (for the collection detail bar). null once into S+ territory.
export function collectNext(copies: number): { have: number; need: number } | null {
  const next = COPY_THRESH.find((t) => t > copies);
  if (next != null) return { have: copies, need: next };
  const base = 64 + (Math.floor((copies - 64) / SUPER_STEP) + 1) * SUPER_STEP;
  return { have: copies, need: base };
}

// Tickets granted when a collectible's copies grow from `before` to `after`
// (1 per extra +100 step beyond S=64).
export function collectTicketGain(before: number, after: number): number {
  const ext = (n: number) => (n >= 64 ? Math.floor((n - 64) / SUPER_STEP) : 0);
  return Math.max(0, ext(after) - ext(before));
}
