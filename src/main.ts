// App bootstrap + screen router + fight orchestration (control + song selection).
import "./styles.css";
import { ENEMIES, levelByEnemy, isBoss, type Enemy } from "./game/data/enemies";
import { spendEnergy } from "./game/systems/stamina";
import { getFlowState } from "./game/data/flowStates";
import { loadSave, writeSave, resetSave, type SaveState } from "./game/core/storage";
import { setVolumes } from "./game/systems/audio";
import { effectiveStats, grantXp } from "./game/systems/progression";
import { applyFightResult, refreshChallenges } from "./game/systems/challenges";
import { fightScore } from "./game/systems/ranking";
import { createInput, type InputProvider } from "./game/systems/pose";
import { DIFFICULTIES, DIFFICULTY_ORDER, isDifficultyUnlocked, unlockHint, type DifficultyId } from "./game/data/difficulty";
import { GLOBAL_SONG, listSongs, loadSongPlayer, synthSongPlayer, unlockSongAudio, type SongMeta, type SongPlayer } from "./game/systems/song";
import { runCombat } from "./game/ui/combatScene";
import { icon } from "./game/ui/icons";
import { SEAL_DROP_CHANCE, SEALS_PER_RANK } from "./game/data/collection";
import { cassetteForBoss, getCassette } from "./game/data/cassettes";
import { applySongPlay } from "./game/systems/challenges";
import {
  renderCampaign, renderCharacterSelect, renderChallenges, renderCollection, renderEquip, renderGacha, renderHome,
  renderLuchar, renderOptions, renderPractice, renderRanking, renderSongs, renderTraining, renderTutorial, renderWardrobe, type App,
} from "./game/ui/menus";

const TRAINING_ENEMY: Enemy = { id: "training", name: "Saco", title: "Práctica", hp: 999999, atk: 12, def: 0, bpm: 100, intensity: 0.7, color: "#e7202b", emoji: "🥊" };

class Game implements App {
  root = document.getElementById("app")!;
  save: SaveState = loadSave();
  input: InputProvider | null = null;
  difficulty: DifficultyId = "normal";

  constructor() {
    refreshChallenges(this.save);
    setVolumes(this.save.settings.musicVol, this.save.settings.sfxVol);
    this.persist();
    this.go(!this.save.tutorialDone ? "tutorial" : !this.save.gender ? "charselect" : "home");
  }
  persist() { writeSave(this.save); }
  resetAll() { resetSave(); location.reload(); }
  private loadingHTML(text: string) {
    return `<div class="scene loading"><img class="load-bg" src="portal.webp" alt="" onerror="this.style.display='none'"><div class="spinner"></div><p>${text}</p></div>`;
  }

  go(screen: string) {
    const map: Record<string, (a: App) => void> = {
      campaign: renderCampaign, training: renderTraining, equip: renderEquip,
      gacha: renderGacha, challenges: renderChallenges, ranking: renderRanking,
      tutorial: renderTutorial, practice: renderPractice, charselect: renderCharacterSelect,
      collection: renderCollection, songs: renderSongs, options: renderOptions,
      luchar: renderLuchar, wardrobe: renderWardrobe,
    };
    (map[screen] ?? renderHome)(this);
  }

