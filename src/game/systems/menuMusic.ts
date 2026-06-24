// Looping background music for the menus. The player picks a favourite song in
// the Radio menu; it plays across all menu screens and pauses during combat.
// Uses a plain HTMLAudioElement (separate from the WebAudio SFX/beat engine).
import { volumes } from "./audio";
import { GLOBAL_SONG } from "./song";
import { getCassette } from "../data/cassettes";

let el: HTMLAudioElement | null = null;
let curId = "";

function fileFor(id: string): string {
  if (!id || id === GLOBAL_SONG.id) return GLOBAL_SONG.file;
  return getCassette(id)?.file ?? GLOBAL_SONG.file;
}

// Start (or switch to) the menu song. Callers decide whether music is enabled
// (persisted account setting); this just plays the chosen track.
export function ensureMenuMusic(favSong: string): void {
  const id = favSong || GLOBAL_SONG.id;
  if (!el) { el = new Audio(); el.loop = true; }
  el.volume = volumes.music * 0.55;
  if (id !== curId) { curId = id; el.src = `songs/${fileFor(id)}`; el.play().catch(() => {}); return; }
  if (el.paused) el.play().catch(() => {});
}

export function stopMenuMusic(): void { if (el) el.pause(); }

export function isMenuPlaying(): boolean { return !!el && !el.paused; }

export function applyMenuVolume(): void { if (el) el.volume = volumes.music * 0.55; }
