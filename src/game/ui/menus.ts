// All non-combat screens. SVG icons only (no emoji). Render-to-HTML + wire buttons.
import { CAPS } from "../data/balance";
import { EPISODES, ENEMIES } from "../data/enemies";
import { EQUIPMENT } from "../data/equipment";
import { FLOW_STATES, getFlowState } from "../data/flowStates";
import { canTrain, effectiveStats, spendVoucher, train, trainCost, xpToNext } from "../systems/progression";
import { PULL_COST, canPull, fragInfo, pull } from "../systems/gacha";
import { ACHIEVEMENTS, claimChallenge, defFor } from "../systems/challenges";
import { leaderboard, myRank } from "../systems/ranking";
import { COACH_NAME, TUTORIAL_STEPS } from "../data/coach";
import { icon, type IconName } from "./icons";

export interface App {
  root: HTMLElement; save: any;
  persist(): void; go(screen: string): void;
  startFight(enemyId: string, episodeId?: number): void;
  startPractice(kind: "punch" | "dodge"): void;
  toast(msg: string): void;
}

function speak(text: string) {
  try { const s = window.speechSynthesis; if (!s) return; const u = new SpeechSynthesisUtterance(text); u.lang = "es-ES"; u.rate = 1.04; s.cancel(); s.speak(u); } catch {}
}

const slotIcon: Record<string, IconName> = { gloves: "glove", boots: "boot", headband: "headband", charm: "charm" };

function topBar(app: App, title: string): string {
  const s = app.save;
  return `<div class="topbar">
    <button class="back" data-nav="home">${icon("back", 22)}</button>
    <h2>${title}</h2>
    <div class="currency">
      <span>${icon("coin", 16)} ${s.coins}</span>
      <span>${icon("gem", 16)} ${s.premium}</span>
    </div>
  </div>`;
}

export function renderHome(app: App) {
  const s = app.save; const eff = effectiveStats(s);
  const need = xpToNext(s.level); const maxed = s.level >= CAPS.PLAYER_LEVEL;
  app.root.innerHTML = `
    <div class="scene menu home">
      <div class="hero-head">
        <div class="logo">BEAT THE<span>MONSTER</span></div>
        <div class="lvl">Nivel ${s.level}${maxed ? " · MAX" : ""}</div>
        <div class="bar xp"><i class="fill" style="width:${maxed ? 100 : (s.xp / need) * 100}%"></i></div>
        <div class="statline">
          <span class="vt">VT ${eff.vt}</span><span>ATK ${eff.atk}</span><span>DEF ${eff.def}</span>
          <span class="flow">${getFlowState(s.equippedFlow)?.name ?? "—"}</span>
        </div>
      </div>
      <div class="menu-grid">
        ${tile("campaign", "swords", "Campaña", true)}
        ${tile("practice", "target", "Práctica")}
        ${tile("tutorial", "fist", "Tutorial")}
        ${tile("training", "dumbbell", "Entrenar")}
        ${tile("equip", "glove", "Equipo & Flow")}
        ${tile("gacha", "star", "Gacha")}
        ${tile("challenges", "calendar", "Desafíos")}
        ${tile("ranking", "trophy", "Ranking")}
      </div>
      <div class="foot">Sin micropagos · monedas se ganan jugando</div>
    </div>`;
  wireNav(app);
}
const tile = (nav: string, ic: IconName, label: string, big = false) =>
  `<button data-nav="${nav}" class="${big ? "big" : ""}">${icon(ic, big ? 30 : 24)}<span>${label}</span></button>`;

