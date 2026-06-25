// App bootstrap + screen router + fight orchestration (control + song selection).
import "./styles.css";
import { ENEMIES, LEVELS, levelByEnemy, isBoss, type Enemy } from "./game/data/enemies";
import { spendEnergy } from "./game/systems/stamina";
import { getFlowState } from "./game/data/flowStates";
import { loadSave, writeSave, resetSave, type SaveState } from "./game/core/storage";
import { setVolumes } from "./game/systems/audio";
import { effectiveStats, grantXp } from "./game/systems/progression";
import { applyFightResult, refreshChallenges } from "./game/systems/challenges";
import { fightScore } from "./game/systems/ranking";
import { createInput, type InputProvider } from "./game/systems/pose";
import { DIFFICULTIES, DIFFICULTY_ORDER, diffUnlocked, type DifficultyId } from "./game/data/difficulty";
import { GLOBAL_SONG, listSongs, loadSongPlayer, synthSongPlayer, unlockSongAudio, type SongMeta, type SongPlayer } from "./game/systems/song";
import { runCombat } from "./game/ui/combatScene";
import { icon, gicon } from "./game/ui/icons";
import { SEAL_DROP_CHANCE, collectTicketGain } from "./game/data/collection";
import { cassetteForBoss, getCassette, songForBlock } from "./game/data/cassettes";
import { applySongPlay } from "./game/systems/challenges";
import {
  renderCampaign, renderCharacterSelect, renderChallenges, renderCollection, renderEquip, renderGacha, renderHome,
  renderFragments, renderLuchar, renderNickname, renderOptions, renderPractice, renderProfile, renderRanking, renderRadio, renderSongs, renderTraining, renderTutorial, renderWardrobe, revealOverlay, type App,
} from "./game/ui/menus";
import { ensureMenuMusic, stopMenuMusic } from "./game/systems/menuMusic";

const TRAINING_ENEMY: Enemy = { id: "training", name: "Saco", title: "Práctica", hp: 999999, atk: 12, def: 0, bpm: 100, intensity: 0.7, color: "#e7202b", emoji: "🥊" };

// Screens reached from the BOTTOM nav of home keep their top bar at the bottom
// (one-handed reach). Top-of-home screens (radio, profile, options, wardrobe…) stay up.
const BOTTOM_BAR_SCREENS = new Set(["luchar", "training", "equip", "gacha", "challenges", "collection", "campaign", "practice", "songs"]);

class Game implements App {
  root = document.getElementById("app")!;
  save: SaveState = loadSave();
  input: InputProvider | null = null;
  difficulty: DifficultyId = "easy";
  diffOptions() { return DIFFICULTY_ORDER.map((d) => ({ id: d as string, name: DIFFICULTIES[d].name, unlocked: diffUnlocked(d, this.save.chapterDone) })); }
  setDifficulty(id: string) { const d = id as DifficultyId; if (diffUnlocked(d, this.save.chapterDone)) this.difficulty = d; }
  private current = "home";
  private hist: string[] = [];

  constructor() {
    refreshChallenges(this.save);
    setVolumes(this.save.settings.musicVol, this.save.settings.sfxVol);
    this.persist();
    this.go(!this.save.tutorialDone ? "tutorial" : !this.save.gender ? "charselect" : !this.save.nick ? "nickname" : "home");
  }
  persist() { writeSave(this.save); }
  resetAll() { resetSave(); location.reload(); }
  private loadingHTML(text: string) {
    return `<div class="scene loading"><img class="load-bg" src="portal.webp" alt="" onerror="this.style.display='none'"><div class="spinner"></div><p>${text}</p></div>`;
  }

