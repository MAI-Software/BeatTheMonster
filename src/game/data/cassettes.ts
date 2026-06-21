// Cassettes = collectible songs. Each boss can drop its cassette (10%) on defeat.
// Unlocked cassettes are playable in the "Canciones" section (free play to the beat).
// `file` (in /public/songs) plays real audio; without it, a synth track at `bpm`.
export interface Cassette {
  id: string;
  name: string;
  enemyId: string; // boss that drops it
  bpm: number;
  file?: string; // optional real audio in public/songs
}

export const CASSETTES: Cassette[] = [
  { id: "cs_goblin",  name: "Ritmo del Goblin",   enemyId: "goblin_scout",  bpm: 90 },
  { id: "cs_orc",     name: "Marcha Orca",         enemyId: "orc_grunt",     bpm: 104 },
  { id: "cs_troll",   name: "Tambores de Piedra",  enemyId: "troll_stone",   bpm: 116 },
  { id: "cs_berserk", name: "Furia Berserker",     enemyId: "orc_berserker", bpm: 128 },
  { id: "cs_ogre",    name: "Pisadas del Ogro",    enemyId: "ogre_brute",    bpm: 140 },
  { id: "cs_demon",   name: "God Is Dead",         enemyId: "portal_demon",  bpm: 150, file: "god-is-dead.mp3" },
];

export function cassetteForBoss(enemyId: string): Cassette | undefined {
  return CASSETTES.find((c) => c.enemyId === enemyId);
}
export function getCassette(id: string): Cassette | undefined {
  return CASSETTES.find((c) => c.id === id);
}
