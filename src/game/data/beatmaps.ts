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
  holdMs?: number; // dodge only: keep the head aligned this long (sustained note)
  judged?: "perfect" | "good" | "miss" | "dodged" | "hit";
}

export interface Beatmap { durationMs: number; notes: Note[] }

const MIN_SAME_SIDE_GAP = 360;
const PUNCH_LEAD = 850;
const DODGE_LEAD = 1000;

const GAP_AFTER = 220; // ms breathing room between one event resolving and the next starting

export function buildBeatmap(beats: number[], durationMs: number, enemy: Enemy, diff: Difficulty, seed = 1): Beatmap {
  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
  const notes: Note[] = [];
  let id = 0;
  let side: Side = "R";
  let lastDodge = -1e9;
  // events are strictly sequential: the next one can only START filling after the
  // previous one has fully resolved (+gap). Guarantees one thing on screen at a time.
  let resolveEnd = -1e9;
  const keep = enemy.intensity * 0.85 + 0.25;

  for (const t of beats) {
    if (rand() > keep * diff.density) continue;

    const isDodge = rand() < diff.dodgeRatio && t - lastDodge > 1600;
    const lead = isDodge ? DODGE_LEAD : PUNCH_LEAD;
    const holdMs = isDodge && rand() < 0.4 ? 400 + Math.floor(rand() * 500) : 0; // some dodges are sustained
    const tail = (isDodge ? diff.dodgeWindowMs : diff.goodMs) + holdMs;

    // reject if this event would start before the previous one resolved
    if (t - lead < resolveEnd + GAP_AFTER) continue;

    if (isDodge) {
      const ds: Side = rand() < 0.5 ? "L" : "R";
      notes.push({ id: id++, kind: "dodge", side: ds, tHit: t, leadMs: lead, holdMs });
      lastDodge = t;
    } else {
      side = rand() < 0.6 ? (side === "L" ? "R" : "L") : side; // vary fist
      notes.push({ id: id++, kind: "punch", side, tHit: t, leadMs: lead });
    }
    resolveEnd = t + tail;
  }
  return { durationMs, notes };
}
