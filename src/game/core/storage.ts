// Local persistence. No backend, no microtransactions — coins/premium earned in play.
import { CAPS } from "../data/balance";

export interface PlayerStats {
  atk: number;
  def: number;
  vt: number; // max HP
}

export interface ChallengeProgress {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface AchievementProgress {
  id: string;
  tier: number; // how many tiers cleared
  progress: number;
}

export interface SaveState {
  version: number;
  level: number;
  xp: number;
  stats: PlayerStats;
  statVouchers: number; // each = +1 to a stat of choice
  coins: number; // normal banner currency
  premium: number; // premium banner currency
  fragments: Record<string, number>; // itemId/flowId -> frag count
  ownedEquipment: string[];
  ownedFlow: string[];
  equippedFlow: string | null;
  equippedGear: Partial<Record<string, string>>; // slot -> equipId
  episodeProgress: number; // index of furthest cleared enemy across episodes
  tutorialDone: boolean;
  gender: "male" | "female" | null; // chosen player skin
  seals: Record<string, number>; // boss id -> collected seals (collection ranks)
  defeated: Record<string, boolean>; // boss id -> ever defeated (album reveal)
  difficultyWins: Record<string, number>; // wins per difficulty id (gates harder modes)
  bestScore: number;
  totalPerfects: number;
  totalWins: number;
  daily: { date: string; challenges: ChallengeProgress[] };
  weekly: { week: string; challenges: ChallengeProgress[] };
  achievements: AchievementProgress[];
  lastSeen: number;
}

const KEY = "mbh_save_v1";

export function defaultSave(): SaveState {
  return {
    version: 1,
    level: 1,
    xp: 0,
    stats: { atk: 10, def: 8, vt: 200 },
    statVouchers: 0,
    coins: 200,
    premium: 0,
    fragments: {},
    ownedEquipment: [],
    ownedFlow: ["flow_oraora"], // start with Ora Ora Ora
    equippedFlow: "flow_oraora",
    equippedGear: {},
    episodeProgress: 0,
    tutorialDone: false,
    gender: null,
    seals: {},
    defeated: {},
    difficultyWins: {},
    bestScore: 0,
    totalPerfects: 0,
    totalWins: 0,
    daily: { date: "", challenges: [] },
    weekly: { week: "", challenges: [] },
    achievements: [],
    lastSeen: Date.now(),
  };
}

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = { ...defaultSave(), ...JSON.parse(raw) } as SaveState;
    // clamp against caps in case of tampering / old data
    parsed.level = Math.min(CAPS.PLAYER_LEVEL, Math.max(1, parsed.level));
    parsed.stats.atk = Math.min(CAPS.ATK, parsed.stats.atk);
    parsed.stats.def = Math.min(CAPS.DEF, parsed.stats.def);
    parsed.stats.vt = Math.min(CAPS.VT, parsed.stats.vt);
    return parsed;
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: SaveState): void {
  s.lastSeen = Date.now();
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function resetSave(): void {
  localStorage.removeItem(KEY);
}