  async startPractice(kind: "punch" | "dodge") {
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
    // global song first, then any per-enemy tracks
    const songs = [GLOBAL_SONG, ...(await listSongs(enemyId))];
    let useCamera = true;
    let chosenSong: SongMeta | null = songs[0]; // default = God Is Dead
    const unlocked = (d: DifficultyId) => isDifficultyUnlocked(d, this.save.level, this.save.difficultyWins);
    if (!unlocked(this.difficulty)) this.difficulty = "easy";

    const render = () => {
      this.root.innerHTML = `
        <div class="scene menu prefight">
          <button class="back" id="pfback">${icon("back", 24)}</button>
          <div class="pf-card">
            <div class="pf-enemy">${enemy.name}</div>
            <div class="pf-title">${enemy.title}</div>
            <p class="hint">Mantén el cuerpo erguido. Inclina la cabeza a los lados para esquivar. Cada mitad del círculo se rellena: golpea ese puño justo cuando llega al borde.</p>
            <h4>Dificultad</h4>
            <div class="diff-grid">
              ${DIFFICULTY_ORDER.map((d) => {
                const lock = !unlocked(d);
                return `<button data-diff="${d}" class="diff-card ${this.difficulty === d ? "on" : ""} ${lock ? "locked" : ""}" ${lock ? "disabled" : ""}>
                  <span class="dc-name">${DIFFICULTIES[d].name}</span>
                  ${lock ? `<span class="dc-lock">${icon("lock", 13)} ${unlockHint(d)}</span>` : `<span class="dc-ok">Recompensa ×${({ easy: "0.75", normal: "1", hard: "1.4", master: "1.9" } as any)[d]}</span>`}
                </button>`;
              }).join("")}
            </div>
            <h4>Control</h4>
            <div class="seg">
              <button data-ctl="cam" class="${useCamera ? "on" : ""}">Cámara</button>
              <button data-ctl="kb" class="${!useCamera ? "on" : ""}">Teclado / Táctil</button>
            </div>
            <h4>Canción</h4>
            <div class="songlist">
              <button data-song="" class="${!chosenSong ? "on" : ""}">${icon("note", 16)} Ritmo del juego</button>
              ${songs.map((s) => `<button data-song="${s.id}" class="${chosenSong?.id === s.id ? "on" : ""}">${icon("note", 16)} ${s.name}</button>`).join("")}
            </div>
            ${songs.length === 0 ? `<p class="hint small">Para tus canciones: pon archivos en <code>public/songs/</code> y añádelos a <code>manifest.json</code>.</p>` : ""}
            <button class="primary" id="pfstart">${icon("play", 20)} Empezar</button>
          </div>
        </div>`;
      this.root.querySelector<HTMLButtonElement>("#pfback")!.onclick = () => this.go("campaign");
      this.root.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((b) => b.onclick = () => { this.difficulty = b.dataset.diff as DifficultyId; render(); });
      this.root.querySelectorAll<HTMLButtonElement>("[data-ctl]").forEach((b) => b.onclick = () => { useCamera = b.dataset.ctl === "cam"; render(); });
      this.root.querySelectorAll<HTMLButtonElement>("[data-song]").forEach((b) => b.onclick = () => {
        chosenSong = b.dataset.song ? songs.find((s) => s.id === b.dataset.song) ?? null : null; render();
      });
      this.root.querySelector<HTMLButtonElement>("#pfstart")!.onclick = () => begin();
    };

    const begin = async () => {
      const cost = levelByEnemy(enemyId)?.cost ?? 1;
      if (!spendEnergy(this.save, cost)) { this.toast("Sin energía (batido de proteínas)"); this.go("campaign"); return; }
      this.persist();
      this.root.innerHTML = this.loadingHTML("Preparando combate…");
      if (this.input) this.input.stop();
      this.input = await createInput(useCamera);
      if (useCamera && this.input.kind !== "camera") this.toast("Cámara no disponible — uso teclado");
      let song: SongPlayer;
      try {
        song = chosenSong ? await loadSongPlayer(chosenSong) : synthSongPlayer(enemy.bpm);
      } catch {
        this.toast("No pude cargar la canción — uso ritmo del juego");
        song = synthSongPlayer(enemy.bpm);
      }
      const eff = effectiveStats(this.save);
      const flow = this.save.equippedFlow ? getFlowState(this.save.equippedFlow) : undefined;
      const result = await runCombat(this.root, enemy, eff, flow ?? null, this.input, song, DIFFICULTIES[this.difficulty]);
      this.onFightEnd(enemyId, episodeId, result);
    };

    render();
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
    if (r.won) {
      s.difficultyWins[this.difficulty] = (s.difficultyWins[this.difficulty] ?? 0) + 1;
      s.defeated[enemyId] = true;
      if (isBoss(enemyId)) {
        if (Math.random() < SEAL_DROP_CHANCE) {
          s.seals[enemyId] = (s.seals[enemyId] ?? 0) + 1;
          this.toast(`¡Sello de ${enemy.name}!`);
          if (s.seals[enemyId] % SEALS_PER_RANK === 0) { s.statVouchers += 1; this.toast("¡Rango de colección + Ticket de stat!"); }
        }
        const cas = cassetteForBoss(enemyId);
        if (cas && !s.cassettes[cas.id] && Math.random() < 0.10) { s.cassettes[cas.id] = true; this.toast(`¡Cassette: ${cas.name}! (Canciones)`); }
      }
      // advance the chapter frontier (episodeProgress = furthest level index cleared)
      const lvl = levelByEnemy(enemyId);
      if (lvl && lvl.n - 1 === s.episodeProgress) s.episodeProgress = lvl.n;
    }
    applyFightResult(s, { perfects: r.perfects, maxCombo: r.maxCombo, superCombos: r.superCombos, won: r.won });
    this.persist();

    this.root.innerHTML = `
      <div class="scene menu result ${r.won ? "win" : "lose"}">
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
          ${lv.leveled ? `<div class="lvup">SUBISTE ${lv.levels} NIVEL${lv.levels > 1 ? "ES" : ""}</div>` : ""}
        </div>
        <button class="primary" id="again">Reintentar</button>
        <button id="toCampaign">Campaña</button>
        <button class="ghost" id="toHome">Inicio</button>
      </div>`;
    this.root.querySelector<HTMLButtonElement>("#again")!.onclick = () => this.startFight(enemyId, episodeId);
    this.root.querySelector<HTMLButtonElement>("#toCampaign")!.onclick = () => this.go("campaign");
    this.root.querySelector<HTMLButtonElement>("#toHome")!.onclick = () => this.go("home");
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
