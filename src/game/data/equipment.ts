// Accessories (gloves, headbands, etc.) won via gacha. Each grants flat/percent
// stat bonuses. Built from fragments: a common item needs 20 frags to craft/awaken.
import type { Rarity } from "./flowStates";

export type Slot = "gloves" | "boots" | "headband" | "charm";

export interface Equipment {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  bonus: { atk?: number; def?: number; vt?: number; flowGainMult?: number };
  fragsToCraft: number; // common=20
}

export const FRAGS_TO_CRAFT: Record<Rarity, number> = {
  common: 20,
  rare: 40,
  epic: 70,
  legendary: 120,
};

export const EQUIPMENT: Equipment[] = [
  // commons
  { id: "g_worn", name: "Guantes Gastados", slot: "gloves", rarity: "common", bonus: { atk: 3 }, fragsToCraft: 20 },
  { id: "b_street", name: "Botas Callejeras", slot: "boots", rarity: "common", bonus: { def: 3 }, fragsToCraft: 20 },
  { id: "h_cloth", name: "Cinta de Tela", slot: "headband", rarity: "common", bonus: { vt: 40 }, fragsToCraft: 20 },
  { id: "c_coin", name: "Amuleto de Cobre", slot: "charm", rarity: "common", bonus: { flowGainMult: 1.05 }, fragsToCraft: 20 },
  // rares
  { id: "g_iron", name: "Guantes de Hierro", slot: "gloves", rarity: "rare", bonus: { atk: 7, def: 2 }, fragsToCraft: 40 },
  { id: "b_spring", name: "Botas de Resorte", slot: "boots", rarity: "rare", bonus: { def: 7 }, fragsToCraft: 40 },
  { id: "h_focus", name: "Cinta de Foco", slot: "headband", rarity: "rare", bonus: { vt: 90, flowGainMult: 1.1 }, fragsToCraft: 40 },
  // epics
  { id: "g_titan", name: "Puños de Titán", slot: "gloves", rarity: "epic", bonus: { atk: 14 }, fragsToCraft: 70 },
  { id: "c_storm", name: "Amuleto Tormenta", slot: "charm", rarity: "epic", bonus: { flowGainMult: 1.25, atk: 5 }, fragsToCraft: 70 },
  // legendary
  { id: "g_dragon", name: "Garras del Dragón", slot: "gloves", rarity: "legendary", bonus: { atk: 22, def: 8, flowGainMult: 1.2 }, fragsToCraft: 120 },
];

export function getEquipment(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
