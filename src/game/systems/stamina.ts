// Energy ("batido de proteínas") = stamina for the adventure. Max 10 at level 1,
// +1 per player level. Regenerates 1 every REGEN_MS. Each phase costs energy.
import type { SaveState } from "../core/storage";

export const REGEN_MS = 5 * 60 * 1000; // 1 energy per 5 minutes
export const BASE_MAX = 10;

export function maxEnergy(s: SaveState): number {
  return BASE_MAX + (s.level - 1);
}

// Apply time-based regen, mutating the save. Returns current energy.
export function refreshEnergy(s: SaveState): number {
  const max = maxEnergy(s);
  if (s.energy >= max) { s.energy = max; s.energyTs = Date.now(); return s.energy; }
  const now = Date.now();
  const elapsed = now - s.energyTs;
  const gained = Math.floor(elapsed / REGEN_MS);
  if (gained > 0) {
    s.energy = Math.min(max, s.energy + gained);
    s.energyTs = s.energy >= max ? now : s.energyTs + gained * REGEN_MS;
  }
  return s.energy;
}

export function msToNext(s: SaveState): number {
  if (s.energy >= maxEnergy(s)) return 0;
  return Math.max(0, REGEN_MS - (Date.now() - s.energyTs));
}

export function canAfford(s: SaveState, cost: number): boolean {
  return refreshEnergy(s) >= cost;
}

export function spendEnergy(s: SaveState, cost: number): boolean {
  if (!canAfford(s, cost)) return false;
  const wasFull = s.energy >= maxEnergy(s);
  s.energy -= cost;
  if (wasFull) s.energyTs = Date.now(); // start the regen clock from a full bar
  return true;
}

// nice mm:ss
export function fmtTime(ms: number): string {
  const t = Math.ceil(ms / 1000);
  const m = Math.floor(t / 60), sec = t % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
