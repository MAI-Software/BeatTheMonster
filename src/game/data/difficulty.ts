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
