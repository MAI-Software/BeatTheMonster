// Minimal WebAudio beat clock + synthesized SFX (no asset files needed for prototype).
let ctx = null;
function ac() {
    if (!ctx)
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended")
        ctx.resume();
    return ctx;
}
export function unlockAudio() {
    ac();
}
function blip(freq, dur, type, gain = 0.2) {
    const c = ac();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
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
    win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.22), i * 110)); },
    lose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, "sawtooth", 0.2), i * 160)); },
};
// metronome beat callback scheduler
export class BeatClock {
    constructor(bpm, onBeat) {
        this.bpm = bpm;
        this.onBeat = onBeat;
        this.timer = 0;
    }
    start() {
        const beatMs = 60000 / this.bpm;
        this.timer = window.setInterval(() => { sfx.tick(); this.onBeat(); }, beatMs);
    }
    stop() { clearInterval(this.timer); }
}
