// All non-combat screens. Pure render-to-HTML + wire buttons via the App facade.
import { CAPS } from "../data/balance";
import { EPISODES, ENEMIES } from "../data/enemies";
import { EQUIPMENT, getEquipment } from "../data/equipment";
import { FLOW_STATES, getFlowState } from "../data/flowStates";
import {
  canTrain, effectiveStats, spendVoucher, train, trainCost, xpToNext,
} from "../systems/progression";
import { PULL_COST, canPull, fragInfo, pull } from "../systems/gacha";
import { ACHIEVEMENTS, claimChallenge, defFor } from "../systems/challenges";
import { leaderboard, myRank } from "../systems/ranking";

export interface App {
  root: HTMLElement;
  save: any;
  persist(): void;
  go(screen: string): void;
  startFight(enemyId: string, episodeId?: number): void;
  toast(msg: string): void;
}

const rarityClass = (r: string) => `r-${r}`;

function topBar(app: App, title: string): string {
  const s = app.save;
  return `
    <div class="topbar">
      <button class="back" data-nav="home">‹</button>
      <h2>${title}</h2>
      <div class="currency">
        <span class="coin">🪙 ${s.coins}</span>
        <span class="prem">💎 ${s.premium}</span>
      </div>
    </div>`;
}

export function renderHome(app: App) {
  const s = app.save;
  const eff = effectiveStats(s);
  const need = xpToNext(s.level);
  app.root.innerHTML = `
    <div class="scene menu home">
      <div class="hero-head">
        <div class="logo">MONSTERS<span>BOXING HERO</span></div>
        <div class="lvl">Nivel ${s.level}${s.level >= CAPS.PLAYER_LEVEL ? " (MAX)" : ""}</div>
        <div class="bar xp"><div class="fill" style="width:${s.level >= CAPS.PLAYER_LEVEL ? 100 : (s.xp / need) * 100}%"></div></div>
        <div class="statline">
          <span class="vt">VT ${eff.vt}</span>
          <span>ATK ${eff.atk}</span>
          <span>DEF ${eff.def}</span>
          <span>⚡ ${getFlowState(s.equippedFlow)?.name ?? "—"}</span>
        </div>
      </div>
      <div class="menu-grid">
        <button data-nav="campaign" class="big">🥊 Campaña</button>
        <button data-nav="training">💪 Entrenar</button>
        <button data-nav="equip">🧤 Equipo & Flow</button>
        <button data-nav="gacha">🎰 Gacha</button>
        <button data-nav="challenges">📅 Desafíos</button>
        <button data-nav="ranking">🏆 Ranking</button>
      </div>
      <div class="foot">Sin micropagos · monedas se ganan jugando</div>
    </div>`;
  wireNav(app);
}

