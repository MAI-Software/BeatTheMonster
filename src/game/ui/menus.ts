// All non-combat screens. SVG icons only (no emoji). Render-to-HTML + wire buttons.
import { CAPS, playerRank } from "../data/balance";
import { LEVELS, ENEMIES, BOSS_IDS, CAMPAIGN_LORE } from "../data/enemies";
import { EQUIPMENT, SLOT_LABEL, equipmentForSlot, getEquipment, type Slot } from "../data/equipment";
import { FLOW_STATES, getFlowState } from "../data/flowStates";
import { canTrain, effectiveStats, spendVoucher, train, trainCost, xpToNext } from "../systems/progression";
import { AD_MAX, PULL_COST, adMsToNext, anyCraftable, canPull, craftItem, fragInfo, pull, refreshAds, watchAd } from "../systems/gacha";
import { maxEnergy, refreshEnergy, msToNext, canAfford, fmtTime } from "../systems/stamina";
import { ACHIEVEMENTS, claimChallenge, defFor } from "../systems/challenges";
import { leaderboard, myRank } from "../systems/ranking";
import { COACH_NAME, TUTORIAL_STEPS } from "../data/coach";
import { rankLabel, rankProgress } from "../data/collection";
import { CASSETTES } from "../data/cassettes";
import { setVolumes } from "../systems/audio";
import { PLAYER_SKINS, COACH_SKINS, ALL_SKINS, playerSkinImg, coachSkinImg } from "../data/skins";
import { icon, gicon, type IconName, type GIconName } from "./icons";

export interface App {
  root: HTMLElement; save: any;
  persist(): void; go(screen: string): void; back(): void;
  startFight(enemyId: string, episodeId?: number): void;
  startPractice(kind: "punch" | "dodge"): void;
  startSong(cassetteId: string): void;
  resetAll(): void;
  toast(msg: string): void;
}

// section background image (each menu shows its own room). Falls back to gym.
function sectionBg(key: string): string {
  return `<div class="section-bg"><img src="menu/${key}.webp" alt="" onerror="this.onerror=null;this.src='menu/gym.webp'"></div>`;
}

const slotIcon: Record<string, IconName> = { head: "headband", gloves: "glove", body: "charm", shins: "boot" };

function equipCard(rarity: string, owned: boolean, eq: boolean, ic: IconName, name: string, desc: string, pick: string): string {
  return `<button class="item-card r-${rarity} ${owned ? "" : "locked"} ${eq ? "equipped" : ""}" ${pick} ${owned ? "" : "disabled"}>
    <span class="ic-lead">${icon(ic, 22)}</span>
    <div class="ic-body"><div class="ic-top"><span class="ic-name">${name}</span><span class="ic-rar">${rarity}</span></div><div class="ic-desc">${desc}</div></div>
    <span class="ic-state">${eq ? "EQUIPADO" : owned ? "Equipar" : icon("lock", 16)}</span>
  </button>`;
}

function topBar(app: App, title: string): string {
  const s = app.save;
  return `<div class="topbar">
    <button class="back" data-back>${icon("back", 22)}</button>
    <h2>${title}</h2>
    <div class="currency">
      <span>${gicon("coin", 16)} ${s.coins}</span>
      <span>${gicon("gem", 16)} ${s.premium}</span>
    </div>
  </div>`;
}