export function renderCampaign(app: App) {
  const s = app.save; let idx = 0;
  const cards = EPISODES.map((ep) => {
    const enemies = ep.enemies.map((id) => {
      const e = ENEMIES[id]; const unlocked = idx <= s.episodeProgress; const beaten = idx < s.episodeProgress; idx++;
      return `<button class="enemy-card ${unlocked ? "" : "locked"} ${beaten ? "beaten" : ""}" data-fight="${id}" data-ep="${ep.id}" ${unlocked ? "" : "disabled"} style="--c:${e.color}">
        <div class="ec-name">${e.name}</div><div class="ec-title">${e.title}</div>
        <div class="ec-stats">VT ${e.hp} · ATK ${e.atk} · ${e.bpm} BPM</div>
        <div class="ec-badge">${beaten ? icon("check", 18) : unlocked ? icon("play", 16) : icon("lock", 16)}</div>
      </button>`;
    }).join("");
    return `<div class="episode"><div class="ep-name">${ep.name}</div><div class="ep-enemies">${enemies}</div></div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Campaña")}<div class="scroll">${cards}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-fight]").forEach((b) => b.onclick = () => app.startFight(b.dataset.fight!, Number(b.dataset.ep)));
}

export function renderTraining(app: App) {
  const s = app.save;
  const row = (stat: "atk" | "def" | "vt", label: string, cls: string) => {
    const cur = s.stats[stat]; const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
    const cost = trainCost(stat, cur); const atMax = cur >= max;
    return `<div class="train-row">
      <div class="tr-label ${cls}">${label}<small>${cur} / ${max}</small></div>
      <div class="bar tiny"><i class="fill ${cls}" style="width:${(cur / max) * 100}%"></i></div>
      <button class="tr-btn" data-train="${stat}" ${atMax || !canTrain(s, stat) ? "disabled" : ""}>${atMax ? "MAX" : `+${stat === "vt" ? 10 : 1} · ${cost}`}</button>
      ${s.statVouchers > 0 && !atMax ? `<button class="tr-vch" data-vch="${stat}">Vale</button>` : ""}
    </div>`;
  };
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Entrenar")}<div class="scroll">
    <p class="hint">Sube stats con monedas. Vales de logro: <b>${s.statVouchers}</b>.</p>
    ${row("vt", "VT · Vida", "c-green")}${row("atk", "ATK · Ataque", "c-orange")}${row("def", "DEF · Defensa", "c-blue")}
    <p class="hint small">Más ATK = más daño. Más DEF = menos daño recibido. VT = aguante.</p>
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((b) => b.onclick = () => { train(s, b.dataset.train as any) ? (app.persist(), renderTraining(app)) : app.toast("Sin monedas"); });
  app.root.querySelectorAll<HTMLButtonElement>("[data-vch]").forEach((b) => b.onclick = () => { if (spendVoucher(s, b.dataset.vch as any)) { app.persist(); renderTraining(app); } });
}

export function renderEquip(app: App) {
  const s = app.save;
  const flows = FLOW_STATES.map((f) => {
    const owned = s.ownedFlow.includes(f.id); const eq = s.equippedFlow === f.id;
    return `<button class="item-card r-${f.rarity} ${owned ? "" : "locked"} ${eq ? "equipped" : ""}" data-flow="${owned ? f.id : ""}" ${owned ? "" : "disabled"}>
      <span class="ic-lead">${icon("bolt", 22)}</span>
      <div class="ic-body"><div class="ic-top"><span class="ic-name">${f.name}</span><span class="ic-rar">${f.rarity}</span></div><div class="ic-desc">${f.desc}</div></div>
      <span class="ic-state">${eq ? "EQUIPADO" : owned ? "Equipar" : icon("lock", 16)}</span>
    </button>`;
  }).join("");
  const gear = EQUIPMENT.map((e) => {
    const owned = s.ownedEquipment.includes(e.id); const eq = s.equippedGear[e.slot] === e.id; const b = e.bonus;
    const bonus = [b.atk && `ATK+${b.atk}`, b.def && `DEF+${b.def}`, b.vt && `VT+${b.vt}`, b.flowGainMult && `Flow×${b.flowGainMult}`].filter(Boolean).join("  ");
    return `<button class="item-card r-${e.rarity} ${owned ? "" : "locked"} ${eq ? "equipped" : ""}" data-gear="${owned ? e.id : ""}" data-slot="${e.slot}" ${owned ? "" : "disabled"}>
      <span class="ic-lead">${icon(slotIcon[e.slot], 22)}</span>
      <div class="ic-body"><div class="ic-top"><span class="ic-name">${e.name}</span><span class="ic-rar">${e.rarity}</span></div><div class="ic-desc">${e.slot} · ${bonus}</div></div>
      <span class="ic-state">${eq ? "EQUIPADO" : owned ? "Equipar" : icon("lock", 16)}</span>
    </button>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Equipo & Flow")}<div class="scroll"><h3>Estados de Flujo</h3>${flows}<h3>Accesorios</h3>${gear}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-flow]").forEach((b) => { if (b.dataset.flow) b.onclick = () => { s.equippedFlow = b.dataset.flow!; app.persist(); renderEquip(app); }; });
  app.root.querySelectorAll<HTMLButtonElement>("[data-gear]").forEach((b) => { if (b.dataset.gear) b.onclick = () => { const sl = b.dataset.slot!; s.equippedGear[sl] = s.equippedGear[sl] === b.dataset.gear ? undefined : b.dataset.gear; app.persist(); renderEquip(app); }; });
}

export function renderGacha(app: App) {
  const s = app.save;
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Gacha")}<div class="scroll">
    <p class="hint">Tira para ganar <b>fragmentos</b>. Junta los suficientes y el objeto se crea. Común = 20 frags (~4-5 por tirada). Sin pagos reales.</p>
    <div class="banner normal"><div class="banner-title">Banner Normal</div><div class="banner-sub">Accesorios · ${icon("coin", 14)} ${PULL_COST.normal}</div>
      <button class="pull-btn" data-pull="normal" ${canPull(s, "normal") ? "" : "disabled"}>Tirar</button></div>
    <div class="banner premium"><div class="banner-title">Banner Premium</div><div class="banner-sub">Mejores odds + Flow · ${icon("gem", 14)} ${PULL_COST.premium}</div>
      <button class="pull-btn" data-pull="premium" ${canPull(s, "premium") ? "" : "disabled"}>Tirar</button></div>
    <div id="pull-result"></div>
    <h3>Colección</h3>
    <div class="frag-grid">${[...EQUIPMENT, ...FLOW_STATES].map((it) => { const fi = fragInfo(s, it.id); return `<div class="frag ${fi.owned ? "owned" : ""}"><span>${(it as any).name}</span><b>${fi.have}/${fi.need}</b></div>`; }).join("")}</div>
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-pull]").forEach((b) => b.onclick = () => {
    const res = pull(s, b.dataset.pull as any);
    if (!res) { app.toast("Sin monedas"); return; }
    app.persist();
    app.root.querySelector<HTMLDivElement>("#pull-result")!.innerHTML =
      `<div class="pull-pop r-${res.rarity}"><div class="pp-name">${icon(res.isFlow ? "bolt" : "glove", 18)} <b>${res.itemName}</b> <i>${res.rarity}</i></div><div class="pp-sub">+${res.fragsGained} frags ${res.crafted ? "· <b class='crafted'>DESBLOQUEADO</b>" : ""}</div></div>`;
    app.root.querySelector(".currency")!.innerHTML = `<span>${icon("coin", 16)} ${s.coins}</span><span>${icon("gem", 16)} ${s.premium}</span>`;
    b.disabled = !canPull(s, b.dataset.pull as any);
  });
}

