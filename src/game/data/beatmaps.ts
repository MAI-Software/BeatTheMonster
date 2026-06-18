// Beatmap v3. Two event kinds woven into the rhythm:
//  - "punch": a circle half (L/R) fills to the rim; punch that fist when full.
//  - "dodge": a sphere appears on the OUTER rim (left or right); lean your head to
//    that side to dodge before it lands. Dodges appear sometimes and alternate with
//    punches. Density / dodge frequency / timing come from the chosen Difficulty.
import type { Enemy } from "./enemies";
import type { Difficulty } from "./difficulty";

export type Side = "L" | "R";
export type NoteKind = "punch" | "dodge";

export interface Note {
  id: number;
  kind: NoteKind;
  side: Side;
  tHit: number; // ms — the moment to act (punch lands / dodge connects)
  leadMs: number; // approach time before tHit
  judged?: "perfect" | "good" | "miss" | "dodged" | "hit";
}

export interface Beatmap { durationMs: number; notes: Note[] }

const MIN_SAME_SIDE_GAP = 360;
const PUNCH_LEAD = 850;
const DODGE_LEAD = 1000;

export function buildBeatmap(beats: number[], durationMs: number, enemy: Enemy, diff: Difficulty, seed = 1): Beatmap {
  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
  const notes: Note[] = [];
  let id = 0;
  let side: Side = "R";
  const lastPunch: Record<Side, number> = { L: -1e9, R: -1e9 };
  let lastDodge = -1e9;
  const keep = enemy.intensity * 0.85 + 0.25;

  for (const t of beats) {
    if (rand() > keep * diff.density) continue;

    // dodge sometimes, alternating with punches; keep dodges spaced out
    if (rand() < diff.dodgeRatio && t - lastDodge > 1400) {
      const ds: Side = rand() < 0.5 ? "L" : "R";
      notes.push({ id: id++, kind: "dodge", side: ds, tHit: t, leadMs: DODGE_LEAD });
      lastDodge = t;
      continue;
    }

    side = rand() < 0.78 ? (side === "L" ? "R" : "L") : side;
    if (t - lastPunch[side] < MIN_SAME_SIDE_GAP) side = side === "L" ? "R" : "L";
    if (t - lastPunch[side] < MIN_SAME_SIDE_GAP) continue;
    const lead = Math.min(PUNCH_LEAD, Math.max(420, t - lastPunch[side] - 40));
    notes.push({ id: id++, kind: "punch", side, tHit: t, leadMs: lead });
    lastPunch[side] = t;
  }
  return { durationMs, notes };
}
