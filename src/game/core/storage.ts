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
  statUpgrades: { atk: number; def: number; vt: number }; // manual upgrades done (cap 100 for now)
  coins: number; // normal banner currency
  premium: number; // premium banner currency
  fragments: Record<string, number>; // itemId/flowId -> frag count
  ownedEquipment: string[];
  ownedFlow: string[];
  equippedFlow: string | null;
  equippedGear: Partial<Record<string, string>>; // slot -> equipId
  episodeProgress: number; // index of furthest cleared enemy across episodes
  tutorialDone: boolean;
  nick: string; // player nickname (local only)
  gender: "male" | "female" | null; // chosen player skin id
  coachSkin: string; // chosen coach skin id
  ownedSkins: Record<string, boolean>; // skin id -> owned (album / wardrobe)
  skinCopies: Record<string, number>; // skin id -> dup count (album points)
  seals: Record<string, number>; // boss id -> collected seals (collection ranks)
  defeated: Record<string, boolean>; // boss id -> ever defeated (album reveal)
  cassettes: Record<string, number>; // cassette id -> copies owned (>=1 = unlocked)
  collectRanks: Record<string, number>; // "kind:id" -> ascended rank index (0=F)
  craftCopies: Record<string, number>; // equipment/flow id -> extra crafted copies (album dups)
  redeemed: string[]; // promo codes already redeemed
  chapterDone: Record<string, boolean>; // difficulty id -> chapter cleared (unlocks next)
  materials: Record<string, number>; // material id -> count (enemy drops)
  guiding: boolean; // new-player guided tour active (spotlight through menus)
  energy: number; // stamina for the adventure
  energyTs: number; // last regen timestamp
  ads: number; // watch-ad free pulls available
  adsTs: number; // last ad recharge timestamp
  settings: { musicVol: number; sfxVol: number; menuMusic?: boolean };
  favSong: string; // chosen menu background song (cassette id or global id)
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
    version: 3,
    level: 1,
    xp: 0,
    stats: { atk: 10, def: 8, vt: 200 },
    statVouchers: 10,
    statUpgrades: { atk: 0, def: 0, vt: 0 },
    coins: 1000,
    premium: 50,
    fragments: {},
    ownedEquipment: [],
    ownedFlow: ["flow_oraora"], // start with Ora Ora Ora
    equippedFlow: "flow_oraora",
    equippedGear: {},
    episodeProgress: 0,
    tutorialDone: false,
    nick: "",
    gender: null,
    coachSkin: "coach_vega",
    ownedSkins: { player_male: true, player_female: true, coach_vega: true },
    skinCopies: {},
    seals: {},
    defeated: {},
    cassettes: { cs_1: 1 }, // Wasteland unlocked from the start
    collectRanks: {},
    craftCopies: {},
    redeemed: [],
    chapterDone: {},
    materials: {},
    guiding: false,
    energy: 10,
    energyTs: Date.now(),
    ads: 5,
    adsTs: Date.now(),
    settings: { musicVol: 0.85, sfxVol: 0.8, menuMusic: true },
    favSong: "cs_1", // Wasteland by default
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
    // temp testing grant: force everyone to 1000 coins / 50 gems / 10 tickets once
    if (parsed.version < 2) { parsed.coins = 1000; parsed.premium = 50; parsed.statVouchers = 10; parsed.version = 2; }
    // v3: cassettes become copy counts; Wasteland (cs_1) unlocked + default song
    if (parsed.version < 3) {
      const cc: Record<string, number> = {};
      const old = (parsed.cassettes ?? {}) as Record<string, any>;
      for (const k of Object.keys(old)) cc[k] = typeof old[k] === "number" ? old[k] : (old[k] ? 1 : 0);
      cc.cs_1 = Math.max(1, cc.cs_1 ?? 0);
      parsed.cassettes = cc;
      if (!parsed.favSong || parsed.favSong === "god_is_dead") parsed.favSong = "cs_1";
      parsed.version = 3;
    }
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
