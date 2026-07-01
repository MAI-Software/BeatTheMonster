// Chapter 1: a portal opened in the gym. 30 phases, all ORCS (different names/looks
// to be drawn later — emoji placeholders for now). A boss every 5th phase (costs 2
// energy), the chapter's final boss at phase 30 (costs 3). Normal phases cost 1.
// The battle song changes every 5 phases (only "God Is Dead" exists for now).
export interface Enemy {
  id: string;
  name: string;
  title: string;
  hp: number;
  atk: number;
  def: number;
  bpm: number;
  intensity: number;
  color: string;
  emoji: string;
  img?: string; // portrait shown in prefight / level card (transparent bg)
  drop?: { id: string; name: string; chance: number }; // material drop on win
}

// Weak orc uses the same art on the early non-boss levels.
const WEAK_ORC_LEVELS = new Set([1, 2, 3, 4, 6, 7, 8, 9]);
export const MUELA_DROP = { id: "muela_orco", name: "Muela de Orco", chance: 0.05 };

export interface Level {
  n: number; // 1..30
  enemyId: string;
  cost: number; // energy cost
  boss: boolean;
  finalBoss: boolean;
  songBlock: number; // 0..5 (song changes per block)
}

export const CAMPAIGN_LORE =
  "Un portal a otra dimensión se ha abierto en el gimnasio. Una horda de orcos cruza. Contenlos a ritmo y puños, fase a fase.";

const ORC_NAMES = [
  "Grok", "Brak", "Mog", "Zugg", "Thok", "Gnar", "Urok", "Drez", "Skab", "Vrak",
  "Korg", "Hruk", "Marsh", "Nokk", "Gutt", "Rokk", "Snag", "Drok", "Bolg", "Grish",
  "Murg", "Yagol", "Kron", "Ozul", "Throg", "Garm", "Uzguk", "Lugdush", "Gothmog", "Azog",
];
const BLOCK_BPM = [92, 104, 116, 128, 140, 150];
const ORC_EMOJI = ["👺", "👹", "🧌", "👿"];
const ORC_COLORS = ["#6abf4b", "#3f8f5a", "#7b8a5a", "#5a8f3f", "#8a9a4b", "#4b8f6a"];

export const ENEMIES: Record<string, Enemy> = {};
export const LEVELS: Level[] = [];

for (let n = 1; n <= 30; n++) {
  const id = `orc_${String(n).padStart(2, "0")}`;
  const boss = n % 5 === 0;
  const finalBoss = n === 30;
  const block = Math.floor((n - 1) / 5); // 0..5
  const bossMul = finalBoss ? 2.2 : boss ? 1.6 : 1;
  ENEMIES[id] = {
    id,
    name: `Orco ${ORC_NAMES[n - 1]}`,
    title: finalBoss ? "Señor de la Horda" : boss ? "Jefe Orco" : "Guerrero Orco",
    hp: Math.round((160 + n * 48) * bossMul),
    atk: Math.round((10 + n * 1.4) * (finalBoss ? 1.6 : boss ? 1.3 : 1)),
    def: Math.round((4 + n * 1.0) * (boss ? 1.3 : 1)),
    bpm: BLOCK_BPM[block],
    intensity: Math.min(0.95, 0.34 + n * 0.02),
    color: ORC_COLORS[block],
    emoji: ORC_EMOJI[boss ? 1 : n % ORC_EMOJI.length],
    img: WEAK_ORC_LEVELS.has(n) ? "enemies/orco-debil.webp" : undefined,
    drop: WEAK_ORC_LEVELS.has(n) ? MUELA_DROP : undefined,
  };
  LEVELS.push({ n, enemyId: id, cost: finalBoss ? 3 : boss ? 2 : 1, boss, finalBoss, songBlock: block });
}

// Bosses (every 5th phase) — used for collection, seals and cassettes.
export const BOSS_IDS = LEVELS.filter((l) => l.boss).map((l) => l.enemyId);
export function isBoss(enemyId: string): boolean {
  return BOSS_IDS.includes(enemyId);
}
export function levelByEnemy(enemyId: string): Level | undefined {
  return LEVELS.find((l) => l.enemyId === enemyId);
}