export function renderCampaign(app: App) {
  const s = app.save;
  let cleared = 0;
  const cards = EPISODES.map((ep) => {
    const enemies = ep.enemies
      .map((id) => {
        const e = ENEMIES[id];
        const unlocked = cleared <= s.episodeProgress;
        const beaten = cleared < s.episodeProgress;
        const idx = cleared;
        cleared++;
        return `<button class="enemy-card ${unlocked ? "" : "locked"} ${beaten ? "beaten" : ""}"
          data-fight="${id}" data-ep="${ep.id}" ${unlocked ? "" : "disabled"}
          style="--c:${e.color}">
          <div class="ec-name">${e.name}</div>
          <div class="ec-title">${e.title}</div>
          <div class="ec-stats">HP ${e.hp} · ATK ${e.atk} · ${e.bpm}BPM</div>
          ${beaten ? '<div class="ec-badge">✔ KO</div>' : unlocked ? '<div class="ec-badge go">PELEAR</div>' : '<div class="ec-badge">🔒</div>'}
        </button>`;
      })
      .join("");
    return `<div class="episode"><div class="ep-name">${ep.name}</div><div class="ep-enemies">${enemies}</div></div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Campaña")}<div class="scroll">${cards}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-fight]").forEach((b) => {
    b.onclick = () => app.startFight(b.dataset.fight!, Number(b.dataset.ep));
  });
}

export function renderTraining(app: App) {
  const s = app.save;
  const row = (stat: "atk" | "def" | "vt", label: string, color: string) => {
    const cur = s.stats[stat];
    const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
    const cost = trainCost(stat, cur);
    const atMax = cur >= max;
    return `<div class="train-row">
      <div class="tr-label" style="color:${color}">${label}</div>
      <div class="tr-val">${cur}<span>/${max}</span></div>
      <button class="tr-btn" data-train="${stat}" ${atMax || !canTrain(s, stat) ? "disabled" : ""}>
        ${atMax ? "MAX" : `+${stat === "vt" ? 10 : 1} · 🪙${cost}`}
      </button>
      ${s.statVouchers > 0 && !atMax ? `<button class="tr-vch" data-vch="${stat}">Vale</button>` : ""}
    </div>`;
  };
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Entrenar")}
    <div class="scroll">
      <p class="hint">Sube stats con monedas. Vales (+1) se ganan con logros: <b>${s.statVouchers}</b> disponibles.</p>
      ${row("vt", "VT (Vida)", "#3bd28a")}
      ${row("atk", "ATK (Ataque)", "#ff9f6b")}
      ${row("def", "DEF (Defensa)", "#7fd8ff")}
      <p class="hint">Más ATK = más daño hecho. Más DEF = menos daño recibido. VT = aguante.</p>
    </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((b) => {
    b.onclick = () => { if (train(s, b.dataset.train as any)) { app.persist(); renderTraining(app); } else app.toast("Sin monedas"); };
  });
  app.root.querySelectorAll<HTMLButtonElement>("[data-vch]").forEach((b) => {
    b.onclick = () => { if (spendVoucher(s, b.dataset.vch as any)) { app.persist(); renderTraining(app); } };
  });
}

export function renderEquip(app: App) {
  const s = app.save;
  const flows = FLOW_STATES.map((f) => {
    const owned = s.ownedFlow.includes(f.id);
    const eq = s.equippedFlow === f.id;
    return `<button class="item-card ${rarityClass(f.rarity)} ${owned ? "" : "locked"} ${eq ? "equipped" : ""}"
      data-flow="${owned ? f.id : ""}" ${owned ? "" : "disabled"}>
      <div class="ic-top"><span class="ic-name">⚡ ${f.name}</span><span class="ic-rar">${f.rarity}</span></div>
      <div class="ic-desc">${f.desc}</div>
      ${eq ? '<div class="ic-badge">EQUIPADO</div>' : owned ? '<div class="ic-badge go">Equipar</div>' : '<div class="ic-badge">🔒 gacha</div>'}
    </button>`;
  }).join("");
  const gear = EQUIPMENT.map((e) => {
    const owned = s.ownedEquipment.includes(e.id);
    const eq = s.equippedGear[e.slot] === e.id;
    const b = e.bonus;
    const bonusStr = [b.atk && `ATK+${b.atk}`, b.def && `DEF+${b.def}`, b.vt && `VT+${b.vt}`, b.flowGainMult && `Flow×${b.flowGainMult}`].filter(Boolean).join(" ");
    return `<button class="item-card ${rarityClass(e.rarity)} ${owned ? "" : "locked"} ${eq ? "equipped" : ""}"
      data-gear="${owned ? e.id : ""}" data-slot="${e.slot}" ${owned ? "" : "disabled"}>
      <div class="ic-top"><span class="ic-name">${e.name}</span><span class="ic-rar">${e.rarity}</span></div>
      <div class="ic-desc">${e.slot} · ${bonusStr}</div>
      ${eq ? '<div class="ic-badge">EQUIPADO</div>' : owned ? '<div class="ic-badge go">Equipar</div>' : '<div class="ic-badge">🔒 gacha</div>'}
    </button>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Equipo & Flow")}
    <div class="scroll">
      <h3>Estados de Flujo</h3>${flows}
      <h3>Accesorios</h3>${gear}
    </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-flow]").forEach((b) => {
    if (!b.dataset.flow) return;
    b.onclick = () => { s.equippedFlow = b.dataset.flow!; app.persist(); renderEquip(app); };
  });
  app.root.querySelectorAll<HTMLButtonElement>("[data-gear]").forEach((b) => {
    if (!b.dataset.gear) return;
    b.onclick = () => {
      const slot = b.dataset.slot!;
      s.equippedGear[slot] = s.equippedGear[slot] === b.dataset.gear ? undefined : b.dataset.gear;
      app.persist(); renderEquip(app);
    };
  });
}

