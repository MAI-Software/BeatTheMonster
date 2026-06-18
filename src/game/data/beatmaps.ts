// Beatmap v2. A note = a half of the circle (LEFT or RIGHT) that fills radially
// from the centre to the rim; the player punches that fist the instant it fills
// to the contour (tHit). Built from real song beats or a synthetic metronome.
import type { Enemy } from "./enemies";

export type Side = "L" | "R";

export interface Note {
  id: number;
  side: Side;
  tHit: number; // ms — fill reaches the rim here; the hit moment
  leadMs: number; // fill duration before tHit
  judged?: "perfect" | "good" | "miss";
}

export interface Beatmap {
  durationMs: number;
  notes: Note[];
}

const MIN_SAME_SIDE_GAP = 360; // ms — never overlap two fills on one side
const DEFAULT_LEAD = 850;

// Build from detected beat times (ms). Intensity thins/keeps beats; sides alternate
// with occasional repeats, but never closer than MIN_SAME_SIDE_GAP on the same side.
export function beatmapFromBeats(beats: number[], durationMs: number, intensity: number, seed = 1): Beatmap {
  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
  const notes: Note[] = [];
  let id = 0;
  let side: Side = "R";
  const lastByside: Record<Side, number> = { L: -1e9, R: -1e9 };
  for (const t of beats) {
    if (rand() > intensity * 0.85 + 0.25) continue; // density
    // pick side: mostly alternate, sometimes repeat
    side = rand() < 0.78 ? (side === "L" ? "R" : "L") : side;
    if (t - lastByside[side] < MIN_SAME_SIDE_GAP) side = side === "L" ? "R" : "L";
    if (t - lastByside[side] < MIN_SAME_SIDE_GAP) continue;
    const lead = Math.min(DEFAULT_LEAD, Math.max(420, t - lastByside[side] - 40));
    notes.push({ id: id++, side, tHit: t, leadMs: lead });
    lastByside[side] = t;
  }
  return { durationMs, notes };
}

export function syntheticBeatmap(enemy: Enemy, beats: number[], durationMs: number, seed = 1): Beatmap {
  return beatmapFromBeats(beats, durationMs, enemy.intensity, seed);
}
