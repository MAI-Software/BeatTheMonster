// App bootstrap + screen router + fight orchestration.
import "./styles.css";
import { ENEMIES, EPISODES } from "./game/data/enemies";
import { getFlowState } from "./game/data/flowStates";
import { loadSave, writeSave } from "./game/core/storage";
import { effectiveStats, grantXp } from "./game/systems/progression";
import { applyFightResult, refreshChallenges } from "./game/systems/challenges";
import { fightScore } from "./game/systems/ranking";
import { createInput } from "./game/systems/pose";
import { runCombat } from "./game/ui/combatScene";
import { renderCampaign, renderChallenges, renderEquip, renderGacha, renderHome, renderRanking, renderTraining, } from "./game/ui/menus";
class Game {
    constructor() {
        this.root = document.getElementById("app");
        this.save = loadSave();
        this.input = null;
        this.screen = "home";
        refreshChallenges(this.save);
        this.persist();
        this.go("home");
    }
    persist() { writeSave(this.save); }
    go(screen) {
        this.screen = screen;
        switch (screen) {
            case "campaign": return renderCampaign(this);
            case "training": return renderTraining(this);
            case "equip": return renderEquip(this);
            case "gacha": return renderGacha(this);
            case "challenges": return renderChallenges(this);
            case "ranking": return renderRanking(this);
            default: return renderHome(this);
        }
    }
    toast(msg) {
        const t = document.createElement("div");
        t.className = "toast";
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
    }
    // pre-fight input picker
    startFight(enemyId, episodeId) {
        const enemy = ENEMIES[enemyId];
        this.root.innerHTML = `
      <div class="scene menu prefight">
        <h2>${enemy.name}</h2>
        <div class="prefight-title">${enemy.title}</div>
        <p class="hint">Mueve el cuerpo para que tu <b>cabeza siga la bola</b> en el círculo. Lanza puños IZQ/DER a los puntos al ritmo. Perfect → Super Combo.</p>
        <p class="hint">Elige control:</p>
        <button class="big" id="useCam">📷 Cámara (movimiento real)</button>
        <button id="useKb">⌨️ Teclado/Táctil (A=IZQ D=DER, ratón=cabeza)</button>
        <button class="ghost" id="cancelFight">Cancelar</button>
        <div id="prefStatus" class="hint"></div>
      </div>`;
        const status = this.root.querySelector("#prefStatus");
        this.root.querySelector("#cancelFight").onclick = () => this.go("campaign");
        const begin = async (useCamera) => {
            status.textContent = useCamera ? "Pidiendo cámara…" : "Cargando…";
            if (this.input)
                this.input.stop();
            this.input = await createInput(useCamera);
            if (useCamera && this.input.kind !== "camera")
                this.toast("Cámara no disponible — usando teclado");
            const eff = effectiveStats(this.save);
            const flow = this.save.equippedFlow ? getFlowState(this.save.equippedFlow) : undefined;
            const seed = (enemy.bpm + (episodeId ?? 1) * 13) | 0;
            const result = await runCombat(this.root, enemy, eff, flow ?? null, this.input, seed);
            this.onFightEnd(enemyId, episodeId, result);
        };
        this.root.querySelector("#useCam").onclick = () => begin(true);
        this.root.querySelector("#useKb").onclick = () => begin(false);
    }
    onFightEnd(enemyId, episodeId, r) {
        const enemy = ENEMIES[enemyId];
        const s = this.save;
        // rewards
        const score = fightScore({
            perfects: r.perfects, goods: r.goods, maxCombo: r.maxCombo,
            superCombos: r.superCombos, won: r.won, enemyHp: r.enemyMaxHp,
        });
        const coins = Math.round((r.perfects * 4 + r.goods * 2 + (r.won ? 80 : 20)));
        const premium = r.won ? Math.max(1, Math.round(enemy.bpm / 30)) : 0;
        const xpGain = r.perfects * 6 + r.goods * 3 + (r.won ? 120 : 30);
        s.coins += coins;
        s.premium += premium;
        const lv = grantXp(s, xpGain);
        s.bestScore = Math.max(s.bestScore, score);
        applyFightResult(s, { perfects: r.perfects, maxCombo: r.maxCombo, superCombos: r.superCombos, won: r.won });
        // campaign progression: advance frontier if this was the next enemy
        let frontierIdx = 0;
        for (const ep of EPISODES) {
            for (const id of ep.enemies) {
                if (id === enemyId && frontierIdx === s.episodeProgress && r.won)
                    s.episodeProgress++;
                frontierIdx++;
            }
        }
        this.persist();
        this.root.innerHTML = `
      <div class="scene menu result ${r.won ? "win" : "lose"}">
        <h1>${r.won ? "¡VICTORIA!" : "Derrota"}</h1>
        <div class="res-enemy">${enemy.name}</div>
        <div class="res-grid">
          <div><b>${r.perfects}</b><span>Perfects</span></div>
          <div><b>${r.goods}</b><span>Goods</span></div>
          <div><b>${r.misses}</b><span>Misses</span></div>
          <div><b>${r.maxCombo}</b><span>Combo máx</span></div>
          <div><b>${r.superCombos}</b><span>Super Combos</span></div>
          <div><b>${score.toLocaleString()}</b><span>Puntos</span></div>
        </div>
        <div class="res-rewards">
          🪙 +${coins} &nbsp; 💎 +${premium} &nbsp; XP +${xpGain}
          ${lv.leveled ? `<div class="lvup">¡SUBISTE ${lv.levels} NIVEL${lv.levels > 1 ? "ES" : ""}!</div>` : ""}
        </div>
        <button class="big" id="again">Reintentar</button>
        <button id="toCampaign">Campaña</button>
        <button class="ghost" id="toHome">Inicio</button>
      </div>`;
        this.root.querySelector("#again").onclick = () => this.startFight(enemyId, episodeId);
        this.root.querySelector("#toCampaign").onclick = () => this.go("campaign");
        this.root.querySelector("#toHome").onclick = () => this.go("home");
    }
}
new Game();