export function renderHome(app: App) {
  const s = app.save;
  const need = xpToNext(s.level); const maxed = s.level >= CAPS.PLAYER_LEVEL;
  const energy = refreshEnergy(s); const eMax = maxEnergy(s);
  const ads = refreshAds(s);
  const canImprove = canTrain(s, "vt") || canTrain(s, "atk") || canTrain(s, "def");
  const chalClaimable = (list: any[]) => list.some((ch: any) => !ch.claimed && ch.progress >= (defFor(ch.id)?.goal ?? Infinity));
  const hasChalReward = chalClaimable(s.daily.challenges) || chalClaimable(s.weekly.challenges);
  app.root.innerHTML = `
    <div class="scene menu home">
      <div class="gym-bg"><img class="gym-layer show" alt=""><img class="gym-layer" alt=""></div>
      <div class="home-top" id="homeTop">
        <button class="menu-toggle" id="menuToggle" title="Menú"><img src="buttons/menu.webp" alt="Menú"></button>
        <div class="home-icons">
          <button class="home-icon" id="profileBtn" title="Perfil">${gicon("profile", 32)}</button>
          <button class="home-icon" data-nav="options" title="Opciones">${gicon("options", 32)}</button>
          <button class="home-icon" data-nav="wardrobe" title="Vestuario">${gicon("wardrobe", 32)}</button>
          <button class="home-icon ${anyCraftable(s) ? "notify" : ""}" data-nav="fragments" title="Fragmentos">${gicon("fragments", 32)}</button>
        </div>
      </div>
      <img class="home-title" src="title.webp" alt="Beat the Monster" onerror="this.style.display='none'">
      <div class="hero-art">
        <img class="ha-coach" src="${coachSkinImg(s.coachSkin)}" alt="" onerror="this.style.display='none'">
        <img class="ha-player" src="${playerSkinImg(s.gender)}" alt="" onerror="this.style.display='none'">
      </div>
      <div class="home-bottom">
        <div class="home-info">
          <span class="lvl"><b class="hnick">${s.nick || "Luchador"}</b> · Nv ${s.level}${maxed ? " MAX" : ""} · <span class="rank">${playerRank(s.level)}</span></span>
          <div class="statline oneline res">
            <span class="r-coin">${gicon("coin", 22)} ${s.coins}</span>
            <span class="r-gem">${gicon("gem", 22)} ${s.premium}</span>
            <span class="r-energy">${gicon("stamina", 22)} ${energy}/${eMax}</span>
            <span class="r-ads">${gicon("ads", 22)} ${ads}/${AD_MAX}</span>
          </div>
        </div>
        <button class="nav-main" data-nav="luchar"><img class="nav-bg" src="buttons/fight.webp" alt=""><span class="nav-label">${gicon("campaign", 44)} LUCHAR</span></button>
        <div class="nav-row">
          ${navBtn("training", "Entrenar", canImprove)}${navBtn("equip", "Equipo")}${navBtn("gacha", "Gacha", ads >= AD_MAX)}${navBtn("challenges", "Desafíos", hasChalReward)}${navBtn("collection", "Colección")}
        </div>
      </div>
    </div>`;
  wireNav(app);
  setupGymWalk(app);
  app.root.querySelector<HTMLButtonElement>("#profileBtn")!.onclick = () => app.toast(`${s.nick || "Luchador"} · Nivel ${s.level} · ${playerRank(s.level)}`);
  const homeTop = app.root.querySelector<HTMLElement>("#homeTop")!;
  app.root.querySelector<HTMLButtonElement>("#menuToggle")!.onclick = () => homeTop.classList.toggle("open");
}
const emj = (e: string) => `<span class="gi-emoji" style="font-size:24px">${e}</span>`;
const navBtn = (nav: string, label: string, notify = false) =>
  `<button class="nav-chip ${notify ? "notify" : ""}" data-nav="${nav}">${gicon(nav as GIconName, 24)}<span>${label}</span></button>`;

// Home keeps the MAIN gym image fixed; tapping a section plays a brief "step in"
// transition, then that section shows its own background.
function setupGymWalk(app: App) {
  const layers = Array.from(app.root.querySelectorAll<HTMLImageElement>(".gym-layer"));
  if (layers.length) { layers[0].src = "menu/gym.webp"; layers[0].classList.add("show"); }
  const home = app.root.querySelector<HTMLElement>(".home");
  let stepping = false;
  app.root.querySelectorAll<HTMLButtonElement>(".home-bottom [data-nav]").forEach((t) => {
    const nav = t.dataset.nav!;
    t.onclick = () => {
      if (stepping) return; stepping = true;
      home?.classList.add("stepping");
      setTimeout(() => app.go(nav), 360);
    };
  });
}

// "Luchar" hub: the play modes.
export function renderLuchar(app: App) {
  const s = app.save;
  const energy = refreshEnergy(s); const eMax = maxEnergy(s); const eNext = msToNext(s);
  const modes: { nav: string; ic: GIconName; label: string; sub: string }[] = [
    { nav: "campaign", ic: "campaign", label: "Historia", sub: "Capítulo 1 · contén la horda" },
    { nav: "practice", ic: "practice", label: "Práctica", sub: "Entrena puños o esquivas" },
    { nav: "tutorial", ic: "tutorial", label: "Tutorial", sub: "Cómo se juega" },
    { nav: "songs", ic: "songs", label: "Canciones", sub: "Juego libre con tus temas" },
  ];
  app.root.innerHTML = `<div class="scene menu">${sectionBg("campaign")}${topBar(app, "Luchar")}<div class="scroll">
    <div class="energy-pill">${gicon("stamina", 20)} ${energy}/${eMax}${energy < eMax ? ` · ${fmtTime(eNext)}` : ""}</div>
    ${modes.map((m) => `<button class="mode-card" data-nav="${m.nav}"><span class="mc-ic">${gicon(m.ic, 30)}</span><span class="mc-body"><b>${m.label}</b><small>${m.sub}</small></span>${icon("play", 16)}</button>`).join("")}
  </div></div>`;
  wireNav(app);
}

