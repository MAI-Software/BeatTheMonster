// Flow States ("Estados de Flujo") = rage modes. Each has a fixed amount (no max
// gauge cap on the stat itself) and an activation CONDITION, plus the buff it grants.
// Equipping one flow state changes how flow activates and what it does.

export type FlowConditionKind =
  | { kind: "comboNoMiss"; value: number } // X combo sin fallar
  | { kind: "perfectStreak"; value: number } // X perfects seguidos
  | { kind: "meter"; value: number }; // fill a flow meter to value

export interface FlowBuff {
  durationMs: number;
  invulnerable?: boolean; // takes zero damage
  damageTakenMult?: number; // <1 = recibe menos daño
  damageDealtMult?: number; // >1 = pega más
  attackSpeedMult?: number; // faster beat tolerance / extra hits
  autoCounter?: boolean; // "ora ora" flurry: every input deals extra
}

export interface FlowState {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  condition: FlowConditionKind;
  buff: FlowBuff;
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "unique";

export const FLOW_STATES: FlowState[] = [
  {
    id: "flow_invuln",
    name: "Estado Cero",
    desc: "Invulnerable 10s. Activa con 12 de combo sin fallar.",
    rarity: "epic",
    condition: { kind: "comboNoMiss", value: 12 },
    buff: { durationMs: 10000, invulnerable: true },
  },
  {
    id: "flow_oraora",
    name: "Ora Ora Ora",
    desc: "5s: golpeas en ráfaga y recibes la mitad de daño.",
    rarity: "epic",
    condition: { kind: "perfectStreak", value: 6 },
    buff: {
      durationMs: 5000,
      damageTakenMult: 0.5,
      damageDealtMult: 1.4,
      autoCounter: true,
      attackSpeedMult: 1.5,
    },
  },
  {
    id: "flow_berserk",
    name: "Furia Roja",
    desc: "8s: +80% daño hecho pero +20% daño recibido.",
    rarity: "rare",
    condition: { kind: "comboNoMiss", value: 10 },
    buff: { durationMs: 8000, damageDealtMult: 1.8, damageTakenMult: 1.2 },
  },
  {
    id: "flow_guard",
    name: "Muro de Calma",
    desc: "12s: recibes 70% menos daño. Para aguantar jefes.",
    rarity: "rare",
    condition: { kind: "meter", value: 100 },
    buff: { durationMs: 12000, damageTakenMult: 0.3 },
  },
  {
    id: "flow_zen",
    name: "Flujo Zen",
    desc: "6s: ventana de timing más amplia, todo cuenta como Perfect.",
    rarity: "legendary",
    condition: { kind: "perfectStreak", value: 8 },
    buff: { durationMs: 6000, attackSpeedMult: 2, damageDealtMult: 1.3 },
  },
];

export function getFlowState(id: string): FlowState | undefined {
  return FLOW_STATES.find((f) => f.id === id);
}
