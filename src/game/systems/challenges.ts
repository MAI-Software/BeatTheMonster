// Daily / weekly challenges + general achievements. Achievements have repeating
// tiers: each cleared tier beyond the first grants a stat-up VOUCHER (+1 point).
import type { AchievementProgress, SaveState } from "../core/storage";

export interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  rewardCoins: number;
  rewardPremium?: number;
  metric: Metric;
}

export type Metric = "perfects" | "wins" | "combo" | "supercombos" | "pulls" | "fightsPlayed";

const DAILY_POOL: ChallengeDef[] = [
  { id: "d_perfect", text: "Consigue 30 Perfects", goal: 30, rewardCoins: 80, metric: "perfects" },
  { id: "d_win", text: "Gana 2 combates", goal: 2, rewardCoins: 100, metric: "wins" },
  { id: "d_combo", text: "Alcanza combo x15", goal: 15, rewardCoins: 90, metric: "combo" },
  { id: "d_super", text: "Activa 3 Super Combos", goal: 3, rewardCoins: 120, metric: "supercombos" },
];

const WEEKLY_POOL: ChallengeDef[] = [
  { id: "w_perfect", text: "Consigue 400 Perfects", goal: 400, rewardCoins: 400, rewardPremium: 20, metric: "perfects" },
  { id: "w_win", text: "Gana 15 combates", goal: 15, rewardCoins: 500, rewardPremium: 25, metric: "wins" },
  { id: "w_super", text: "Activa 20 Super Combos", goal: 20, rewardCoins: 450, rewardPremium: 20, metric: "supercombos" },
];

// Repeating-tier achievements: every `step` more of the metric = +1 voucher.
export interface AchievementDef {
  id: string;
  text: string;
  metric: "totalPerfects" | "totalWins";
  step: number; //每 step = one tier = one voucher
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "a_perfect", text: "Maestro del Perfect", metric: "totalPerfects", step: 200 },
  { id: "a_win", text: "Campeón", metric: "totalWins", step: 5 },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function weekStr(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function rotate<T>(pool: T[], seedStr: string, n: number): T[] {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n && used.size < pool.length; i++) {
    let idx = (h + i * 7) % pool.length;
    while (used.has(idx)) idx = (idx + 1) % pool.length;
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

export function refreshChallenges(s: SaveState): void {
  const today = todayStr();
  if (s.daily.date !== today) {
    s.daily = { date: today, challenges: rotate(DAILY_POOL, today, 3).map((c) => ({ id: c.id, progress: 0, claimed: false })) };
  }
  const wk = weekStr();
  if (s.weekly.week !== wk) {
    s.weekly = { week: wk, challenges: rotate(WEEKLY_POOL, wk, 2).map((c) => ({ id: c.id, progress: 0, claimed: false })) };
  }
}

export function defFor(id: string): ChallengeDef | undefined {
  return [...DAILY_POOL, ...WEEKLY_POOL].find((c) => c.id === id);
}

// Push fight results into challenge/achievement progress.
export interface FightResult {
  perfects: number;
  maxCombo: number;
  superCombos: number;
  won: boolean;
}

export function applyFightResult(s: SaveState, r: FightResult): void {
  const bump = (list: { id: string; progress: number; claimed: boolean }[]) => {
    for (const ch of list) {
      const def = defFor(ch.id);
      if (!def || ch.claimed) continue;
      if (def.metric === "perfects") ch.progress += r.perfects;
      else if (def.metric === "wins") ch.progress += r.won ? 1 : 0;
      else if (def.metric === "combo") ch.progress = Math.max(ch.progress, r.maxCombo);
      else if (def.metric === "supercombos") ch.progress += r.superCombos;
      else if (def.metric === "fightsPlayed") ch.progress += 1;
    }
  };
  bump(s.daily.challenges);
  bump(s.weekly.challenges);

  s.totalPerfects += r.perfects;
  if (r.won) s.totalWins += 1;
  evalAchievements(s);
}

export function claimChallenge(s: SaveState, id: string, scope: "daily" | "weekly"): boolean {
  const list = scope === "daily" ? s.daily.challenges : s.weekly.challenges;
  const ch = list.find((c) => c.id === id);
  const def = defFor(id);
  if (!ch || !def || ch.claimed || ch.progress < def.goal) return false;
  ch.claimed = true;
  s.coins += def.rewardCoins;
  s.premium += def.rewardPremium ?? 0;
  return true;
}

// Grant a voucher for each new tier crossed.
export function evalAchievements(s: SaveState): void {
  for (const def of ACHIEVEMENTS) {
    let ap: AchievementProgress | undefined = s.achievements.find((a) => a.id === def.id);
    if (!ap) {
      ap = { id: def.id, tier: 0, progress: 0 };
      s.achievements.push(ap);
    }
    const total = def.metric === "totalPerfects" ? s.totalPerfects : s.totalWins;
    ap.progress = total;
    const earnedTiers = Math.floor(total / def.step);
    if (earnedTiers > ap.tier) {
      s.statVouchers += earnedTiers - ap.tier;
      ap.tier = earnedTiers;
    }
  }
}

export { todayStr };
