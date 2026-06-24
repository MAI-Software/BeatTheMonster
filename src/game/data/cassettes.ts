// Cassettes = collectible songs, one per chapter boss. A boss can drop its cassette
// (10%) on defeat; unlocked cassettes are playable in "Canciones" (free play).
// `file` plays real audio from /public/songs. Only "God Is Dead" exists for now, so
// every block currently points to it (swap files in when new songs arrive).
import { BOSS_IDS } from "./enemies";

export interface Cassette {
  id: string;
  name: string;
  enemyId: string; // boss that drops it
  bpm: number;
  file?: string;
}

const BLOCK_BPM = [92, 104, 116, 128, 140, 150];
// One song per 5-level block (block 0 = levels 1-5 ... block 5 = levels 26-30).
// Wasteland opens the campaign; God Is Dead closes it.
const NAMES = ["Wasteland", "Feral Hearts", "Learn Fast", "No Gods Here", "Hollow Mirrors", "God Is Dead"];
const FILES = ["wasteland.mp3", "feral-hearts.mp3", "learn-fast.mp3", "no-gods-here.mp3", "hollow-mirrors.mp3", "god-is-dead.mp3"];

export const CASSETTES: Cassette[] = BOSS_IDS.map((enemyId, i) => ({
  id: `cs_${i + 1}`,
  name: NAMES[i] ?? `Tema ${i + 1}`,
  enemyId,
  bpm: BLOCK_BPM[i] ?? 120,
  file: FILES[i] ?? "god-is-dead.mp3",
}));

// SongMeta for a campaign block (0..5) — that block's theme song.
export function songForBlock(block: number): { id: string; name: string; file: string; bpm: number } {
  const c = CASSETTES[Math.max(0, Math.min(CASSETTES.length - 1, block))];
  return { id: c.id, name: c.name, file: c.file!, bpm: c.bpm };
}

export function cassetteForBoss(enemyId: string): Cassette | undefined {
  return CASSETTES.find((c) => c.enemyId === enemyId);
}
export function getCassette(id: string): Cassette | undefined {
  return CASSETTES.find((c) => c.id === id);
}
