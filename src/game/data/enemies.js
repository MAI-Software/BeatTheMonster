export const ENEMIES = {
    joe_mixen: { id: "joe_mixen", name: "Joe Mixen", title: "El Somnoliento", hp: 220, atk: 14, def: 6, bpm: 90, intensity: 0.4, color: "#5b8def" },
    rciardo_noxin: { id: "rciardo_noxin", name: "Rcicardo Noxin", title: "El Tramposo", hp: 320, atk: 20, def: 12, bpm: 104, intensity: 0.55, color: "#8d5bef" },
    vladi_pootin: { id: "vladi_pootin", name: "Vladi Pootin", title: "El Oso de Hielo", hp: 480, atk: 28, def: 18, bpm: 116, intensity: 0.65, color: "#39c0c8" },
    kym_jongun: { id: "kym_jongun", name: "Kym Jong-Fun", title: "El Cohete", hp: 600, atk: 34, def: 22, bpm: 128, intensity: 0.72, color: "#d23b6f" },
    elon_tusk: { id: "elon_tusk", name: "Elon Tusk", title: "El Cohetero", hp: 760, atk: 40, def: 26, bpm: 140, intensity: 0.8, color: "#3bd28a" },
    doni_crump: { id: "doni_crump", name: "Doni Crump", title: "El Jefe Final", hp: 1100, atk: 52, def: 34, bpm: 150, intensity: 0.92, color: "#e8a13b" },
};
export const EPISODES = [
    { id: 1, name: "Episodio 1: El Gimnasio", enemies: ["joe_mixen", "rciardo_noxin"], rewardCoins: 300, rewardPremium: 10 },
    { id: 2, name: "Episodio 2: Frío del Este", enemies: ["vladi_pootin", "kym_jongun"], rewardCoins: 500, rewardPremium: 15 },
    { id: 3, name: "Episodio 3: La Cima", enemies: ["elon_tusk", "doni_crump"], rewardCoins: 900, rewardPremium: 30 },
];
