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
const NAMES = ["Marcha Orca", "Tambores de Guerra", "Horda Imparable", "Furia Verde", "Asedio del Portal", "God Is Dead"];

export const CASSETTES: Cassette[] = BOSS_IDS.map((enemyId, i) => ({
  id: `cs_${i + 1}`,
  name: NAMES[i] ?? `Tema ${i + 1}`,
  enemyId,
  bpm: BLOCK_BPM[i] ?? 120,
  file: "god-is-dead.mp3", // only track available right now
}));

export function cassetteForBoss(enemyId: string): Cassette | undefined {
  return CASSETTES.find((c) => c.enemyId === enemyId);
}
export function getCassette(id: string): Cassette | undefined {
  return CASSETTES.find((c) => c.id === id);
}