// Wardrobe: change player + coach appearance (cosmetic).
export function renderWardrobe(app: App) {
  const s = app.save;
  const card = (skin: { id: string; name: string; img: string; gender?: "male" | "female" }, kind: "player" | "coach") => {
    const owned = s.ownedSkins[skin.id] ?? true;
    const active = kind === "player" ? (s.gender ?? "male") === skin.gender : s.coachSkin === skin.id;
    return `<button class="skin-card ${active ? "on" : ""} ${owned ? "" : "locked"}" data-skin="${skin.id}" data-kind="${kind}" ${owned ? "" : "disabled"}>
      <img src="${skin.img}" alt="" onerror="this.style.display='none'">
      <span>${owned ? skin.name : "???"}</span>${active ? `<i class="sk-on">${icon("check", 16)}</i>` : ""}
    </button>`;
  };
  app.root.innerHTML = `<div class="scene menu">${sectionBg("gym")}${topBar(app, "Vestuario")}<div class="scroll">
    <p class="hint">Cambia la apariencia. Solo estético — las copias repetidas dan puntos de álbum.</p>
    <h3>Protagonista</h3><div class="skin-grid">${PLAYER_SKINS.map((sk) => card(sk, "player")).join("")}</div>
    <h3>Entrenador</h3><div class="skin-grid">${COACH_SKINS.map((sk) => card(sk, "coach")).join("")}</div>
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-skin]").forEach((b) => b.onclick = () => {
    const id = b.dataset.skin!; const kind = b.dataset.kind!;
    if (kind === "player") { const sk = PLAYER_SKINS.find((x) => x.id === id); if (sk) s.gender = sk.gender ?? "male"; }
    else s.coachSkin = id;
    app.persist(); renderWardrobe(app);
  });
}

export function renderCampaign(app: App) {
  const s = app.save;
  const energy = refreshEnergy(s); const eMax = maxEnergy(s); const eNext = msToNext(s);
  const cards = LEVELS.map((lv) => {
    const e = ENEMIES[lv.enemyId];
    const unlocked = lv.n - 1 <= s.episodeProgress;
    const beaten = lv.n - 1 < s.episodeProgress;
    const afford = energy >= lv.cost;
    const cls = lv.finalBoss ? "final" : lv.boss ? "boss" : "";
    return `<button class="lvl-card ${cls} ${unlocked ? "" : "locked"} ${beaten ? "beaten" : ""}" data-fight="${lv.enemyId}" ${unlocked && afford ? "" : "disabled"} style="--c:${e.color}">
      <span class="lc-n">${lv.n}</span>
      <span class="lc-body"><b>${unlocked ? e.name : "???"}</b><small>${lv.finalBoss ? "JEFE FINAL" : lv.boss ? "JEFE" : e.title}</small></span>
      <span class="lc-cost ${afford ? "" : "no"}">${gicon("stamina", 14)}${lv.cost}</span>
      <span class="lc-badge">${beaten ? icon("check", 16) : unlocked ? icon("play", 14) : icon("lock", 14)}</span>
    </button>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${sectionBg("campaign")}
    <div class="topbar"><button class="back" data-back>${icon("back", 22)}</button><h2>Capítulo 1</h2>
      <div class="energy-pill">${gicon("stamina", 20)} ${energy}/${eMax}${energy < eMax ? ` · ${fmtTime(eNext)}` : ""}</div></div>
    <div class="scroll"><p class="hint lore">${CAMPAIGN_LORE}</p><div class="lvl-list">${cards}</div></div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-fight]").forEach((b) => b.onclick = () => app.startFight(b.dataset.fight!));
}

