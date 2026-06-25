// Minimal WebAudio beat clock + synthesized SFX (no asset files needed for prototype).
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ac();
}

// global volumes (0..1), set from save settings
export const volumes = { music: 0.85, sfx: 0.8 };
export function setVolumes(music: number, sfx: number) { volumes.music = music; volumes.sfx = sfx; }

function blip(freq: number, dur: number, type: OscillatorType, gain = 0.2): void {
  if (volumes.sfx <= 0) return;
  const c = ac();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain * volumes.sfx, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

export const sfx = {
  perfect: () => { blip(880, 0.12, "triangle", 0.25); blip(1320, 0.1, "sine", 0.15); },
  good: () => blip(560, 0.1, "triangle", 0.2),
  miss: () => blip(120, 0.18, "sawtooth", 0.18),
  super: () => { blip(660, 0.18, "square", 0.2); setTimeout(() => blip(990, 0.2, "square", 0.2), 80); },
  flow: () => { blip(330, 0.3, "sawtooth", 0.22); setTimeout(() => blip(440, 0.3, "sawtooth", 0.2), 100); },
  hit: () => blip(220, 0.08, "square", 0.15),
  tick: () => blip(440, 0.04, "sine", 0.08),
  upgrade: () => { [659, 880, 1175].forEach((f, i) => setTimeout(() => blip(f, 0.14, "triangle", 0.24), i * 65)); },
  reveal: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.16, "triangle", 0.22), i * 70)); setTimeout(() => blip(1568, 0.28, "sine", 0.18), 380); },
  track: () => { blip(660, 0.07, "sine", 0.14); setTimeout(() => blip(990, 0.1, "triangle", 0.16), 70); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.22), i * 110)); },
  lose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, "sawtooth", 0.2), i * 160)); },
};

// metronome beat callback scheduler
export class BeatClock {
  private timer = 0;
  constructor(private bpm: number, private onBeat: () => void) {}
  start(): void {
    const beatMs = 60000 / this.bpm;
    this.timer = window.setInterval(() => { sfx.tick(); this.onBeat(); }, beatMs);
  }
  stop(): void { clearInterval(this.timer); }
}