export function renderChallenges(app: App) {
  const s = app.save;
  const block = (title: string, list: any[], scope: "daily" | "weekly") =>
    `<h3>${title}</h3>` + list.map((ch) => {
      const def = defFor(ch.id)!; const pct = Math.min(100, (ch.progress / def.goal) * 100); const done = ch.progress >= def.goal;
      return `<div class="chal ${ch.claimed ? "claimed" : done ? "ready" : ""}">
        <div class="chal-text">${def.text}</div><div class="bar tiny"><i class="fill" style="width:${pct}%"></i></div>
        <div class="chal-foot"><span>${Math.min(ch.progress, def.goal)}/${def.goal}</span>
          <span class="reward">${icon("coin", 13)}${def.rewardCoins}${def.rewardPremium ? ` ${icon("gem", 13)}${def.rewardPremium}` : ""}</span>
          ${ch.claimed ? icon("check", 18) : done ? `<button data-claim="${ch.id}" data-scope="${scope}">Cobrar</button>` : ""}
        </div></div>`;
    }).join("");
  const achv = ACHIEVEMENTS.map((a) => {
    const ap = s.achievements.find((x: any) => x.id === a.id) ?? { tier: 0, progress: 0 };
    const next = (ap.tier + 1) * a.step; const pct = Math.min(100, ((ap.progress % a.step) / a.step) * 100);
    return `<div class="chal achv"><div class="chal-text">${a.text} <i>Nv.${ap.tier}</i></div><div class="bar tiny"><i class="fill gold" style="width:${pct}%"></i></div>
      <div class="chal-foot"><span>${ap.progress}/${next}</span><span class="reward">+1 Vale stat</span></div></div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Desafíos")}<div class="scroll">${block("Diarios", s.daily.challenges, "daily")}${block("Semanales", s.weekly.challenges, "weekly")}<h3>Logros</h3>${achv}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => b.onclick = () => { if (claimChallenge(s, b.dataset.claim!, b.dataset.scope as any)) { app.persist(); renderChallenges(app); } });
}

export function renderRanking(app: App) {
  const s = app.save; const board = leaderboard(s);
  const rows = board.map((e, i) => `<div class="rank-row ${e.you ? "you" : ""}"><span class="pos">${i + 1}</span><span class="nm">${e.name}</span><span class="sc">${e.score.toLocaleString()}</span></div>`).join("");
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Ranking")}<div class="scroll"><p class="hint">Tu mejor: <b>${s.bestScore.toLocaleString()}</b> · Puesto #${myRank(s)}. Sin PvP.</p><div class="rank-list">${rows}</div></div></div>`;
  wireNav(app);
}

export function renderPractice(app: App) {
  app.root.innerHTML = `<div class="scene menu">${topBar(app, "Práctica")}<div class="scroll">
    <p class="hint">Entrena una mecánica a la vez. Sin daño ni derrota — solo para coger el ritmo.</p>
    <button class="practice-card p-punch" data-practice="punch">
      <span class="pc-ic">${icon("glove", 26)}</span>
      <div><div class="pc-name">Puños</div><div class="pc-sub">Golpea izquierda/derecha cuando la mitad se llene</div></div>
    </button>
    <button class="practice-card p-dodge" data-practice="dodge">
      <span class="pc-ic">${icon("target", 26)}</span>
      <div><div class="pc-name">Esquivas</div><div class="pc-sub">Inclina la cabeza hacia la esfera para esquivar</div></div>
    </button>
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-practice]").forEach((b) => b.onclick = () => app.startPractice(b.dataset.practice as "punch" | "dodge"));
}

export function renderTutorial(app: App) {
  let i = 0;
  const draw = () => {
    const step = TUTORIAL_STEPS[i];
    const last = i === TUTORIAL_STEPS.length - 1;
    app.root.innerHTML = `<div class="scene menu tutorial">
      ${topBar(app, "Tutorial")}
      <div class="scroll tut-wrap">
        <div class="coach">
          <div class="coach-portrait">
            <img src="characters/coach/coach.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
            <span class="coach-fallback" style="display:none">${icon("fist", 54)}</span>
          </div>
          <div class="coach-name">${COACH_NAME}</div>
        </div>
        <div class="bubble">${step.text}</div>
        <div class="tut-progress">${i + 1} / ${TUTORIAL_STEPS.length}</div>
        <div class="tut-nav">
          ${i > 0 ? `<button data-tut="prev">Anterior</button>` : ""}
          ${!last ? `<button class="primary" data-tut="next">Siguiente</button>`
            : `<button class="primary" data-practice="punch">Practicar puños</button>
               <button class="primary" data-practice="dodge">Practicar esquivas</button>
               <button data-nav="campaign">A la campaña</button>`}
          <button data-tut="replay">Repetir voz</button>
        </div>
      </div>
    </div>`;
    speak(step.text);
    app.save.tutorialDone = true; app.persist();
    wireNav(app);
    app.root.querySelector<HTMLButtonElement>('[data-tut="next"]')?.addEventListener("click", () => { i++; draw(); });
    app.root.querySelector<HTMLButtonElement>('[data-tut="prev"]')?.addEventListener("click", () => { i--; draw(); });
    app.root.querySelector<HTMLButtonElement>('[data-tut="replay"]')?.addEventListener("click", () => speak(step.text));
    app.root.querySelectorAll<HTMLButtonElement>("[data-practice]").forEach((b) => b.onclick = () => { try { window.speechSynthesis?.cancel(); } catch {} app.startPractice(b.dataset.practice as "punch" | "dodge"); });
  };
  draw();
}

function wireNav(app: App) {
  app.root.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => b.onclick = () => { try { window.speechSynthesis?.cancel(); } catch {} app.go(b.dataset.nav!); });
}