  back() {
    const prev = this.hist.pop();
    this.go(prev ?? "home", false);
  }
  go(screen: string, push = true) {
    if (push && screen !== this.current) {
      // home is the root; don't stack duplicates
      if (this.current !== "home" || screen !== "home") this.hist.push(this.current);
      if (this.hist.length > 20) this.hist.shift();
    }
    this.current = screen;
    if (screen === "home") this.hist = [];
    const map: Record<string, (a: App) => void> = {
      campaign: renderCampaign, training: renderTraining, equip: renderEquip,
      gacha: renderGacha, challenges: renderChallenges, ranking: renderRanking,
      tutorial: renderTutorial, practice: renderPractice, charselect: renderCharacterSelect,
      collection: renderCollection, songs: renderSongs, options: renderOptions,
      luchar: renderLuchar, wardrobe: renderWardrobe, fragments: renderFragments, nickname: renderNickname,
      radio: renderRadio, profile: renderProfile,
    };
    (map[screen] ?? renderHome)(this);
    // one-handed UX: screens reached from the bottom nav keep their bar at the
    // bottom; screens reached from the top of home keep it at the top.
    this.root.classList.toggle("bar-bottom", BOTTOM_BAR_SCREENS.has(screen));
    // menu music plays across menu screens when enabled in settings (off during combat)
    if (this.save.tutorialDone && this.save.settings.menuMusic !== false) ensureMenuMusic(this.save.favSong);
    else stopMenuMusic();
  }

  async startPractice(kind: "punch" | "dodge") {
    stopMenuMusic();
    this.root.innerHTML = this.loadingHTML("Preparando práctica…");
    if (this.input) this.input.stop();
    this.input = await createInput(true);
    if (this.input.kind !== "camera") this.toast("Sin cámara — practica con teclado (A/D, ratón)");
    const song = synthSongPlayer(TRAINING_ENEMY.bpm);
    const eff = effectiveStats(this.save);
    await runCombat(this.root, TRAINING_ENEMY, eff, null, this.input, song, DIFFICULTIES.easy, { practiceKind: kind });
    this.go("practice");
  }

  async startSong(cassetteId: string) {
    const cas = getCassette(cassetteId); if (!cas) return;
    stopMenuMusic();
    const enemy = ENEMIES[cas.enemyId] ?? TRAINING_ENEMY;
    this.root.innerHTML = this.loadingHTML(`Cargando ${cas.name}…`);
    if (this.input) this.input.stop();
    this.input = await createInput(true);
    if (this.input.kind !== "camera") this.toast("Sin cámara — teclado (A/D, ratón)");
    let song: SongPlayer;
    try { song = cas.file ? await loadSongPlayer({ id: cas.id, name: cas.name, file: cas.file }) : synthSongPlayer(cas.bpm); }
    catch { song = synthSongPlayer(cas.bpm); }
    const eff = effectiveStats(this.save);
    const flow = this.save.equippedFlow ? getFlowState(this.save.equippedFlow) : undefined;
    await runCombat(this.root, enemy, eff, flow ?? null, this.input, song, DIFFICULTIES[this.difficulty], { freeplay: true });
    applySongPlay(this.save); this.persist();
    this.go("songs");
  }

