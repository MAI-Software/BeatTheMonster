// Gacha: spend currency on a banner, receive FRAGMENTS. Collect enough frags to
// craft/own the item. Common item = 20 frags; a normal-banner pull of a common
// yields ~4-5 frags, so ~4-5 pulls per common. Premium banner = better odds + flow states.
import { EQUIPMENT, FRAGS_TO_CRAFT, getEquipment } from "../data/equipment";
import { FLOW_STATES, getFlowState } from "../data/flowStates";
import type { Rarity } from "../data/flowStates";
import type { SaveState } from "../core/storage";

export const PULL_COST = { normal: 50, premium: 25 } as const; // premium uses premium currency

export interface PullResult {
  itemId: string;
  itemName: string;
  rarity: Rarity;
  fragsGained: number;
  crafted: boolean; // crossed the craft threshold this pull
  isFlow: boolean;
}

const NORMAL_ODDS: Record<Rarity, number> = { common: 0.78, rare: 0.18, epic: 0.035, legendary: 0.005 };
const PREMIUM_ODDS: Record<Rarity, number> = { common: 0.45, rare: 0.35, epic: 0.16, legendary: 0.04 };

function pickRarity(odds: Record<Rarity, number>): Rarity {
  const r = Math.random();
  let acc = 0;
  for (const k of ["legendary", "epic", "rare", "common"] as Rarity[]) {
    acc += odds[k];
    if (r < acc) return k;
  }
  return "common";
}

function fragsForRarity(rarity: Rarity): number {
  // common 4-5, scaling down for higher (rarer = fewer per pull).
  switch (rarity) {
    case "common": return 4 + Math.floor(Math.random() * 2); // 4-5
    case "rare": return 3 + Math.floor(Math.random() * 2); // 3-4
    case "epic": return 2 + Math.floor(Math.random() * 2); // 2-3
    case "legendary": return 1 + Math.floor(Math.random() * 2); // 1-2
  }
}

export function canPull(s: SaveState, banner: "normal" | "premium"): boolean {
  return banner === "normal" ? s.coins >= PULL_COST.normal : s.premium >= PULL_COST.premium;
}

export function pull(s: SaveState, banner: "normal" | "premium"): PullResult | null {
  if (!canPull(s, banner)) return null;
  if (banner === "normal") s.coins -= PULL_COST.normal;
  else s.premium -= PULL_COST.premium;

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

  const before = s.fragments[itemId] ?? 0;
  const gained = fragsForRarity(rarity);
  const after = before + gained;
  s.fragments[itemId] = after;

  const alreadyOwned = isFlow ? s.ownedFlow.includes(itemId) : s.ownedEquipment.includes(itemId);
  let crafted = false;
  if (!alreadyOwned && after >= threshold) {
    crafted = true;
    if (isFlow) s.ownedFlow.push(itemId);
    else s.ownedEquipment.push(itemId);
  }

  return { itemId, itemName, rarity, fragsGained: gained, crafted, isFlow };
}

export function fragInfo(s: SaveState, id: string): { have: number; need: number; owned: boolean } {
  const flow = getFlowState(id);
  const eq = getEquipment(id);
  const need = flow ? FRAGS_TO_CRAFT[flow.rarity] : eq ? eq.fragsToCraft : 20;
  const owned = flow ? s.ownedFlow.includes(id) : s.ownedEquipment.includes(id);
  return { have: s.fragments[id] ?? 0, need, owned };
}
