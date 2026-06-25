// Difficulty modes. Tune timing windows, note density, how often dodge spheres
// appear, and how hard the enemy hits.
export type DifficultyId = "easy" | "normal" | "hard" | "master";

export interface Difficulty {
  id: DifficultyId;
  name: string;
  perfectMs: number; // half-window for Perfect
  goodMs: number; // half-window for Good
  density: number; // multiplier on note density
  dodgeRatio: number; // fraction of events that are dodge spheres
  dodgeWindowMs: number; // alignment tolerance window around a dodge hit
  incomingDmgMult: number; // scales damage the player takes
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy:   { id: "easy",   name: "Fácil",   perfectMs: 105, goodMs: 210, density: 0.62, dodgeRatio: 0.14, dodgeWindowMs: 260, incomingDmgMult: 0.6 },
  normal: { id: "normal", name: "Normal",  perfectMs: 75,  goodMs: 155, density: 0.85, dodgeRatio: 0.24, dodgeWindowMs: 210, incomingDmgMult: 1.0 },
  hard:   { id: "hard",   name: "Difícil", perfectMs: 58,  goodMs: 125, density: 1.0,  dodgeRatio: 0.34, dodgeWindowMs: 175, incomingDmgMult: 1.45 },
  master: { id: "master", name: "Maestro", perfectMs: 46,  goodMs: 98,  density: 1.18, dodgeRatio: 0.44, dodgeWindowMs: 150, incomingDmgMult: 1.9 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "hard", "master"];

// Unlock requirements: clear a win on the previous tier AND reach a minimum level.
export interface UnlockReq { prev: DifficultyId | null; minLevel: number }
export const UNLOCK: Record<DifficultyId, UnlockReq> = {
  easy:   { prev: null,     minLevel: 1 },
  normal: { prev: "easy",   minLevel: 5 },
  hard:   { prev: "normal", minLevel: 15 },
  master: { prev: "hard",   minLevel: 30 },
};

export function isDifficultyUnlocked(id: DifficultyId, level: number, wins: Record<string, number>): boolean {
  const req = UNLOCK[id];
  if (level < req.minLevel) return false;
  if (req.prev && (wins[req.prev] ?? 0) < 1) return false;
  return true;
}

// New rule: a difficulty unlocks once the chapter is completed on the previous one.
export function diffUnlocked(id: DifficultyId, chapterDone: Record<string, boolean>): boolean {
  const prev = UNLOCK[id].prev;
  return !prev || !!chapterDone[prev];
}

export function unlockHint(id: DifficultyId): string {
  const req = UNLOCK[id];
  const parts: string[] = [];
  if (req.prev) parts.push(`Gana en ${DIFFICULTIES[req.prev].name}`);
  if (req.minLevel > 1) parts.push(`Nivel ${req.minLevel}`);
  return parts.join(" · ");
}