  toast(msg: string) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }

  async startFight(enemyId: string, episodeId?: number) {
    unlockSongAudio();
    const enemy = ENEMIES[enemyId];
    // block theme song first (the level's default), then per-enemy tracks
    const block = levelByEnemy(enemyId)?.songBlock ?? 0;
    const blockSong = songForBlock(block);
    if (!diffUnlocked(this.difficulty, this.save.chapterDone)) this.difficulty = "easy";

    const render = () => {
      this.root.innerHTML = `
        <div class="scene menu prefight">
          <div class="section-bg"><img src="portal.webp" alt="" onerror="this.style.display='none'"></div>
          <button class="back" id="pfback">${icon("back", 24)}</button>
          <div class="pf-card">
            <div class="pf-enemy">${enemy.name}</div>
            <div class="pf-title">${enemy.title}</div>
            <div class="pf-meta"><span>Dificultad: <b>${DIFFICULTIES[this.difficulty].name}</b></span><span>${gicon("cassette", 15)} ${blockSong.name}</span></div>
            <button class="primary" id="pfstart">${icon("play", 20)} Empezar</button>
            <button class="opt-btn ghostbtn pf-auto" id="pfauto">AUTO (provisional)</button>
          </div>
        </div>`;
      this.root.querySelector<HTMLButtonElement>("#pfback")!.onclick = () => this.go("campaign");
      this.root.querySelector<HTMLButtonElement>("#pfstart")!.onclick = () => begin();
      this.root.querySelector<HTMLButtonElement>("#pfauto")!.onclick = () =>
        this.onFightEnd(enemyId, episodeId, { perfects: 60, goods: 12, dodges: 6, maxCombo: 35, superCombos: 3, won: true, enemyMaxHp: enemy.hp });
    };

    const begin = async () => {
      const cost = levelByEnemy(enemyId)?.cost ?? 1;
      if (!spendEnergy(this.save, cost)) { this.toast("Sin energía (batido de proteínas)"); this.go("campaign"); return; }
      stopMenuMusic();
      this.persist();
      this.root.innerHTML = this.loadingHTML("Preparando combate…");
      if (this.input) this.input.stop();
      this.input = await createInput(true);
      if (this.input.kind !== "camera") this.toast("Cámara no disponible — uso teclado");
      let song: SongPlayer;
      try { song = await loadSongPlayer(blockSong); }
      catch { this.toast("No pude cargar la canción — uso ritmo del juego"); song = synthSongPlayer(enemy.bpm); }
      const eff = effectiveStats(this.save);
      const flow = this.save.equippedFlow ? getFlowState(this.save.equippedFlow) : undefined;
      const result = await runCombat(this.root, enemy, eff, flow ?? null, this.input, song, DIFFICULTIES[this.difficulty]);
      this.onFightEnd(enemyId, episodeId, result);
    };

    render();
  }

  // Provisional testing helper: instantly win the next campaign level.
  autoWin() {
    const next = LEVELS.find((l) => l.n - 1 === this.save.episodeProgress);
    if (!next) { this.toast("Capítulo completado"); return; }
    this.onFightEnd(next.enemyId, undefined, { perfects: 60, goods: 12, dodges: 6, maxCombo: 35, superCombos: 3, won: true, enemyMaxHp: 1200 });
  }

  private onFightEnd(enemyId: string, episodeId: number | undefined, r: any) {
    const enemy = ENEMIES[enemyId]; const s = this.save;
    const diffMult: Record<DifficultyId, number> = { easy: 0.75, normal: 1, hard: 1.4, master: 1.9 };
    const dm = diffMult[this.difficulty];
    const score = Math.round(fightScore({ perfects: r.perfects, goods: r.goods, maxCombo: r.maxCombo, superCombos: r.superCombos, won: r.won, enemyHp: r.enemyMaxHp }) * dm);
    const coins = Math.round((r.perfects * 4 + r.goods * 2 + (r.dodges ?? 0) * 3 + (r.won ? 80 : 20)) * dm);
    const premium = r.won ? Math.max(1, Math.round((enemy.bpm / 30) * dm)) : 0;
    const xpGain = Math.round((r.perfects * 6 + r.goods * 3 + (r.won ? 120 : 30)) * dm);
    s.coins += coins; s.premium += premium;
    const lv = grantXp(s, xpGain);
    s.bestScore = Math.max(s.bestScore, score);
    let ticketsGained = 0;
    let droppedCas: { id: string; name: string } | null = null;
    if (r.won) {
      const firstClear = !s.defeated[enemyId];
      s.difficultyWins[this.difficulty] = (s.difficultyWins[this.difficulty] ?? 0) + 1;
      s.defeated[enemyId] = true;
      if (firstClear) ticketsGained += 1; // first-time scenario clear = 1 ticket
      if (isBoss(enemyId)) {
        if (Math.random() < SEAL_DROP_CHANCE) {
          const before = s.seals[enemyId] ?? 0;
          s.seals[enemyId] = before + 1;
          ticketsGained += collectTicketGain(before, before + 1);
          this.toast(`¡Sello de ${enemy.name}!`);
        }
        if (Math.random() < 0.01) ticketsGained += 1; // rare 1% boss ticket drop
        const cas = cassetteForBoss(enemyId);
        if (cas && Math.random() < 0.10) { // can drop again -> duplicates stack
          const before = s.cassettes[cas.id] ?? 0;
          s.cassettes[cas.id] = before + 1;
          ticketsGained += collectTicketGain(before, before + 1);
          droppedCas = { id: cas.id, name: cas.name };
          this.toast(before === 0 ? `¡Cassette: ${cas.name}! (Canciones)` : `¡${cas.name} duplicada!`);
        }
      }
      // advance the chapter frontier (episodeProgress = furthest level index cleared)
      const lvl = levelByEnemy(enemyId);
      if (lvl && lvl.n - 1 === s.episodeProgress) s.episodeProgress = lvl.n;
      if (lvl?.finalBoss) { s.chapterDone[this.difficulty] = true; this.toast("¡Capítulo completado! Dificultad superior desbloqueada"); }
    }
    if (ticketsGained > 0) { s.statVouchers += ticketsGained; this.toast(`¡+${ticketsGained} Ticket de refuerzo!`); }
    applyFightResult(s, { perfects: r.perfects, maxCombo: r.maxCombo, superCombos: r.superCombos, won: r.won });
    this.persist();

    this.root.innerHTML = `
      <div class="scene menu result ${r.won ? "win" : "lose"}">
        <div class="section-bg"><img src="portal.webp" alt="" onerror="this.style.display='none'"></div>
        <h1>${r.won ? "VICTORIA" : "DERROTA"}</h1>
        <div class="res-enemy">${enemy.name}</div>
        <div class="res-grid">
          <div><b>${r.perfects}</b><span>Perfects</span></div>
          <div><b>${r.goods}</b><span>Goods</span></div>
          <div><b>${r.dodges ?? 0}</b><span>Esquivas</span></div>
          <div><b>${r.maxCombo}</b><span>Combo máx</span></div>
          <div><b>${r.superCombos}</b><span>Supers</span></div>
          <div><b>${score.toLocaleString()}</b><span>Puntos</span></div>
        </div>
        <div class="res-rewards">
          <span>${icon("coin", 16)} +${coins}</span><span>${icon("gem", 16)} +${premium}</span><span>XP +${xpGain}</span>
          ${ticketsGained > 0 ? `<span>${gicon("ticket", 16)} +${ticketsGained}</span>` : ""}
          ${lv.leveled ? `<div class="lvup">SUBISTE ${lv.levels} NIVEL${lv.levels > 1 ? "ES" : ""}</div>` : ""}
        </div>
        <button class="primary" id="again">Reintentar</button>
        <button id="toCampaign">Campaña</button>
        <button class="ghost" id="toHome">Inicio</button>
      </div>`;
    this.root.querySelector<HTMLButtonElement>("#again")!.onclick = () => this.startFight(enemyId, episodeId);
    this.root.querySelector<HTMLButtonElement>("#toCampaign")!.onclick = () => this.go("campaign");
    this.root.querySelector<HTMLButtonElement>("#toHome")!.onclick = () => this.go("home");
    // big reveal for a rare combat drop (cassette > ticket)
    if (droppedCas) revealOverlay(gicon("cassette", 130), droppedCas.name, "¡Cassette!", "rare");
    else if (ticketsGained > 0) revealOverlay(gicon("ticket", 130), "Ticket de refuerzo", `+${ticketsGained}`, "legendary");
  }
}

