// Roster: a portal to another dimension tore open in the gym. Monsters pour through
// and you contain them with rhythm and fists. Fantasy creatures with variations.
export interface Enemy {
  id: string;
  name: string;
  title: string;
  hp: number;
  atk: number;
  def: number;
  bpm: number;
  intensity: number; // 0..1 note density / aggression
  color: string;
}

export interface Episode {
  id: number;
  name: string;
  enemies: string[]; // enemy ids in order
  rewardCoins: number;
  rewardPremium: number;
}

// Short premise shown on the campaign screen.
export const CAMPAIGN_LORE =
  "Un portal a otra dimensión se ha abierto en el gimnasio. Contén a los monstruos a base de ritmo y puños.";

export const ENEMIES: Record<string, Enemy> = {
  goblin_scout:  { id: "goblin_scout",  name: "Goblin Explorador", title: "El primero en cruzar", hp: 220, atk: 14, def: 6,  bpm: 90,  intensity: 0.40, color: "#6abf4b" },
  orc_grunt:     { id: "orc_grunt",     name: "Orco Recluta",      title: "Puños como mazas",     hp: 320, atk: 20, def: 12, bpm: 104, intensity: 0.55, color: "#3f8f5a" },
  troll_stone:   { id: "troll_stone",   name: "Trol de Piedra",    title: "Piel de roca",         hp: 480, atk: 28, def: 18, bpm: 116, intensity: 0.65, color: "#7b8a99" },
  orc_berserker: { id: "orc_berserker", name: "Orco Berserker",    title: "Furia ciega",          hp: 600, atk: 34, def: 22, bpm: 128, intensity: 0.72, color: "#b5462f" },
  ogre_brute:    { id: "ogre_brute",    name: "Ogro Brutal",       title: "Montaña de músculo",   hp: 760, atk: 40, def: 26, bpm: 140, intensity: 0.80, color: "#9a6b3f" },
  portal_demon:  { id: "portal_demon",  name: "Demonio del Portal",title: "El Guardián del Umbral", hp: 1100, atk: 52, def: 34, bpm: 150, intensity: 0.92, color: "#b23bd0" },
};

export const EPISODES: Episode[] = [
  { id: 1, name: "Episodio 1: El Portal se Abre",   enemies: ["goblin_scout", "orc_grunt"],     rewardCoins: 300, rewardPremium: 10 },
  { id: 2, name: "Episodio 2: La Horda Cruza",      enemies: ["troll_stone", "orc_berserker"],  rewardCoins: 500, rewardPremium: 15 },
  { id: 3, name: "Episodio 3: El Guardián del Umbral", enemies: ["ogre_brute", "portal_demon"], rewardCoins: 900, rewardPremium: 30 },
];