export function renderTraining(app: App) {
  const s = app.save;
  const row = (stat: "atk" | "def" | "vt", cls: string) => {
    const cur = s.stats[stat]; const max = stat === "vt" ? CAPS.VT : stat === "atk" ? CAPS.ATK : CAPS.DEF;
    const cost = trainCost(stat, cur); const atMax = cur >= max;
    return `<div class="train-row ${cls}">
      <div class="tr-head">
        <span class="tr-stat ${cls}">${gicon(stat, 28)}<b>${cur}</b></span>
        <span class="tr-cost">${atMax ? "MAX" : `${gicon("coin", 14)}${cost}`}</span>
        <span class="tr-acts">
          <button class="tr-btn" data-train="${stat}" ${atMax || !canTrain(s, stat) ? "disabled" : ""}>+${stat === "vt" ? 10 : 1}</button>
          ${s.statVouchers > 0 && !atMax ? `<button class="tr-vch" data-vch="${stat}" title="Usar ticket de refuerzo">${gicon("ticket", 16)}</button>` : ""}
        </span>
      </div>
      <div class="bar tiny"><i class="fill ${cls}" style="width:${(cur / max) * 100}%"></i></div>
    </div>`;
  };
  app.root.innerHTML = `<div class="scene menu">${sectionBg("training")}${topBar(app, "Entrenar")}<div class="scroll">
    ${row("vt", "c-green")}${row("atk", "c-orange")}${row("def", "c-blue")}
    <div class="train-info">
      <p><span class="ti-ic">${gicon("coin", 15)}</span> Sube VT (+10), ATK (+1) o DEF (+1) con monedas. El coste crece con el nivel. Más ATK = más daño · más DEF = menos daño recibido · VT = aguante.</p>
      <p><span class="ti-ic">${gicon("ticket", 15)}</span> Tickets de refuerzo: suben un stat gratis. Se ganan en desafíos, al superar un escenario por primera vez y (raro) de jefes. Tienes <b>${s.statVouchers}</b>.</p>
    </div>
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((b) => b.onclick = () => { train(s, b.dataset.train as any) ? (app.persist(), renderTraining(app)) : app.toast("Sin monedas"); });
  app.root.querySelectorAll<HTMLButtonElement>("[data-vch]").forEach((b) => b.onclick = () => { if (spendVoucher(s, b.dataset.vch as any)) { app.persist(); renderTraining(app); } });
}

export function renderEquip(app: App) {
  const s = app.save;
  const gender = s.gender ?? "male";
  const SLOTS: { key: string; label: string; ic: IconName }[] = [
    { key: "head", label: "Cabeza", ic: "headband" },
    { key: "gloves", label: "Puños", ic: "glove" },
    { key: "body", label: "Ropa", ic: "charm" },
    { key: "shins", label: "Espinilleras", ic: "boot" },
    { key: "flow", label: "Estado de Flujo", ic: "bolt" },
  ];
  const slotRarity = (key: string): string => {
    if (key === "flow") return getFlowState(s.equippedFlow)?.rarity ?? "";
    const id = s.equippedGear[key]; return id ? getEquipment(id)?.rarity ?? "" : "";
  };
  const slotsView = () => {
    const eff = effectiveStats(s);
    app.root.innerHTML = `<div class="scene menu">${sectionBg("equip")}${topBar(app, "Equipo & Flow")}
      <div class="scroll equip-scroll">
        <div class="equip-hero"><img src="characters/player/${gender}.webp" alt="" onerror="this.style.display='none'"></div>
        <div class="slot-chips">${SLOTS.map((sl) => {
          const eq = sl.key === "flow" ? !!s.equippedFlow : !!s.equippedGear[sl.key];
          const rar = slotRarity(sl.key);
          return `<button class="slot-chip ${eq ? "equipped" : ""} ${rar ? "r-" + rar : ""} ${sl.key === "flow" ? "flow" : ""}" data-open="${sl.key}" title="${sl.label}">${icon(sl.ic, 26)}</button>`;
        }).join("")}</div>
        <div class="statline equip-stats">
          <span class="vt">${gicon("vt", 24)} ${eff.vt}</span><span class="atk">${gicon("atk", 24)} ${eff.atk}</span><span class="def">${gicon("def", 24)} ${eff.def}</span>
          <span class="flow">${gicon("flow", 24)} ${getFlowState(s.equippedFlow)?.name ?? "—"}</span>
        </div>
      </div></div>`;
    wireNav(app);
    app.root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => b.onclick = () => subView(b.dataset.open!));
  };

  const subView = (slot: string) => {
    const isFlow = slot === "flow";
    const label = isFlow ? "Estado de Flujo" : SLOT_LABEL[slot as Slot];
    const cards = isFlow
      ? FLOW_STATES.map((f) => {
          const owned = s.ownedFlow.includes(f.id); const eq = s.equippedFlow === f.id;
          return equipCard(f.rarity, owned, eq, "bolt", f.name, f.desc, owned ? `data-pick="${f.id}"` : "");
        }).join("")
      : equipmentForSlot(slot as Slot).map((e) => {
          const owned = s.ownedEquipment.includes(e.id); const eq = s.equippedGear[slot] === e.id; const b = e.bonus;
          const bonus = [b.atk && `ATK+${b.atk}`, b.def && `DEF+${b.def}`, b.vt && `VT+${b.vt}`, b.flowGainMult && `Flow×${b.flowGainMult}`].filter(Boolean).join("  ");
          return equipCard(e.rarity, owned, eq, slotIcon[slot], e.name, bonus, owned ? `data-pick="${e.id}"` : "");
        }).join("");
    app.root.innerHTML = `<div class="scene menu">${sectionBg("equip")}
      <div class="topbar"><button class="back" id="eqBack">${icon("back", 22)}</button><h2>${label}</h2>
        <div class="currency"><span>${gicon("coin", 16)} ${s.coins}</span><span>${gicon("gem", 16)} ${s.premium}</span></div></div>
      <div class="scroll">${cards || `<p class="hint">Nada en este slot todavía. Consíguelo en el Gacha.</p>`}</div></div>`;
    app.root.querySelector<HTMLButtonElement>("#eqBack")!.onclick = () => slotsView();
    app.root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => b.onclick = () => {
      const id = b.dataset.pick!;
      if (isFlow) s.equippedFlow = id;
      else s.equippedGear[slot] = s.equippedGear[slot] === id ? undefined : id;
      app.persist(); subView(slot);
    });
  };

  slotsView();
}

export function renderGacha(app: App) {
  const s = app.save;
  const ads = refreshAds(s); const adNext = adMsToNext(s);
  app.root.innerHTML = `<div class="scene menu">${sectionBg("gacha")}${topBar(app, "Gacha")}
    <div class="scroll gacha-scroll">
      <p class="hint">Tira para ganar <b>fragmentos</b>. Júntalos y crea el objeto en ${icon("puzzle", 13)} Fragmentos. Sin pagos reales.</p>
      <div id="pull-result"></div>
    </div>
    <div class="gacha-bottom">
      <div class="gbanner ad"><b>GRATIS</b><small id="ad-count">${gicon("ads", 13)} ${ads}/${AD_MAX}${ads < AD_MAX ? ` · ${Math.max(1, Math.ceil(adNext / 60000))}m` : ""}</small>
        <button class="pull-btn" data-ad ${ads > 0 ? "" : "disabled"}>Anuncio</button></div>
      <div class="gbanner basic"><b>BÁSICO</b><small>${gicon("coin", 13)} ${PULL_COST.normal}</small>
        <button class="pull-btn" data-pull="normal" ${canPull(s, "normal") ? "" : "disabled"}>Tirar</button></div>
      <div class="gbanner premium"><b>PREMIUM</b><small>${gicon("gem", 13)} ${PULL_COST.premium}</small>
        <button class="pull-btn" data-pull="premium" ${canPull(s, "premium") ? "" : "disabled"}>Tirar</button></div>
    </div>
  </div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-pull]").forEach((b) => b.onclick = () => {
    const res = pull(s, b.dataset.pull as any);
    if (!res) { app.toast("Sin monedas"); return; }
    app.persist();
    app.root.querySelector<HTMLDivElement>("#pull-result")!.innerHTML =
      `<div class="pull-pop r-${res.rarity}"><div class="pp-name">${icon(res.isFlow ? "bolt" : "glove", 18)} <b>${res.itemName}</b> <i>${res.rarity}</i></div><div class="pp-sub">+${res.fragsGained} frags ${res.crafted ? "· <b class='crafted'>DESBLOQUEADO</b>" : ""}</div></div>`;
    app.root.querySelector(".currency")!.innerHTML = `<span>${gicon("coin", 16)} ${s.coins}</span><span>${gicon("gem", 16)} ${s.premium}</span>`;
    b.disabled = !canPull(s, b.dataset.pull as any);
  });
  const adBtn = app.root.querySelector<HTMLButtonElement>("[data-ad]");
  if (adBtn) adBtn.onclick = () => {
    // placeholder: a real rewarded ad (Google/Apple) goes here; for now grant instantly
    const res = watchAd(s);
    if (!res) { app.toast("Sin anuncios disponibles"); return; }
    app.persist();
    app.root.querySelector<HTMLDivElement>("#pull-result")!.innerHTML =
      `<div class="pull-pop r-${res.rarity}"><div class="pp-name">${icon(res.isFlow ? "bolt" : "glove", 18)} <b>${res.itemName}</b> <i>${res.rarity}</i></div><div class="pp-sub">+${res.fragsGained} frags (anuncio) ${res.crafted ? "· <b class='crafted'>DESBLOQUEADO</b>" : ""}</div></div>`;
    const nowAds = refreshAds(s); const nextMs = adMsToNext(s);
    const adCount = app.root.querySelector<HTMLElement>("#ad-count");
    if (adCount) adCount.innerHTML = `${gicon("ads", 13)} ${nowAds}/${AD_MAX}${nowAds < AD_MAX ? ` · ${Math.max(1, Math.ceil(nextMs / 60000))}m` : ""}`;
    adBtn.disabled = nowAds <= 0;
  };
}