const TIPS = [
  "Empuja el puño hacia la cámara para golpear.",
  "Inclina la cabeza para esquivar los ataques.",
  "Encadena PERFECTs para activar tu Estado de Flujo.",
  "Sube la guardia antes de cada asalto.",
  "El portal no se cierra solo: contén la horda.",
  "Practica puños y esquivas por separado en el menú Práctica.",
  "Los Super Combos multiplican tu daño ×2.5.",
];

function showBoot(): Promise<void> {
  return new Promise((resolve) => {
    const root = document.getElementById("app")!;
    let tip = Math.floor(Math.random() * TIPS.length);
    root.innerHTML = `
      <div class="boot">
        <img class="boot-portal" src="portal.webp" alt="" onerror="this.style.display='none'">
        <img class="boot-title" src="title.webp" alt="Beat the Monster" onerror="this.style.display='none'">
        <div class="boot-bar"><i id="bootfill"></i></div>
        <div class="boot-tip" id="boottip">${TIPS[tip]}</div>
        <div class="boot-hint">Consejo</div>
      </div>`;
    const fill = root.querySelector<HTMLElement>("#bootfill")!;
    const tipEl = root.querySelector<HTMLElement>("#boottip")!;
    requestAnimationFrame(() => { fill.style.width = "100%"; });
    const rot = setInterval(() => { tip = (tip + 1) % TIPS.length; tipEl.textContent = TIPS[tip]; }, 1500);
    setTimeout(() => { clearInterval(rot); resolve(); }, 3200);
  });
}

(async () => { await showBoot(); new Game(); })();