export function renderGacha(app: App) {
  const s = app.save;
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Gacha")}
    <div class="scroll">
      <p class="hint">Tira para ganar <b>fragmentos</b>. Junta los suficientes y el objeto se crea. Común = 20 frags (~4-5 por tirada). Sin pagos reales.</p>
      <div class="banner normal">
        <div class="banner-title">Banner Normal</div>
        <div class="banner-sub">Solo accesorios · 🪙 ${PULL_COST.normal}</div>
        <button class="pull-btn" data-pull="normal" ${canPull(s, "normal") ? "" : "disabled"}>Tirar</button>
      </div>
      <div class="banner premium">
        <div class="banner-title">Banner Premium 💎</div>
        <div class="banner-sub">Mejores odds + Estados de Flujo · 💎 ${PULL_COST.premium}</div>
        <button class="pull-btn" data-pull="premium" ${canPull(s, "premium") ? "" : "disabled"}>Tirar</button>
      </div>
      <div id="pull-result"></div>
      <h3>Colección (fragmentos)</h3>
      <div class="frag-grid">
        ${[...EQUIPMENT, ...FLOW_STATES].map((it) => {
          const fi = fragInfo(s, it.id);
          const nm = (it as any).name;
          return `<div class="frag ${fi.owned ? "owned" : ""}"><span>${nm}</span><b>${fi.have}/${fi.need}</b></div>`;
        }).join("")}
      </div>
    </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-pull]").forEach((b) => {
    b.onclick = () => {
      const res = pull(s, b.dataset.pull as any);
      if (!res) { app.toast("Sin monedas suficientes"); return; }
      app.persist();
      const box = app.root.querySelector<HTMLDivElement>("#pull-result")!;
      box.innerHTML = `<div class="pull-pop ${rarityClass(res.rarity)}">
        <div>${res.isFlow ? "⚡" : "🧤"} <b>${res.itemName}</b> <i>${res.rarity}</i></div>
        <div>+${res.fragsGained} fragmentos ${res.crafted ? "· <b class='crafted'>¡DESBLOQUEADO!</b>" : ""}</div>
      </div>`;
      // refresh currency + frag counts without losing the popup
      const sb = app.root.querySelector(".currency")!;
      sb.innerHTML = `<span class="coin">🪙 ${s.coins}</span><span class="prem">💎 ${s.premium}</span>`;
      b.disabled = !canPull(s, b.dataset.pull as any);
    };
  });
}

export function renderChallenges(app: App) {
  const s = app.save;
  const block = (title: string, list: any[], scope: "daily" | "weekly") =>
    `<h3>${title}</h3>` + list.map((ch) => {
      const def = defFor(ch.id)!;
      const pct = Math.min(100, (ch.progress / def.goal) * 100);
      const done = ch.progress >= def.goal;
      return `<div class="chal ${ch.claimed ? "claimed" : done ? "ready" : ""}">
        <div class="chal-text">${def.text}</div>
        <div class="bar small"><div class="fill" style="width:${pct}%"></div></div>
        <div class="chal-foot">
          <span>${Math.min(ch.progress, def.goal)}/${def.goal}</span>
          <span class="reward">🪙${def.rewardCoins}${def.rewardPremium ? ` 💎${def.rewardPremium}` : ""}</span>
          ${ch.claimed ? '<span class="ok">✔</span>' : done ? `<button data-claim="${ch.id}" data-scope="${scope}">Cobrar</button>` : ""}
        </div>
      </div>`;
    }).join("");
  const achv = ACHIEVEMENTS.map((a) => {
    const ap = s.achievements.find((x: any) => x.id === a.id) ?? { tier: 0, progress: 0 };
    const next = (ap.tier + 1) * a.step;
    const pct = Math.min(100, ((ap.progress % a.step) / a.step) * 100);
    return `<div class="chal achv">
      <div class="chal-text">${a.text} <i>Nv.${ap.tier}</i></div>
      <div class="bar small"><div class="fill gold" style="width:${pct}%"></div></div>
      <div class="chal-foot"><span>${ap.progress}/${next}</span><span class="reward">→ +1 Vale stat</span></div>
    </div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Desafíos")}
    <div class="scroll">
      ${block("Diarios", s.daily.challenges, "daily")}
      ${block("Semanales", s.weekly.challenges, "weekly")}
      <h3>Logros (vales de stat)</h3>${achv}
    </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => {
    b.onclick = () => { if (claimChallenge(s, b.dataset.claim!, b.dataset.scope as any)) { app.persist(); renderChallenges(app); } };
  });
}

export function renderRanking(app: App) {
  const s = app.save;
  const board = leaderboard(s);
  const rows = board.map((e, i) => `
    <div class="rank-row ${e.you ? "you" : ""}">
      <span class="pos">${i + 1}</span>
      <span class="nm">${e.name}</span>
      <span class="sc">${e.score.toLocaleString()}</span>
    </div>`).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Ranking")}
    <div class="scroll">
      <p class="hint">Tu mejor puntuación: <b>${s.bestScore.toLocaleString()}</b> · Puesto #${myRank(s)}. Sin PvP — escala el marcador.</p>
      <div class="rank-list">${rows}</div>
    </div></div>`;
  wireNav(app);
}

function wireNav(app: App) {
  app.root.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => {
    b.onclick = () => app.go(b.dataset.nav!);
  });
  const back = app.root.querySelector<HTMLButtonElement>(".back");
  if (back) back.onclick = () => app.go("home");
}
