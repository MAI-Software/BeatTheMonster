// Local persistence. No backend, no microtransactions — coins/premium earned in play.
import { CAPS } from "../data/balance";
const KEY = "mbh_save_v1";
export function defaultSave() {
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
        bestScore: 0,
        totalPerfects: 0,
        totalWins: 0,
        daily: { date: "", challenges: [] },
        weekly: { week: "", challenges: [] },
        achievements: [],
        lastSeen: Date.now(),
    };
}
export function loadSave() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return defaultSave();
        const parsed = { ...defaultSave(), ...JSON.parse(raw) };
        // clamp against caps in case of tampering / old data
        parsed.level = Math.min(CAPS.PLAYER_LEVEL, Math.max(1, parsed.level));
        parsed.stats.atk = Math.min(CAPS.ATK, parsed.stats.atk);
        parsed.stats.def = Math.min(CAPS.DEF, parsed.stats.def);
        parsed.stats.vt = Math.min(CAPS.VT, parsed.stats.vt);
        return parsed;
    }
    catch {
        return defaultSave();
    }
}
export function writeSave(s) {
    s.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(s));
}
export function resetSave() {
    localStorage.removeItem(KEY);
}
