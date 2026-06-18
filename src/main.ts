// App bootstrap + screen router + fight orchestration (control + song selection).
import "./styles.css";
import { ENEMIES, EPISODES } from "./game/data/enemies";
import { getFlowState } from "./game/data/flowStates";
import { loadSave, writeSave, type SaveState } from "./game/core/storage";
import { effectiveStats, grantXp } from "./game/systems/progression";
import { applyFightResult, refreshChallenges } from "./game/systems/challenges";
import { fightScore } from "./game/systems/ranking";
import { createInput, type InputProvider } from "./game/systems/pose";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "./game/data/difficulty";
import { listSongs, loadSongPlayer, synthSongPlayer, unlockSongAudio, type SongMeta, type SongPlayer } from "./game/systems/song";
import { runCombat } from "./game/ui/combatScene";
import { icon } from "./game/ui/icons";
import {
  renderCampaign, renderChallenges, renderEquip, renderGacha, renderHome,
  renderRanking, renderTraining, type App,
} from "./game/ui/menus";

class Game implements App {
  root = document.getElementById("app")!;
  save: SaveState = loadSave();
  input: InputProvider | null = null;
  difficulty: DifficultyId = "normal";

  constructor() {
    refreshChallenges(this.save); this.persist(); this.go("home");
  }
  persist() { writeSave(this.save); }

  go(screen: string) {
    const map: Record<string, (a: App) => void> = {
      campaign: renderCampaign, training: renderTraining, equip: renderEquip,
      gacha: renderGacha, challenges: renderChallenges, ranking: renderRanking,
    };
    (map[screen] ?? renderHome)(this);
  }

  toast(msg: string) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }

  async startFight(enemyId: string, episodeId?: number) {
    unlockSongAudio();
    const enemy = ENEMIES[enemyId];
    const songs = await listSongs();
    let useCamera = true;
    let chosenSong: SongMeta | null = null; // null = synth (game rhythm)

    const render = () => {
      this.root.innerHTML = `
        <div class="scene menu prefight">
          <button class="back" id="pfback">${icon("back", 24)}</button>
          <div class="pf-card">
            <div class="pf-enemy">${enemy.name}</div>
            <div class="pf-title">${enemy.title}</div>
            <p class="hint">Mantén el cuerpo erguido. Inclina la cabeza a los lados para esquivar. Cada mitad del círculo se rellena: golpea ese puño justo cuando llega al borde.</p>
            <h4>Dificultad</h4>
            <div class="seg seg-diff">
              ${DIFFICULTY_ORDER.map((d) => `<button data-diff="${d}" class="${this.difficulty === d ? "on" : ""}">${DIFFICULTIES[d].name}</button>`).join("")}
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
      this.root.innerHTML = `<div class="scene menu loading"><div class="spinner"></div><p>Preparando combate…</p></div>`;
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
    applyFightResult(s, { perfects: r.perfects, maxCombo: r.maxCombo, superCombos: r.superCombos, won: r.won });
    let frontier = 0;
    for (const ep of EPISODES) for (const id of ep.enemies) { if (id === enemyId && frontier === s.episodeProgress && r.won) s.episodeProgress++; frontier++; }
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

new Game();