// Fragments: craft items once you have enough fragments from the gacha.
export function renderFragments(app: App) {
  const s = app.save;
  const rows = [...EQUIPMENT, ...FLOW_STATES].map((it) => {
    const fi = fragInfo(s, it.id); const pct = Math.min(100, (fi.have / fi.need) * 100);
    const craft = !fi.owned && fi.have >= fi.need;
    return `<div class="frag-row ${fi.owned ? "owned" : ""} ${craft ? "ready" : ""} r-${(it as any).rarity}">
      <div class="fr-body"><b>${(it as any).name}</b><div class="bar tiny"><i class="fill" style="width:${pct}%"></i></div></div>
      <div class="fr-side">${fi.owned ? `<span class="fr-have">${icon("check", 18)}</span>` : craft ? `<button class="fr-craft" data-craft="${it.id}">Crear</button>` : `<span class="fr-n">${fi.have}/${fi.need}</span>`}</div>
    </div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${sectionBg("gacha")}${topBar(app, "Fragmentos")}<div class="scroll">
    <p class="hint">Consigue fragmentos en el Gacha y crea el objeto al superar el máximo.</p>${rows}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-craft]").forEach((b) => b.onclick = () => {
    if (craftItem(s, b.dataset.craft!)) { app.persist(); app.toast("¡Objeto creado!"); renderFragments(app); }
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
          <span class="reward">${gicon("coin", 13)}${def.rewardCoins}${def.rewardPremium ? ` ${gicon("gem", 13)}${def.rewardPremium}` : ""}${def.rewardVoucher ? ` ${gicon("ticket", 13)}${def.rewardVoucher}` : ""}</span>
          ${ch.claimed ? icon("check", 18) : done ? `<button data-claim="${ch.id}" data-scope="${scope}">Cobrar</button>` : ""}
        </div></div>`;
    }).join("");
  const achv = ACHIEVEMENTS.map((a) => {
    const ap = s.achievements.find((x: any) => x.id === a.id) ?? { tier: 0, progress: 0 };
    const next = (ap.tier + 1) * a.step; const pct = Math.min(100, ((ap.progress % a.step) / a.step) * 100);
    return `<div class="chal achv"><div class="chal-text">${a.text} <i>Nv.${ap.tier}</i></div><div class="bar tiny"><i class="fill gold" style="width:${pct}%"></i></div>
      <div class="chal-foot"><span>${ap.progress}/${next}</span><span class="reward">+1 Vale stat</span></div></div>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${sectionBg("challenges")}${topBar(app, "Desafíos")}<div class="scroll">${block("Diarios", s.daily.challenges, "daily")}${block("Semanales", s.weekly.challenges, "weekly")}<h3>Logros</h3>${achv}</div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => b.onclick = () => { if (claimChallenge(s, b.dataset.claim!, b.dataset.scope as any)) { app.persist(); renderChallenges(app); } });
}

export function renderRanking(app: App) {
  const s = app.save; const board = leaderboard(s);
  const rows = board.map((e, i) => `<div class="rank-row ${e.you ? "you" : ""}"><span class="pos">${i + 1}</span><span class="nm">${e.name}</span><span class="sc">${e.score.toLocaleString()}</span></div>`).join("");
  app.root.innerHTML = `<div class="scene menu">${sectionBg("ranking")}${topBar(app, "Ranking")}<div class="scroll"><p class="hint">Tu mejor: <b>${s.bestScore.toLocaleString()}</b> · Puesto #${myRank(s)}. Sin PvP.</p><div class="rank-list">${rows}</div></div></div>`;
  wireNav(app);
}

export function renderPractice(app: App) {
  app.root.innerHTML = `<div class="scene menu">${sectionBg("practice")}${topBar(app, "Práctica")}<div class="scroll">
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

// First-run nickname (stored locally only).
export function renderNickname(app: App) {
  const s = app.save;
  app.root.innerHTML = `<div class="scene menu nick-scene">${sectionBg("gym")}
    <div class="nick-box">
      <h2 class="cs-title">Tu nombre de luchador</h2>
      <p class="hint">Elige tu apodo. Se guarda solo en este dispositivo.</p>
      <input id="nickInput" class="nick-input" type="text" maxlength="14" placeholder="Tu apodo" value="${s.nick}" autocomplete="off">
      <button class="primary" id="nickOk">Continuar</button>
    </div></div>`;
  const inp = app.root.querySelector<HTMLInputElement>("#nickInput")!;
  inp.focus();
  app.root.querySelector<HTMLButtonElement>("#nickOk")!.onclick = () => {
    s.nick = (inp.value.trim() || "Luchador").slice(0, 14); app.persist(); app.go("home");
  };
}

// Choose the player skin (after the tutorial). Gym backdrop, both fighters big,
// male preselected & highlighted; selecting grows/illuminates + shifts focus.
export function renderCharacterSelect(app: App) {
  let sel: "male" | "female" = "male";
  app.root.innerHTML = `<div class="scene menu charsel">
    <div class="section-bg"><img src="menu/gym.webp" alt="" onerror="this.style.display='none'"></div>
    <h2 class="cs-title">Elige tu luchador</h2>
    <div class="cs-stage" id="csStage">
      <button class="cs-fighter" data-sel="male"><img src="characters/player/male.webp" alt="" onerror="this.style.display='none'"><span>Hombre</span></button>
      <button class="cs-fighter" data-sel="female"><img src="characters/player/female.webp" alt="" onerror="this.style.display='none'"><span>Mujer</span></button>
    </div>
    <button class="primary cs-confirm">Elegir</button>
  </div>`;
  const stage = app.root.querySelector<HTMLElement>("#csStage")!;
  const apply = () => {
    app.root.querySelectorAll<HTMLButtonElement>(".cs-fighter").forEach((b) => b.classList.toggle("on", b.dataset.sel === sel));
    stage.classList.toggle("focus-male", sel === "male");
    stage.classList.toggle("focus-female", sel === "female");
  };
  apply();
  app.root.querySelectorAll<HTMLButtonElement>(".cs-fighter").forEach((b) => b.onclick = () => { sel = b.dataset.sel as "male" | "female"; apply(); });
  app.root.querySelector<HTMLButtonElement>(".cs-confirm")!.onclick = () => { app.save.gender = sel; app.persist(); app.go(app.save.nick ? "home" : "nickname"); };
}

// Cinematic intro: coach full-bleed (no frame), story text at the bottom, no voice.
export function renderTutorial(app: App) {
  let i = 0;
  const draw = () => {
    const step = TUTORIAL_STEPS[i];
    const last = i === TUTORIAL_STEPS.length - 1;
    app.root.innerHTML = `<div class="scene intro ${step.img ? "has-illus" : ""}" id="introScene">
      <img class="intro-portal" src="portal.webp" alt="" onerror="this.style.display='none'">
      <img class="intro-coach" src="characters/coach/coach.webp" alt="" onerror="this.style.display='none'">
      ${step.img ? `<img class="intro-illus" src="${step.img}" alt="" onerror="this.style.display='none'">` : ""}
      <div class="intro-skip"><button data-nav="home">Saltar</button></div>
      <div class="intro-bottom">
        <div class="intro-name">${COACH_NAME}</div>
        <div class="intro-text">${step.text}</div>
        <div class="intro-dots">${TUTORIAL_STEPS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <button class="primary intro-next">${last ? "Empezar" : "Continuar"}</button>
      </div>
    </div>`;
    app.save.tutorialDone = true; app.persist();
    wireNav(app);
    const advance = () => { if (last) app.go(app.save.gender ? "home" : "charselect"); else { i++; draw(); } };
    app.root.querySelector<HTMLButtonElement>(".intro-next")!.onclick = advance;
    // tapping the scene (not the buttons) also advances
    app.root.querySelector<HTMLElement>("#introScene")!.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest(".intro-next") || t.closest(".intro-skip")) return;
      advance();
    });
  };
  draw();
}

export function renderOptions(app: App) {
  const s = app.save;
  app.root.innerHTML = `<div class="scene menu">${sectionBg("gym")}${topBar(app, "Opciones")}<div class="scroll">
    <h3>Nombre</h3>
    <div class="opt-row"><input id="nickEdit" class="nick-input" type="text" maxlength="14" value="${s.nick}" placeholder="Tu apodo"><button class="opt-btn ghostbtn" id="nickSave">Guardar</button></div>
    <h3>Volumen</h3>
    <div class="opt-row"><label>Música</label><input type="range" id="volMusic" min="0" max="100" value="${Math.round(s.settings.musicVol * 100)}"><b id="volMusicV">${Math.round(s.settings.musicVol * 100)}</b></div>
    <div class="opt-row"><label>Efectos</label><input type="range" id="volSfx" min="0" max="100" value="${Math.round(s.settings.sfxVol * 100)}"><b id="volSfxV">${Math.round(s.settings.sfxVol * 100)}</b></div>
    <h3>Sesión</h3>
    <div class="opt-card">
      <div><b>No has iniciado sesión</b><small>El inicio de sesión con Google Play llegará pronto.</small></div>
      <button class="opt-btn ghostbtn" disabled>Conectar (próximamente)</button>
    </div>
    <button class="opt-btn danger" id="resetBtn">Reiniciar progreso</button>
    <p class="hint small">Versión de pruebas. Reiniciar borra todo tu avance en este dispositivo.</p>
  </div></div>`;
  wireNav(app);
  const m = app.root.querySelector<HTMLInputElement>("#volMusic")!;
  const sf = app.root.querySelector<HTMLInputElement>("#volSfx")!;
  const mv = app.root.querySelector<HTMLElement>("#volMusicV")!;
  const sv = app.root.querySelector<HTMLElement>("#volSfxV")!;
  const applyVol = () => { s.settings.musicVol = +m.value / 100; s.settings.sfxVol = +sf.value / 100; mv.textContent = m.value; sv.textContent = sf.value; setVolumes(s.settings.musicVol, s.settings.sfxVol); app.persist(); };
  m.oninput = applyVol; sf.oninput = applyVol;
  const ne = app.root.querySelector<HTMLInputElement>("#nickEdit")!;
  app.root.querySelector<HTMLButtonElement>("#nickSave")!.onclick = () => { s.nick = (ne.value.trim() || "Luchador").slice(0, 14); app.persist(); app.toast("Nombre guardado"); };
  let confirm = false;
  const rb = app.root.querySelector<HTMLButtonElement>("#resetBtn")!;
  rb.onclick = () => { if (!confirm) { confirm = true; rb.textContent = "¿Seguro? Pulsa otra vez"; } else app.resetAll(); };
}

export function renderSongs(app: App) {
  const s = app.save;
  const owned = CASSETTES.filter((c) => s.cassettes[c.id]);
  const rows = CASSETTES.map((c) => {
    const has = !!s.cassettes[c.id];
    return `<button class="song-row ${has ? "" : "locked"}" ${has ? `data-song="${c.id}"` : "disabled"}>
      <span class="sr-ic">${icon("note", 22)}</span>
      <span class="sr-meta"><b>${has ? c.name : "???"}</b><small>${has ? `${c.bpm} BPM` : `Cassette de ${ENEMIES[c.enemyId]?.name ?? "?"}`}</small></span>
      <span class="sr-go">${has ? icon("play", 16) : icon("lock", 14)}</span>
    </button>`;
  }).join("");
  app.root.innerHTML = `<div class="scene menu">${sectionBg("gym")}${topBar(app, "Canciones")}<div class="scroll">
    <p class="hint">Toca canciones que hayas conseguido. Los jefes sueltan su <b>cassette</b> (10%). Juego libre, sin derrota. Tocar canciones cuenta para misiones.</p>
    <h3>Cassettes · ${owned.length}/${CASSETTES.length}</h3>
    ${rows}
  </div></div>`;
  wireNav(app);
  app.root.querySelectorAll<HTMLButtonElement>("[data-song]").forEach((b) => b.onclick = () => app.startSong(b.dataset.song!));
}

export function renderCollection(app: App) {
  const s = app.save;
  const bosses = BOSS_IDS.map((id) => ENEMIES[id]).map((e) => {
    const defeated = !!s.defeated[e.id];
    const seals = s.seals[e.id] ?? 0;
    const rp = rankProgress(seals);
    if (!defeated) return `<div class="col-card locked"><div class="cc-face">?</div><div class="cc-body"><b>???</b><small>Sin derrotar</small></div></div>`;
    return `<div class="col-card">
      <div class="cc-face">${e.emoji}</div>
      <div class="cc-body"><b>${e.name}</b><small>Sellos: ${seals}${rp.maxed ? " · MAX" : ` · ${rp.have}/${rp.need} al siguiente`}</small></div>
      <div class="cc-rank">${rankLabel(seals)}</div>
    </div>`;
  }).join("");
  const gear = EQUIPMENT.map((e) => {
    const owned = s.ownedEquipment.includes(e.id);
    return `<div class="col-mini r-${e.rarity} ${owned ? "" : "locked"}"><span>${owned ? e.name : "???"}</span><i>${e.rarity}</i></div>`;
  }).join("");
  const flows = FLOW_STATES.map((f) => {
    const owned = s.ownedFlow.includes(f.id);
    return `<div class="col-mini r-${f.rarity} ${owned ? "" : "locked"}"><span>${owned ? f.name : "???"}</span><i>${f.rarity}</i></div>`;
  }).join("");
  const cassettes = CASSETTES.map((c) => {
    const has = !!s.cassettes[c.id];
    return `<div class="col-mini r-rare ${has ? "" : "locked"}"><span>${has ? c.name : "???"}</span><i>cassette</i></div>`;
  }).join("");
  const ownedGear = EQUIPMENT.filter((e) => s.ownedEquipment.includes(e.id)).length;
  const ownedFlow = FLOW_STATES.filter((f) => s.ownedFlow.includes(f.id)).length;
  const skins = ALL_SKINS.map((sk) => {
    const owned = s.ownedSkins[sk.id] ?? true; const copies = s.skinCopies[sk.id] ?? 0;
    return `<div class="col-mini r-epic ${owned ? "" : "locked"}"><span>${owned ? sk.name : "???"}</span><i>${copies > 0 ? "×" + (copies + 1) : "skin"}</i></div>`;
  }).join("");
  const ownedSkins = ALL_SKINS.filter((sk) => s.ownedSkins[sk.id] ?? true).length;
  const ownedCas = CASSETTES.filter((c) => s.cassettes[c.id]).length;
  const defeatedN = BOSS_IDS.filter((id) => s.defeated[id]).length;
  app.root.innerHTML = `<div class="scene menu">${sectionBg("ranking")}${topBar(app, "Colección")}<div class="scroll">
    <p class="hint">Derrota jefes para conseguir sus <b>sellos</b> (5% por victoria). Cada 5 sellos sube el rango (F→SSS) y da un <b>ticket de stat</b>.</p>
    <h3>Jefes · ${defeatedN}/${BOSS_IDS.length}</h3>
    <div class="col-list">${bosses}</div>
    <h3>Equipo · ${ownedGear}/${EQUIPMENT.length}</h3>
    <div class="col-grid">${gear}</div>
    <h3>Estados de Flujo · ${ownedFlow}/${FLOW_STATES.length}</h3>
    <div class="col-grid">${flows}</div>
    <h3>Canciones · ${ownedCas}/${CASSETTES.length}</h3>
    <div class="col-grid">${cassettes}</div>
    <h3>Apariencias · ${ownedSkins}/${ALL_SKINS.length}</h3>
    <div class="col-grid">${skins}</div>
  </div></div>`;
  wireNav(app);
}

function wireNav(app: App) {
  app.root.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => b.onclick = () => { try { window.speechSynthesis?.cancel(); } catch {} app.go(b.dataset.nav!); });
  app.root.querySelectorAll<HTMLButtonElement>("[data-back]").forEach((b) => b.onclick = () => app.back());
}
