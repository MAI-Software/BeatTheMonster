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

export const FRAGS_TO_CRAFT: Record<Rarity, number> = { common: 20, uncommon: 30, rare: 40, epic: 70, legendary: 120, unique: 200 };

export const SLOT_LABEL: Record<Slot, string> = { head: "Cabeza", gloves: "Puños", body: "Ropa", shins: "Espinilleras" };

const F = FRAGS_TO_CRAFT;
export const EQUIPMENT: Equipment[] = [
  // HEAD
  { id: "h_band",  name: "Cinta de Tela",     slot: "head", rarity: "common",    bonus: { vt: 40 },                            fragsToCraft: F.common },
  { id: "h_pad",   name: "Cinta Reforzada",   slot: "head", rarity: "uncommon",  bonus: { vt: 65 },                            fragsToCraft: F.uncommon },
  { id: "h_focus", name: "Cinta de Foco",     slot: "head", rarity: "rare",      bonus: { vt: 90, flowGainMult: 1.1 },         fragsToCraft: F.rare },
  { id: "h_helm",  name: "Casco de Hierro",   slot: "head", rarity: "epic",      bonus: { vt: 120, def: 8 },                   fragsToCraft: F.epic },
  { id: "h_crown", name: "Yelmo del Coliseo", slot: "head", rarity: "epic",      bonus: { vt: 130, flowGainMult: 1.12 },       fragsToCraft: F.epic },
  { id: "h_halo",  name: "Halo del Portal",   slot: "head", rarity: "legendary", bonus: { vt: 180, def: 10, flowGainMult: 1.15 }, fragsToCraft: F.legendary },
  { id: "h_star",  name: "Diadema Estelar",   slot: "head", rarity: "legendary", bonus: { vt: 170, def: 14, flowGainMult: 1.18 }, fragsToCraft: F.legendary },
  { id: "h_void",  name: "Corona del Vacío",  slot: "head", rarity: "unique",    bonus: { vt: 230, def: 14, flowGainMult: 1.25 }, fragsToCraft: F.unique },
  // GLOVES (fists)
  { id: "g_worn",  name: "Guantes Gastados",  slot: "gloves", rarity: "common",    bonus: { atk: 3 },                          fragsToCraft: F.common },
  { id: "g_taped", name: "Guantes Vendados",  slot: "gloves", rarity: "uncommon",  bonus: { atk: 5 },                          fragsToCraft: F.uncommon },
  { id: "g_iron",  name: "Guantes de Hierro", slot: "gloves", rarity: "rare",      bonus: { atk: 7, def: 2 },                  fragsToCraft: F.rare },
  { id: "g_titan", name: "Puños de Titán",    slot: "gloves", rarity: "epic",      bonus: { atk: 14 },                         fragsToCraft: F.epic },
  { id: "g_spike", name: "Guanteletes con Púas", slot: "gloves", rarity: "epic",   bonus: { atk: 16, def: 3 },                 fragsToCraft: F.epic },
  { id: "g_dragon",name: "Garras del Dragón", slot: "gloves", rarity: "legendary", bonus: { atk: 22, def: 8, flowGainMult: 1.2 }, fragsToCraft: F.legendary },
  { id: "g_storm", name: "Puños de la Tormenta", slot: "gloves", rarity: "legendary", bonus: { atk: 24, vt: 30, flowGainMult: 1.15 }, fragsToCraft: F.legendary },
  { id: "g_apoc",  name: "Puños del Apocalipsis", slot: "gloves", rarity: "unique", bonus: { atk: 32, def: 10, flowGainMult: 1.3 }, fragsToCraft: F.unique },
  // BODY (armor)
  { id: "b_shirt", name: "Camiseta Vieja",    slot: "body", rarity: "common",    bonus: { def: 3 },                            fragsToCraft: F.common },
  { id: "b_padded",name: "Jubón Acolchado",   slot: "body", rarity: "uncommon",  bonus: { def: 5, vt: 15 },                    fragsToCraft: F.uncommon },
  { id: "b_vest",  name: "Chaleco Acolchado", slot: "body", rarity: "rare",      bonus: { def: 8, vt: 30 },                    fragsToCraft: F.rare },
  { id: "b_armor", name: "Coraza de Placas",  slot: "body", rarity: "epic",      bonus: { def: 14, vt: 60 },                   fragsToCraft: F.epic },
  { id: "b_scale", name: "Armadura de Escamas", slot: "body", rarity: "epic",    bonus: { def: 15, vt: 50, atk: 2 },           fragsToCraft: F.epic },
  { id: "b_aegis", name: "Égida del Umbral",  slot: "body", rarity: "legendary", bonus: { def: 20, vt: 120, flowGainMult: 1.1 }, fragsToCraft: F.legendary },
  { id: "b_bulw",  name: "Baluarte de Guerra", slot: "body", rarity: "legendary", bonus: { def: 22, vt: 100, atk: 4 },          fragsToCraft: F.legendary },
  { id: "b_titan", name: "Coraza del Titán Eterno", slot: "body", rarity: "unique", bonus: { def: 30, vt: 160, flowGainMult: 1.2 }, fragsToCraft: F.unique },
  // SHINS
  { id: "s_pads",  name: "Espinilleras Básicas", slot: "shins", rarity: "common",   bonus: { def: 2, vt: 20 },                fragsToCraft: F.common },
  { id: "s_wrap",  name: "Vendas de Combate",    slot: "shins", rarity: "uncommon", bonus: { def: 4, vt: 25 },                fragsToCraft: F.uncommon },
  { id: "s_guard", name: "Grebas de Cuero",      slot: "shins", rarity: "rare",     bonus: { def: 6, atk: 2 },                fragsToCraft: F.rare },
  { id: "s_steel", name: "Grebas de Acero",      slot: "shins", rarity: "epic",     bonus: { def: 11, atk: 4 },               fragsToCraft: F.epic },
  { id: "s_plate", name: "Grebas Reforzadas",    slot: "shins", rarity: "epic",     bonus: { def: 12, atk: 5 },               fragsToCraft: F.epic },
  { id: "s_titan", name: "Grebas de Titán",      slot: "shins", rarity: "legendary",bonus: { def: 16, atk: 8, vt: 40 },       fragsToCraft: F.legendary },
  { id: "s_ward",  name: "Grebas del Guardián",  slot: "shins", rarity: "legendary",bonus: { def: 18, atk: 7, vt: 50 },       fragsToCraft: F.legendary },
  { id: "s_colos", name: "Grebas del Coloso",    slot: "shins", rarity: "unique",   bonus: { def: 24, atk: 12, vt: 60 },      fragsToCraft: F.unique },
];

// Rarity sort order (low -> high).
export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, unique: 5 };

export function getEquipment(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

export function equipmentForSlot(slot: Slot): Equipment[] {
  return EQUIPMENT.filter((e) => e.slot === slot).sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
}
