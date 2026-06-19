// Song system: loads the player's own audio files, detects beats offline, and
// drives combat with an audio-locked clock so the fight stays in sync with music.
// Falls back to a synthesized metronome track when no song is selected.
import { sfx } from "./audio";

export interface SongMeta { id: string; name: string; file: string; bpm?: number }

// Default track for every fight (long song; the fight ends when the enemy falls).
export const GLOBAL_SONG: SongMeta = { id: "god_is_dead", name: "God Is Dead", file: "god-is-dead.mp3" };

let _ctx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// Each enemy/mode has its own folder under /public/songs/<id>/ with a manifest.json.
// Drop an audio file there + list it and it becomes that enemy's battle music.
// File paths are returned already prefixed with the folder so loadSongPlayer works.
export async function listSongs(folder: string): Promise<SongMeta[]> {
  try {
    const res = await fetch(`songs/${folder}/manifest.json`, { cache: "no-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    const list: SongMeta[] = Array.isArray(data) ? data : data.songs ?? [];
    return list.map((m) => ({ ...m, file: `${folder}/${m.file}` }));
  } catch {
    return [];
  }
}

export interface SongPlayer {
  kind: "audio" | "synth";
  durationMs: number;
  beats: number[]; // beat times in ms
  timeMs(): number; // current playback position
  start(): void;
  stop(): void;
}

// ---------- offline beat detection (energy-onset) ----------
function detectBeats(buf: AudioBuffer): number[] {
  const ch = buf.numberOfChannels > 1
    ? mixMono(buf)
    : buf.getChannelData(0);
  const sr = buf.sampleRate;
  const frame = 1024, hop = 512;
  const energies: number[] = [];
  for (let i = 0; i + frame < ch.length; i += hop) {
    let e = 0;
    for (let j = 0; j < frame; j++) { const s = ch[i + j]; e += s * s; }
    energies.push(e / frame);
  }
  // local-average threshold + peak picking
  const win = 43; // ~0.5s history
  const beats: number[] = [];
  let lastT = -1;
  for (let i = 1; i < energies.length - 1; i++) {
    const a = Math.max(0, i - win);
    let avg = 0;
    for (let k = a; k < i; k++) avg += energies[k];
    avg /= (i - a) || 1;
    const e = energies[i];
    const isPeak = e > energies[i - 1] && e >= energies[i + 1];
    if (isPeak && e > avg * 1.35 && e > 1e-4) {
      const t = (i * hop) / sr;
      if (lastT < 0 || t - lastT > 0.16) { beats.push(t * 1000); lastT = t; }
    }
  }
  return beats;
}

function mixMono(buf: AudioBuffer): Float32Array {
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  for (let i = 0; i < n; i++) out[i] /= buf.numberOfChannels;
  return out;
}

// ---------- audio-backed player ----------
export async function loadSongPlayer(meta: SongMeta): Promise<SongPlayer> {
  const c = ctx();
  const res = await fetch(`songs/${meta.file}`);
  const arr = await res.arrayBuffer();
  const buf = await c.decodeAudioData(arr);
  const beats = detectBeats(buf);
  let src: AudioBufferSourceNode | null = null;
  let startedAt = 0;
  return {
    kind: "audio",
    durationMs: buf.duration * 1000,
    beats,
    timeMs() { return src ? (c.currentTime - startedAt) * 1000 : -1; },
    start() {
      src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = 0.85;
      src.connect(g).connect(c.destination);
      startedAt = c.currentTime + 0.05;
      src.start(startedAt);
    },
    stop() { try { src?.stop(); } catch {} src = null; },
  };
}

// ---------- synth fallback: metronome clock from a bpm ----------
export function synthSongPlayer(bpm: number, bars = 32): SongPlayer {
  const beatMs = 60000 / bpm;
  const total = bars * 4;
  const beats: number[] = [];
  for (let i = 4; i < total; i++) beats.push(i * beatMs);
  let t0 = 0;
  let metro = 0;
  return {
    kind: "synth",
    durationMs: total * beatMs,
    beats,
    timeMs() { return t0 ? performance.now() - t0 : -1; },
    start() {
      t0 = performance.now() + 50;
      metro = window.setInterval(() => sfx.tick(), beatMs);
    },
    stop() { clearInterval(metro); },
  };
}

export function unlockSongAudio() { ctx(); }
