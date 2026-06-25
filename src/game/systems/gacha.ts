// Gacha: spend currency on a banner, receive FRAGMENTS. Collect enough frags to
// craft/own the item. Common item = 20 frags; a normal-banner pull of a common
// yields ~4-5 frags, so ~4-5 pulls per common. Premium banner = better odds + flow states.
import { EQUIPMENT, FRAGS_TO_CRAFT, getEquipment } from "../data/equipment";
import { FLOW_STATES, getFlowState } from "../data/flowStates";
import type { Rarity } from "../data/flowStates";
import type { SaveState } from "../core/storage";

export const PULL_COST = { normal: 1000, premium: 100 } as const; // premium uses premium currency

export interface PullResult {
  itemId: string;
  itemName: string;
  rarity: Rarity;
  fragsGained: number;
  crafted: boolean; // crossed the craft threshold this pull
  isFlow: boolean;
}

const NORMAL_ODDS: Record<Rarity, number> = { common: 0.70, uncommon: 0.18, rare: 0.08, epic: 0.03, legendary: 0.008, unique: 0.002 };
const PREMIUM_ODDS: Record<Rarity, number> = { common: 0.35, uncommon: 0.30, rare: 0.22, epic: 0.10, legendary: 0.025, unique: 0.005 };

function pickRarity(odds: Record<Rarity, number>): Rarity {
  const r = Math.random();
  let acc = 0;
  for (const k of ["unique", "legendary", "epic", "rare", "uncommon", "common"] as Rarity[]) {
    acc += odds[k];
    if (r < acc) return k;
  }
  return "common";
}

function fragsForRarity(rarity: Rarity): number {
  // common gives the most fragments; rarer = fewer per pull.
  switch (rarity) {
    case "common": return 4 + Math.floor(Math.random() * 2); // 4-5
    case "uncommon": return 3 + Math.floor(Math.random() * 2); // 3-4
    case "rare": return 3 + Math.floor(Math.random() * 2); // 3-4
    case "epic": return 2 + Math.floor(Math.random() * 2); // 2-3
    case "legendary": return 1 + Math.floor(Math.random() * 2); // 1-2
    case "unique": return 1;
    default: return 2;
  }
}

export function canPull(s: SaveState, banner: "normal" | "premium"): boolean {
  return banner === "normal" ? s.coins >= PULL_COST.normal : s.premium >= PULL_COST.premium;
}
export function canPullN(s: SaveState, banner: "normal" | "premium", n: number): boolean {
  const cost = (banner === "normal" ? PULL_COST.normal : PULL_COST.premium) * n;
  return banner === "normal" ? s.coins >= cost : s.premium >= cost;
}

// Watch-ad free pulls: 1 basic pull, recharges 1 every 2h up to 5. Placeholder for
// a real rewarded ad (Google/Apple) — for now it grants the pull instantly.
export const AD_REGEN_MS = 2 * 60 * 60 * 1000;
export const AD_MAX = 5;
export function refreshAds(s: SaveState): number {
  if (s.ads >= AD_MAX) { s.ads = AD_MAX; s.adsTs = Date.now(); return s.ads; }
  const now = Date.now();
  const gained = Math.floor((now - s.adsTs) / AD_REGEN_MS);
  if (gained > 0) { s.ads = Math.min(AD_MAX, s.ads + gained); s.adsTs = s.ads >= AD_MAX ? now : s.adsTs + gained * AD_REGEN_MS; }
  return s.ads;
}
export function adMsToNext(s: SaveState): number {
  refreshAds(s);
  return s.ads >= AD_MAX ? 0 : Math.max(0, AD_REGEN_MS - (Date.now() - s.adsTs));
}
export function watchAd(s: SaveState): PullResult | null {
  if (refreshAds(s) <= 0) return null;
  const wasFull = s.ads >= AD_MAX;
  s.ads -= 1;
  if (wasFull) s.adsTs = Date.now();
  return rollPull(s, "normal"); // free basic (normal) pull
}

export function pull(s: SaveState, banner: "normal" | "premium"): PullResult | null {
  if (!canPull(s, banner)) return null;
  if (banner === "normal") s.coins -= PULL_COST.normal;
  else s.premium -= PULL_COST.premium;
  return rollPull(s, banner);
}

function rollPull(s: SaveState, banner: "normal" | "premium"): PullResult {
  const odds = banner === "normal" ? NORMAL_ODDS : PREMIUM_ODDS;
  const rarity = pickRarity(odds);

  // premium banner can drop flow states; normal banner = gear only.
  const flowChance = banner === "premium" ? 0.35 : 0;
  const isFlow = Math.random() < flowChance;

  let itemId: string;
  let itemName: string;
  let threshold: number;
  if (isFlow) {
    const pool = FLOW_STATES.filter((f) => f.rarity === rarity);
    const chosen = (pool.length ? pool : FLOW_STATES)[Math.floor(Math.random() * (pool.length || FLOW_STATES.length))];
    itemId = chosen.id;
    itemName = chosen.name;
    threshold = FRAGS_TO_CRAFT[chosen.rarity];
  } else {
    const pool = EQUIPMENT.filter((e) => e.rarity === rarity);
    const chosen = (pool.length ? pool : EQUIPMENT)[Math.floor(Math.random() * (pool.length || EQUIPMENT.length))];
    itemId = chosen.id;
    itemName = chosen.name;
    threshold = chosen.fragsToCraft;
  }

  // fragments only accumulate here; the player CRAFTS the item manually later.
  const gained = fragsForRarity(rarity);
  s.fragments[itemId] = (s.fragments[itemId] ?? 0) + gained;
  void threshold;
  return { itemId, itemName, rarity, fragsGained: gained, crafted: false, isFlow };
}

export function fragInfo(s: SaveState, id: string): { have: number; need: number; owned: boolean } {
  const flow = getFlowState(id);
  const eq = getEquipment(id);
  const need = flow ? FRAGS_TO_CRAFT[flow.rarity] : eq ? eq.fragsToCraft : 20;
  const owned = flow ? s.ownedFlow.includes(id) : s.ownedEquipment.includes(id);
  return { have: s.fragments[id] ?? 0, need, owned };
}

// can an item be crafted now (enough fragments, not yet owned)?
function isFlowId(id: string) { return !!getFlowState(id); }
export function canCraft(s: SaveState, id: string): boolean {
  const fi = fragInfo(s, id);
  return fi.have >= fi.need; // can craft duplicates too (extra copies go to the album)
}
export function anyCraftable(s: SaveState): boolean {
  return [...EQUIPMENT, ...FLOW_STATES].some((it) => canCraft(s, it.id));
}
export function craftItem(s: SaveState, id: string): boolean {
  if (!canCraft(s, id)) return false;
  const fi = fragInfo(s, id);
  s.fragments[id] = (s.fragments[id] ?? 0) - fi.need;
  if (fi.owned) s.craftCopies[id] = (s.craftCopies[id] ?? 0) + 1; // duplicate -> album copy
  else if (isFlowId(id)) s.ownedFlow.push(id); else s.ownedEquipment.push(id);
  return true;
}
