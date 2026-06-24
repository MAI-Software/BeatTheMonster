// Looping background music for the menus. The player picks a favourite song in
// the Radio menu; it plays across all menu screens and pauses during combat.
// Uses a plain HTMLAudioElement (separate from the WebAudio SFX/beat engine).
import { volumes } from "./audio";
import { GLOBAL_SONG } from "./song";
import { getCassette } from "../data/cassettes";

let el: HTMLAudioElement | null = null;
let curId = "";
let userPaused = false; // true when the player explicitly paused menu music

function fileFor(id: string): string {
  if (!id || id === GLOBAL_SONG.id) return GLOBAL_SONG.file;
  return getCassette(id)?.file ?? GLOBAL_SONG.file;
}

// Start (or switch to) the menu song. Safe to call on every navigation —
// it's a no-op if the same track is already playing.
export function ensureMenuMusic(favSong: string): void {
  const id = favSong || GLOBAL_SONG.id;
  if (!el) { el = new Audio(); el.loop = true; }
  el.volume = volumes.music * 0.55;
  // choosing a new song is an explicit play intent -> clear the user pause
  if (id !== curId) { curId = id; el.src = `songs/${fileFor(id)}`; userPaused = false; el.play().catch(() => {}); return; }
  // same song: resume only if the player hasn't turned the music off
  if (!userPaused && el.paused) el.play().catch(() => {});
}

export function stopMenuMusic(): void { if (el) el.pause(); }

export function isMenuPlaying(): boolean { return !!el && !el.paused; }

// Toggle play/pause; returns the new playing state.
export function toggleMenuMusic(): boolean {
  if (!el) return false;
  if (el.paused) { userPaused = false; el.play().catch(() => {}); return true; }
  el.pause(); userPaused = true; return false;
}

export function applyMenuVolume(): void { if (el) el.volume = volumes.music * 0.55; }
