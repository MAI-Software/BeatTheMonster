// Procedural beatmap generator. A beat map is the rhythm track for one fight.
// Two input types woven together:
//  - "track": the ball orbits the circle; player keeps their HEAD on the ball.
//  - "punch": a note pops at one of 4 circle points; player throws the matching
//    fist. Left half of the sphere => left fist, right half => right fist.
import type { Enemy } from "./enemies";

export type Side = "L" | "R";

// 4 cardinal points on the circle, angle in radians (0 = right, CCW).
export const POINTS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

export interface Note {
  id: number;
  tMs: number; // when it must be hit
  angle: number; // position on circle
  side: Side; // which fist (derived from left/right half)
  hit?: boolean;
  judged?: "perfect" | "good" | "miss";
}

export interface Beatmap {
  bpm: number;
  durationMs: number;
  notes: Note[];
}

function sideForAngle(angle: number): Side {
  // Right half of circle (cos > 0) => right fist, else left.
  return Math.cos(angle) >= 0 ? "R" : "L";
}

export function generateBeatmap(enemy: Enemy, seed = 1): Beatmap {
  const beatMs = 60000 / enemy.bpm;
  const beats = 64; // ~length of a round
  const notes: Note[] = [];
  let rng = seed * 9301 + 49297;
  const rand = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  let id = 0;
  for (let b = 4; b < beats; b++) {
    // density scales with intensity; skip some beats early on.
    if (rand() > enemy.intensity * 0.9 + 0.25) continue;
    const pIdx = Math.floor(rand() * POINTS.length) % POINTS.length;
    const angle = POINTS[pIdx];
    notes.push({
      id: id++,
      tMs: b * beatMs,
      angle,
      side: sideForAngle(angle),
    });
    // double notes at high intensity
    if (enemy.intensity > 0.7 && rand() > 0.7) {
      const a2 = POINTS[(pIdx + 2) % POINTS.length];
      notes.push({ id: id++, tMs: b * beatMs + beatMs / 2, angle: a2, side: sideForAngle(a2) });
    }
  }
  return { bpm: enemy.bpm, durationMs: beats * beatMs, notes };
}
