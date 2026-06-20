// Accessories won via gacha. Five equip categories in the menu: head, gloves (fists),
// body (clothing), shins, and the Flow State (handled by flowStates.ts). Each gear
// piece grants stat bonuses and is built from fragments (common = 20).
import type { Rarity } from "./flowStates";

export type Slot = "head" | "gloves" | "body" | "shins";

export interface Equipment {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  bonus: { atk?: number; def?: number; vt?: number; flowGainMult?: number };
  fragsToCraft: number;
}

export const FRAGS_TO_CRAFT: Record<Rarity, number> = { common: 20, rare: 40, epic: 70, legendary: 120 };

export const SLOT_LABEL: Record<Slot, string> = { head: "Cabeza", gloves: "Puños", body: "Ropa", shins: "Espinilleras" };

export const EQUIPMENT: Equipment[] = [
  // HEAD
  { id: "h_band",  name: "Cinta de Tela",     slot: "head",   rarity: "common",    bonus: { vt: 40 },                 fragsToCraft: 20 },
  { id: "h_focus", name: "Cinta de Foco",     slot: "head",   rarity: "rare",      bonus: { vt: 90, flowGainMult: 1.1 }, fragsToCraft: 40 },
  { id: "h_helm",  name: "Casco de Hierro",   slot: "head",   rarity: "epic",      bonus: { vt: 120, def: 8 },        fragsToCraft: 70 },
  { id: "h_halo",  name: "Halo del Portal",   slot: "head",   rarity: "legendary", bonus: { vt: 180, def: 10, flowGainMult: 1.15 }, fragsToCraft: 120 },
  // GLOVES (fists)
  { id: "g_worn",  name: "Guantes Gastados",  slot: "gloves", rarity: "common",    bonus: { atk: 3 },                 fragsToCraft: 20 },
  { id: "g_iron",  name: "Guantes de Hierro", slot: "gloves", rarity: "rare",      bonus: { atk: 7, def: 2 },         fragsToCraft: 40 },
  { id: "g_titan", name: "Puños de Titán",    slot: "gloves", rarity: "epic",      bonus: { atk: 14 },                fragsToCraft: 70 },
  { id: "g_dragon",name: "Garras del Dragón", slot: "gloves", rarity: "legendary", bonus: { atk: 22, def: 8, flowGainMult: 1.2 }, fragsToCraft: 120 },
  // BODY (clothing)
  { id: "b_shirt", name: "Camiseta Vieja",    slot: "body",   rarity: "common",    bonus: { def: 3 },                 fragsToCraft: 20 },
  { id: "b_vest",  name: "Chaleco Acolchado", slot: "body",   rarity: "rare",      bonus: { def: 8, vt: 30 },         fragsToCraft: 40 },
  { id: "b_armor", name: "Coraza de Placas",  slot: "body",   rarity: "epic",      bonus: { def: 14, vt: 60 },        fragsToCraft: 70 },
  { id: "b_aegis", name: "Égida del Umbral",  slot: "body",   rarity: "legendary", bonus: { def: 20, vt: 120, flowGainMult: 1.1 }, fragsToCraft: 120 },
  // SHINS
  { id: "s_pads",  name: "Espinilleras Básicas", slot: "shins", rarity: "common",   bonus: { def: 2, vt: 20 },        fragsToCraft: 20 },
  { id: "s_guard", name: "Grebas de Cuero",      slot: "shins", rarity: "rare",     bonus: { def: 6, atk: 2 },        fragsToCraft: 40 },
  { id: "s_steel", name: "Grebas de Acero",      slot: "shins", rarity: "epic",     bonus: { def: 11, atk: 4 },       fragsToCraft: 70 },
  { id: "s_titan", name: "Grebas de Titán",      slot: "shins", rarity: "legendary",bonus: { def: 16, atk: 8, vt: 40 }, fragsToCraft: 120 },
];

export function getEquipment(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

export function equipmentForSlot(slot: Slot): Equipment[] {
  return EQUIPMENT.filter((e) => e.slot === slot);
}
