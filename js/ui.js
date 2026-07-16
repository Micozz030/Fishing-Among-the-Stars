// ====== ui.js: 所有面板的 DOM 渲染 (统一经 openPanel 切换) + updateUI 总刷新入口 ======
// 依赖: config/data/state (基础三层) + actions.js (按钮点击回调) + fishing.js (钓鱼面板状态)
//       + systems.js (成就数据/漂流瓶)
//
// 关于 ui.js ⇄ actions.js / fishing.js / systems.js 的循环依赖 (有意为之, 已评估安全):
// 本文件几乎每个面板的按钮 onclick 都要调用 actions.js 的动作函数(建造/打造/升级/出售等),
// 而这些动作函数完成后又要调用本文件的 updateUI() 刷新界面 —— 这是"视图渲染读取状态并绑定动作,
// 动作执行完毕后触发视图刷新"的经典双向关系, 原始单文件版本里两者天然耦合在一起。
// ES 模块的循环 import 在这里是安全的: 所有跨模块调用都发生在事件回调/函数体内部,
// 不会在 import 语句执行的模块顶层求值阶段被调用。拆分成"参数层层透传回调"的写法在
// fishing.js 的 setTimeout 状态机链条上已经验证过反而更容易出错(见 fishing.js 顶部注释),
// 这里同理选择接受这个受控的循环依赖, 而不是引入额外的回调注入层。

import { CONFIG, ICONS, FISH_SELL_PRICE } from "./config.js";
import {
  FISH, FISH_PIXEL_GRIDS, RARITY_LABEL, BLUEPRINTS, BP_CATEGORY_LABEL, RAFT_PARTS,
  BUILDS, SKILL_DEFS, ACCESSORY_DEFS, COSTUME_OPTIONS, SHOP_HAIR_EXTRA, SHOP_ITEMS,
  FOOD_DEFS, RES_LABEL, BAG_CATEGORY_LABEL, BAG_CATEGORY_ORDER,
} from "./data.js";
import {
  state, costumeState, saveCostume, save, canAfford, ownsBlueprint,
  zoneTotalSlots, zoneSlotConfig, canExpandZone, resLine,
} from "./state.js";
import {
  doExpandRaft, tryBuild, tryBuildPart, doUpgradeRod, craftMaxAffordable,
  doCraftRope, doCraftRepairKit, doMakeJerky, doSmeltIron, doEatCoconutRaw,
  doOpenCoconut, doEatCoconutMeat, doEatCoconutJuice, doFishLoot, doRummage,
  doZoneSwitch, doEat, doDrink, doFeedPet, doSellFish, doBuyItem,
  doDiscardBagItem, doSellBagItem, treeHasTierUnlocked, canUnlockSkillNode,
  unlockSkillNode,
} from "./actions.js";
import {
  fishingState, fishingPhaseUntil, fishingPhaseDur, fishingBiteTier, rodChance, displayChancePct,
} from "./fishing.js";
import { ACHIEVEMENTS, ACHV_CATEGORY_LABEL } from "./systems.js";

// ====== UI 临时状态 (不写入存档 state, 单独持久化或纯内存) ======
export let selectedBait = "seaweed";       // 当前选中的鱼饵 (下拉选择, 默认水草)
let baitDropdownOpen = false;       // 鱼饵下拉是否展开
let collapsedBuiltOpen = false;     // 建造面板"已建造"折叠区是否展开

// ====== 建造/打造系统 (拆分为两个独立面板) ======
export let workshopFeedback = {};          // { key: { ok: bool, until: timestamp } } 操作结果反馈(1.5秒)
let bagExpandedKey = null;          // 背包当前展开操作列表的物品 key

export function setWorkshopFeedback(key, ok) {
  workshopFeedback[key] = { ok, until: Date.now() + 1500 };
  refreshOpenWorkshopPanels();
  setTimeout(() => {
    if (workshopFeedback[key] && Date.now() >= workshopFeedback[key].until) {
      delete workshopFeedback[key];
      refreshOpenWorkshopPanels();
    }
  }, 1600);
}

function refreshOpenWorkshopPanels() {
  const buildEl = document.getElementById("build-modal");
  const craftEl = document.getElementById("craft-modal");
  if (buildEl && !buildEl.classList.contains("hidden")) renderBuildModal();
  if (craftEl && !craftEl.classList.contains("hidden")) renderCraftModal();
}

// ====== 图鉴面板 ======
export function renderBestiary() {
  const grid = document.getElementById("bestiary-grid");
  grid.innerHTML = "";
  Object.keys(FISH).forEach(key => {
    const def = FISH[key];
    const entry = state.bestiary[key];
    const card = document.createElement("div");
    card.className = "fish-card" + (entry ? "" : " unknown");

    let iconHtml;
    if (entry && def.pixel) {
      iconHtml = `<canvas width="8" height="6" data-fish="${key}"></canvas>`;
    } else if (entry) {
      iconHtml = def.icon;
    } else {
      iconHtml = "❓";
    }

    // 🏆 皇冠徽章已移除(所有稀有度); 普通鱼只显示体长, 稀有/传说额外附上破纪录日期
    let recordHtml = "";
    if (entry && entry.record) {
      const dateStr = new Date(entry.record.caughtAt).toISOString().slice(0, 10);
      const dateTag = def.rarity !== "common" ? ` · ${dateStr}` : "";
      recordHtml = `<div class="fish-record">最长纪录: ${entry.record.length.toFixed(1)}cm${dateTag}</div>`;
    }

    card.innerHTML = `
      <div class="fish-icon">${iconHtml}</div>
      <div class="fish-name">${entry ? def.name : "???"}</div>
      <div class="rarity-tag rarity-${def.rarity}">${RARITY_LABEL[def.rarity]}</div>
      <div class="fish-count">${entry ? `钓到${entry.count}次 · 初遇${entry.firstZone === "river" ? "河流" : "溪流"}` : "尚未发现"}</div>
      ${recordHtml}
    `;
    grid.appendChild(card);
  });

  // 像素图标绘制 (已捕获的稀有/传说鱼)
  grid.querySelectorAll("canvas[data-fish]").forEach(cv => {
    const key = cv.getAttribute("data-fish");
    const pg = FISH_PIXEL_GRIDS[key];
    if (!pg) return;
    const c2d = cv.getContext("2d");
    c2d.imageSmoothingEnabled = false;
    for (let row = 0; row < pg.grid.length; row++) {
      for (let col = 0; col < pg.grid[row].length; col++) {
        const ch = pg.grid[row][col];
        if (ch === ".") continue;
        c2d.fillStyle = pg.colors[ch];
        c2d.fillRect(col, row, 1, 1);
      }
    }
  });
}

// ====== 图纸面板 ======
export function renderBlueprints() {
  const grid = document.getElementById("blueprint-grid");
  grid.innerHTML = "";
  Object.keys(BLUEPRINTS).forEach(key => {
    const def = BLUEPRINTS[key];
    const owned = ownsBlueprint(key);
    const part = RAFT_PARTS.find(p => p.bp === key);
    const built = part && state.raftParts[part.key];
    const card = document.createElement("div");
    card.className = "fish-card" + (owned ? "" : " unknown");
    card.innerHTML = `
      <div class="fish-icon">${owned ? def.icon : "❓"}</div>
      <div class="fish-name">${owned ? def.name : "???"}</div>
      <div class="rarity-tag bp-category-${def.category}">${BP_CATEGORY_LABEL[def.category]}</div>
      <div class="fish-count">${owned ? (built ? "已建造" : "尚未建造") : "尚未发现"}</div>
    `;
    grid.appendChild(card);
  });
}

// ====== 技能树 ======
function showSkillDetail(tree, node) {
  const unlocked = state.skills[tree][node.key];
  const canUnlock = canUnlockSkillNode(tree, node);
  const detail = document.getElementById("skill-detail");
  detail.innerHTML = `
    <b>${node.icon} ${node.name}</b> (消耗 ${node.cost}点)<br>
    ${node.desc}<br>
    ${unlocked ? '<span style="color:#5bd17a">✓ 已解锁</span>' : `<button class="build-btn" id="skill-unlock-btn" ${canUnlock ? "" : "disabled"}>${canUnlock ? "解锁" : "条件不足"}</button>`}
  `;
  if (!unlocked) {
    const btn = document.getElementById("skill-unlock-btn");
    if (btn) btn.onclick = () => unlockSkillNode(tree, node.key);
  }
}

function renderSkillTreeColumn(tree) {
  const col = document.getElementById("skill-tree-" + tree);
  col.innerHTML = "";
  [1, 2, 3].forEach(tier => {
    if (tier > 1) {
      const connector = document.createElement("div");
      connector.className = "skill-tier-connector";
      col.appendChild(connector);
    }
    const tierRow = document.createElement("div");
    tierRow.className = "skill-tier";
    SKILL_DEFS[tree].filter(n => n.tier === tier).forEach(node => {
      const unlocked = state.skills[tree][node.key];
      const available = !unlocked && canUnlockSkillNode(tree, node);
      const locked = !unlocked && !available;
      const btn = document.createElement("button");
      btn.className = "skill-node " + (unlocked ? "unlocked" : available ? "available" : "locked");
      btn.textContent = node.icon;
      btn.onclick = () => showSkillDetail(tree, node);
      tierRow.appendChild(btn);
    });
    col.appendChild(tierRow);
  });
}

export function renderSkillTree() {
  document.getElementById("skill-points-build").textContent = `🪵 建造点: ${state.skillPoints.build}`;
  document.getElementById("skill-points-fish").textContent = `🎣 钓鱼点: ${state.skillPoints.fish}`;
  renderSkillTreeColumn("build");
  renderSkillTreeColumn("fish");
}

// ====== 成就面板 ======
export function renderAchievements() {
  const list = document.getElementById("achievement-list");
  list.innerHTML = "";
  const cats = ["fish", "build", "zone", "hidden", "pet"];
  cats.forEach(cat => {
    const items = ACHIEVEMENTS.filter(a => a.cat === cat);
    if (!items.length) return;
    const title = document.createElement("div");
    title.className = "achv-category-title";
    title.textContent = ACHV_CATEGORY_LABEL[cat];
    list.appendChild(title);
    items.forEach(def => {
      const unlocked = !!state.achievements[def.id];
      const showHidden = def.hidden && !unlocked;
      const item = document.createElement("div");
      item.className = "achv-item " + (unlocked ? "unlocked" : "locked");
      item.innerHTML = showHidden
        ? `<b>???</b>隐藏成就,触发后才会显示`
        : `<b>${def.name}</b>${def.desc}`;
      list.appendChild(item);
    });
  });
}

// ====== 奇幻镜·换装面板 ======
function ownedAccessoryKeys() {
  const keys = ["none"];
  SHOP_ITEMS.forEach(item => {
    if (item.type === "accessory" && state.shopOwned.includes(item.id)) keys.push(item.key);
  });
  return keys;
}

function hairColorOptionsWithShop() {
  const opts = Object.assign({}, COSTUME_OPTIONS.hairColor);
  if (state.shopOwned.includes("rainbow_hair")) {
    opts.rainbow = Object.assign({ B: "#d4a653", C: "#b8843a" }, SHOP_HAIR_EXTRA.rainbow);
  }
  return opts;
}

export function renderCostumeModal() {
  const buildSwatchRow = (containerId, presets, stateKey, swatchKey) => {
    const box = document.getElementById(containerId);
    box.innerHTML = "";
    Object.entries(presets).forEach(([key, def]) => {
      const btn = document.createElement("button");
      btn.className = "costume-opt costume-swatch" + (costumeState[stateKey] === key ? " selected" : "");
      btn.style.background = key === "rainbow" ? "linear-gradient(90deg,#ff6b6b,#ffb347,#ffe066,#5bd17a,#6bc6ff,#9c6bcc)" : (def[swatchKey] || "#888");
      btn.title = def.label || key;
      btn.onclick = () => {
        costumeState[stateKey] = key;
        saveCostume();
        renderCostumeModal();
      };
      box.appendChild(btn);
    });
  };

  buildSwatchRow("costume-hair-options", hairColorOptionsWithShop(), "hairColor", "B");
  buildSwatchRow("costume-eye-options", COSTUME_OPTIONS.eyeColor, "eyeColor", "G");
  buildSwatchRow("costume-outfit-options", COSTUME_OPTIONS.outfitColor, "outfitColor", "F");

  const accBox = document.getElementById("costume-accessory-options");
  accBox.innerHTML = "";
  ownedAccessoryKeys().forEach(key => {
    const def = ACCESSORY_DEFS[key];
    const btn = document.createElement("button");
    btn.className = "costume-opt" + (costumeState.accessory === key ? " selected" : "");
    btn.textContent = `${def.icon} ${def.label}`;
    btn.onclick = () => {
      costumeState.accessory = key;
      saveCostume();
      renderCostumeModal();
    };
    accBox.appendChild(btn);
  });
}

// ====== 商店系统 ======
let shopTab = "sell"; // "sell" | "buy"
document.getElementById("shop-tab-sell").onclick = () => { shopTab = "sell"; renderShopModal(); };
document.getElementById("shop-tab-buy").onclick = () => { shopTab = "buy"; renderShopModal(); };

export function renderShopModal() {
  document.getElementById("shop-tab-sell").classList.toggle("active", shopTab === "sell");
  document.getElementById("shop-tab-buy").classList.toggle("active", shopTab === "buy");

  const list = document.getElementById("shop-content");
  list.innerHTML = "";

  if (shopTab === "sell") {
    const card = document.createElement("div");
    card.className = "build-card";
    card.innerHTML = `
      <div class="build-info"><b>🐟 鱼</b> (库存${Math.floor(state.res.fish)})<br>
      <span class="build-cost">单价 🪙${FISH_SELL_PRICE}/条</span></div>
      <div style="display:flex;gap:6px;">
        <button class="build-btn" id="btn-sell-one" ${state.res.fish < 1 ? "disabled" : ""}>出售1条</button>
        <button class="build-btn" id="btn-sell-all" ${state.res.fish < 1 ? "disabled" : ""}>全部出售</button>
      </div>
    `;
    list.appendChild(card);
    card.querySelector("#btn-sell-one").onclick = () => { doSellFish(1); renderShopModal(); };
    card.querySelector("#btn-sell-all").onclick = () => { doSellFish(Math.floor(state.res.fish)); renderShopModal(); };

    const lockedCard = document.createElement("div");
    lockedCard.className = "build-card";
    lockedCard.title = "传说之鱼,无价之宝";
    lockedCard.innerHTML = `<div class="build-info"><b>✨ 稀有鱼 / 💀 传说鱼</b></div><button class="build-btn" disabled>🔒 不可出售</button>`;
    list.appendChild(lockedCard);
  } else {
    SHOP_ITEMS.forEach(item => {
      const owned = state.shopOwned.includes(item.id);
      const card = document.createElement("div");
      card.className = "build-card";
      card.innerHTML = `
        <div class="build-info"><b>${item.icon} ${item.name}</b><br><span class="build-cost">${owned ? "已拥有" : `🪙${item.price}`}</span></div>
        <button class="build-btn ${owned ? "done" : ""}" ${owned || state.gold < item.price ? "disabled" : ""}>${owned ? "✓" : "购买"}</button>
      `;
      if (!owned) card.querySelector("button").onclick = () => { doBuyItem(item.id); renderShopModal(); };
      list.appendChild(card);
    });
  }
}

// ====== 第一行: 钓鱼按钮 ======
function baitDefs() {
  return {
    seaweed: { label: "水草饵", rareX: 1.0, legendaryX: 1.0, stock: state.res.seaweed },
    bread:   { label: "面包饵", rareX: 1.4, legendaryX: 1.6, stock: state.res.bread },
    spam:    { label: "午餐肉饵", rareX: 1.6, legendaryX: 2.0, stock: state.res.spam },
  };
}

export function renderFishRow() {
  const fishBtn = document.getElementById("btn-fish-cast");
  const arrowBtn = document.getElementById("btn-bait-arrow");
  const progressWrap = document.getElementById("fish-progress");
  const progressFill = document.getElementById("fish-progress-fill");

  if (!state.builds.rod) {
    fishBtn.textContent = "🔒 钓鱼 (需先建造鱼竿)";
    fishBtn.disabled = true;
    arrowBtn.disabled = true;
    progressWrap.classList.add("hidden");
    return;
  }

  if (fishingState !== "idle") {
    arrowBtn.disabled = true;
    const now = Date.now();
    const remain = Math.max(0, fishingPhaseUntil - now);
    const progressPct = fishingPhaseDur > 0 ? Math.max(0, Math.min(100, 100 * (1 - remain / fishingPhaseDur))) : 0;
    fishBtn.classList.remove("biting");
    if (fishingState === "casting") {
      fishBtn.textContent = "🎣 抛线中…";
      fishBtn.disabled = true;
      progressWrap.classList.add("hidden");
    } else if (fishingState === "waiting") {
      fishBtn.textContent = "🎣 等待中…";
      fishBtn.disabled = true;
      progressWrap.classList.remove("hidden");
      progressFill.style.width = `${progressPct}%`;
    } else if (fishingState === "biting") {
      fishBtn.textContent = "⬆️ 拉线!";
      fishBtn.disabled = false;
      fishBtn.classList.add("biting");
      progressWrap.classList.remove("hidden");
      progressFill.style.width = `${progressPct}%`;
    } else if (fishingState === "pulling") {
      fishBtn.textContent = "🎣 收线中…";
      fishBtn.disabled = true;
      progressWrap.classList.add("hidden");
    } else if (fishingState === "bitealert") {
      fishBtn.textContent = "❗ 咬钩了!";
      fishBtn.disabled = true;
      progressWrap.classList.add("hidden");
    } else if (fishingState === "minigame") {
      const label = fishingBiteTier === "legendary" ? "✨ 传说鱼上钩!点击屏幕!" : "💖 稀有鱼上钩!点击屏幕!";
      fishBtn.textContent = label;
      fishBtn.disabled = true;
      progressWrap.classList.add("hidden");
    }
    return;
  }

  fishBtn.classList.remove("biting");
  progressWrap.classList.add("hidden");
  const defs = baitDefs();
  const cur = defs[selectedBait] || defs.seaweed;
  const chancePct = displayChancePct(rodChance());
  const rareInfo = cur.rareX > 1.0 ? ` 稀有×${cur.rareX.toFixed(1)}` : "";
  fishBtn.textContent = `🎣 钓鱼-${cur.label} (${chancePct}%${rareInfo} 库存${Math.floor(cur.stock)})`;
  fishBtn.disabled = cur.stock < 1 || state.energy <= 0;
  arrowBtn.disabled = false;
}

export function renderBaitDropdown() {
  const box = document.getElementById("bait-dropdown");
  box.innerHTML = "";
  const defs = baitDefs();
  const list = document.createElement("div");
  list.className = "bait-dropdown-list";
  Object.entries(defs).forEach(([key, def]) => {
    const item = document.createElement("button");
    const outOfStock = def.stock < 1;
    item.className = "bait-option" + (key === selectedBait ? " selected" : "");
    item.textContent = `${def.label}${def.rareX > 1.0 ? ` 稀有×${def.rareX.toFixed(1)}` : ""} 库存${Math.floor(def.stock)}`;
    item.disabled = outOfStock; // 库存为0的饵料置灰禁用, 抛竿会消耗鱼饵, 不能选一个用不了的
    item.onclick = () => { if (outOfStock) return; selectedBait = key; baitDropdownOpen = false; updateUI(); };
    list.appendChild(item);
  });
  box.appendChild(list);
}

// ====== 建造面板 / 打造面板 (独立入口, 固定右上角) ======
export function openBuildModal() {
  renderBuildModal();
  document.getElementById("build-modal").classList.remove("hidden");
}
export function openCraftModal() {
  renderCraftModal();
  document.getElementById("craft-modal").classList.remove("hidden");
}

function costLineHtml(cost) {
  return Object.entries(cost).map(([k, v]) => {
    const have = Math.floor(state.res[k] || 0);
    const cls = have >= v ? "cost-ok" : "cost-bad";
    return `<span class="${cls}">${ICONS[k] || ""}${RES_LABEL[k] || k} ${have}/${v}</span>`;
  }).join(" ");
}

// 建造/打造成功不再使用卡片内弹层遮挡, 改为顶部小字 toast 提示 (见各 do* 函数里的 toast 调用)
function feedbackOverlayHtml(key) {
  const fb = workshopFeedback[key];
  if (!fb || fb.ok || Date.now() >= fb.until) return null;
  return `<div class="workshop-feedback fail">❌ 材料不足</div>`;
}

export function renderBuildModal() {
  const grid = document.getElementById("build-grid-list");
  if (!grid) return;
  grid.innerHTML = "";
  const hiddenItems = [];

  // 扩建木筏 (可重复, 始终显示)
  {
    const zone = state.zone;
    const canExpand = canExpandZone(zone);
    const card = document.createElement("div");
    card.className = "wcard";
    const fb = feedbackOverlayHtml("expand");
    card.innerHTML = fb || `
      <div class="wcard-icon">🛠️</div>
      <div class="wcard-name">扩建木筏</div>
      <div class="wcard-desc">增加木筏槽位,可以建造更多建筑</div>
      <div class="wcard-cost">${canExpand ? costLineHtml(CONFIG.EXPAND_COST) : "已达上限"}</div>
      <div class="wcard-sub">当前${zoneTotalSlots(zone)}格 / 上限${zoneSlotConfig(zone).max}格</div>
      <button class="wcard-btn" ${!canExpand || !canAfford(CONFIG.EXPAND_COST) ? "disabled" : ""}>${canExpand ? "建造" : "已达上限"}</button>
    `;
    grid.appendChild(card);
    if (!fb && canExpand) card.querySelector("button").onclick = doExpandRaft;
  }

  // 升级鱼竿 (可重复至满级, 始终显示)
  if (state.builds.rod) {
    const card = document.createElement("div");
    card.className = "wcard";
    const fb = feedbackOverlayHtml("rod_upgrade");
    if (state.rodLevel >= 6) {
      card.innerHTML = `<div class="wcard-icon">🎣</div><div class="wcard-name">鱼竿已满级</div><div class="wcard-sub">普通鱼命中 ${displayChancePct(rodChance())}% · 钩取区间已最大</div><button class="wcard-btn done">✓</button>`;
    } else {
      const cost = rodUpgradeCostRef();
      card.innerHTML = fb || `
        <div class="wcard-icon">🎣</div>
        <div class="wcard-name">升级鱼竿 Lv.${state.rodLevel}</div>
        <div class="wcard-desc">普通鱼命中率提升 + 稀有/传说钓鱼小游戏钩取区间扩大</div>
        <div class="wcard-cost">${costLineHtml(cost)}</div>
        <div class="wcard-sub">命中率 ${displayChancePct(rodChance())}% → +5% · 钩取区间 +4px</div>
        <button class="wcard-btn" ${canAfford(cost) ? "" : "disabled"}>建造</button>
      `;
      if (!fb) card.querySelector("button").onclick = doUpgradeRod;
    }
    grid.appendChild(card);
  }

  // 普通建筑
  BUILDS.forEach(def => {
    const built = state.builds[def.key];
    if (built && !def.repeatable) { hiddenItems.push({ name: def.name, icon: def.icon }); return; }
    const blockedByPrereq = def.requireBuild && !state.builds[def.requireBuild];
    const card = document.createElement("div");
    card.className = "wcard";
    const fb = feedbackOverlayHtml("build_" + def.key);
    card.innerHTML = fb || `
      <div class="wcard-icon">${def.icon}</div>
      <div class="wcard-name">${def.name}</div>
      <div class="wcard-desc">${def.desc}</div>
      ${blockedByPrereq ? `<div class="wcard-need">需要: 先建熔炉</div>` : `<div class="wcard-cost">${costLineHtml(def.cost)}</div>`}
      <button class="wcard-btn" ${blockedByPrereq ? "disabled" : (canAfford(def.cost) ? "" : "disabled")}>${blockedByPrereq ? "🔒锁定" : "建造"}</button>
    `;
    if (!fb && !blockedByPrereq) card.querySelector("button").onclick = () => tryBuild(def.key);
    grid.appendChild(card);
  });

  // 木筏部件 (需要图纸, 建成后不可重复建造)
  RAFT_PARTS.forEach(part => {
    const built = state.raftParts[part.key];
    if (built) { hiddenItems.push({ name: part.name, icon: BLUEPRINTS[part.bp].icon }); return; }
    const owned = ownsBlueprint(part.bp);
    const card = document.createElement("div");
    card.className = "wcard";
    const fb = feedbackOverlayHtml("part_" + part.key);
    card.innerHTML = fb || `
      <div class="wcard-icon">${BLUEPRINTS[part.bp].icon}</div>
      <div class="wcard-name">${part.name}</div>
      <div class="wcard-desc">${part.desc || ""}</div>
      ${owned ? `<div class="wcard-cost">${costLineHtml(part.cost)}</div>` : `<div class="wcard-need">需要: ${BLUEPRINTS[part.bp].name}图纸</div>`}
      <button class="wcard-btn" ${!owned || !canAfford(part.cost) ? "disabled" : ""}>${owned ? "建造" : "🔒锁定"}</button>
    `;
    if (!fb && owned) card.querySelector("button").onclick = () => tryBuildPart(part.key);
    grid.appendChild(card);
  });

  // 已建造折叠区
  const wrap = document.createElement("div");
  wrap.className = "wcard-collapse-wrap";
  if (hiddenItems.length) {
    const toggle = document.createElement("button");
    toggle.className = "build-collapse-toggle";
    toggle.textContent = `${collapsedBuiltOpen ? "▾" : "▸"} 已建造 (${hiddenItems.length})`;
    toggle.onclick = () => { collapsedBuiltOpen = !collapsedBuiltOpen; renderBuildModal(); };
    wrap.appendChild(toggle);
    if (collapsedBuiltOpen) {
      const subGrid = document.createElement("div");
      subGrid.className = "workshop-grid";
      hiddenItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "wcard";
        card.innerHTML = `<div class="wcard-icon">${item.icon}</div><div class="wcard-name">${item.name}</div><button class="wcard-btn done">✓</button>`;
        subGrid.appendChild(card);
      });
      wrap.appendChild(subGrid);
    }
  }
  grid.parentElement.querySelectorAll(".wcard-collapse-wrap").forEach(el => el.remove());
  grid.parentElement.appendChild(wrap);

  if (state.energy <= 0) {
    grid.querySelectorAll("button.wcard-btn:not(.done)").forEach(b => { b.disabled = true; b.textContent = "精力不足"; });
  }
}

// rodUpgradeCost 由 fishing.js 导出, 这里另起一个名字避免和本文件其它地方混淆
import { rodUpgradeCost as rodUpgradeCostRef } from "./fishing.js";

export function renderCraftModal() {
  const list = document.getElementById("craft-list");
  if (!list) return;
  list.innerHTML = "";

  const addRecipeRow = (key, icon, label, desc, cost, yieldObj, craftFn, allowBatch) => {
    const row = document.createElement("div");
    row.className = "wrow";
    const fb = feedbackOverlayHtml(key);
    const maxN = craftMaxAffordable(cost);
    row.innerHTML = fb || `
      <div class="wrow-info"><span class="wrow-icon">${icon}</span> <b>${label}</b><br>
      <span class="wrow-desc">${desc}</span><br>
      <span class="wrow-cost">${costLineHtml(cost)} → ${resLine(yieldObj)}</span></div>
      <div class="wrow-actions">
        <button class="wcard-btn wrow-btn1" ${maxN < 1 ? "disabled" : ""}>打造</button>
        ${allowBatch ? `<button class="wcard-btn wrow-btn5" ${maxN < 1 ? "disabled" : ""}>×5打造</button>` : ""}
      </div>
    `;
    if (!fb) {
      row.querySelector(".wrow-btn1").onclick = () => craftFn(1);
      const btn5 = row.querySelector(".wrow-btn5");
      if (btn5) btn5.onclick = () => craftFn(5);
    }
    list.appendChild(row);
  };

  addRecipeRow("craft_rope", "🪢", "木头→绳子", "把木头拧成绳子,基础合成材料", CONFIG.ROPE_CRAFT.cost, CONFIG.ROPE_CRAFT.yield, doCraftRope, true);
  addRecipeRow("craft_kit", "🔧", "木筏修复包", "用于河流突发事件中修复船身损耗", CONFIG.REPAIR_KIT_CRAFT.cost, CONFIG.REPAIR_KIT_CRAFT.yield, doCraftRepairKit, false);
  if (state.builds.dryer) addRecipeRow("craft_jerky", "🥩", "鱼→鱼干", "晒制鱼干,用于喂养宠物", CONFIG.JERKY_CRAFT.cost, CONFIG.JERKY_CRAFT.yield, doMakeJerky, true);
  if (state.builds.furnace) addRecipeRow("smelt", "🔥", "废铁→铁块", "将原矿冶炼为金属材料,解锁更多高级合成", CONFIG.SMELT_CRAFT.cost, CONFIG.SMELT_CRAFT.yield, doSmeltIron, true);

  // 椰子处理: 锤子敲开椰子 → 产出椰子肉×1 + 椰子汁×1
  {
    const key = "coconut_hammer";
    const locked = !state.builds.hammer;
    const row = document.createElement("div");
    row.className = "wrow";
    const fb = feedbackOverlayHtml(key);
    row.innerHTML = fb || `
      <div class="wrow-info"><span class="wrow-icon">🔨</span> <b>锤子开椰子</b><br>
      <span class="wrow-desc">敲开椰子,获得椰子肉×1和椰子汁×1,两件均可单独食用精力+${CONFIG.COCONUT_CRACK_RESTORE}</span><br>
      <span class="wrow-cost">椰子×1+锤子 → 🍖椰子肉×1 + 🥤椰子汁×1</span></div>
      <div class="wrow-actions"><button class="wcard-btn wrow-btn1" ${locked || state.res.coconut < 1 ? "disabled" : ""}>${locked ? "🔒锁定" : "处理"}</button></div>
    `;
    if (!fb && !locked) row.querySelector(".wrow-btn1").onclick = doOpenCoconut;
    list.appendChild(row);
  }

  if (!list.children.length) {
    list.innerHTML = `<div class="wrow-info" style="opacity:0.6;">暂无可打造项目</div>`;
  }

  if (state.energy <= 0) {
    list.querySelectorAll("button.wcard-btn:not(.done)").forEach(b => { b.disabled = true; b.textContent = "精力不足"; });
  }
}

// ====== 任务指引面板 (固定右上角, 默认展开) ======
export function renderGuide() {
  const box = document.getElementById("guide-content");
  if (!box) return;

  if (state.era !== "iron") {
    const def = BUILDS.find(b => b.key === "autocollector");
    const furnaceOk = !!state.builds.furnace;
    let html = `<div class="guide-title">🎯 当前目标: 跃升铁器时代</div>`;
    html += `<div class="guide-item ${furnaceOk ? "done" : ""}">${furnaceOk ? "✅" : "⬜"} 拥有熔炉</div>`;
    Object.entries(def.cost).forEach(([k, v]) => {
      const have = Math.floor(state.res[k] || 0);
      const ok = have >= v;
      html += `<div class="guide-item ${ok ? "done" : ""}">${ok ? "✅" : "⬜"} ${RES_LABEL[k] || k} ×${v} (当前: ${have})</div>`;
    });
    const allOk = furnaceOk && canAfford(def.cost);
    html += allOk
      ? `<div class="guide-ready">🎉 条件已全部满足!打开「建造」造出自动收集网吧</div>`
      : `<div class="guide-hint">提示: 在「建造」面板里造好熔炉,再攒够上面列出的材料</div>`;
    box.innerHTML = html;
  } else {
    let html = `<div class="guide-title">🎉 已进入铁器时代!</div>`;
    html += `<div class="guide-item done">✅ 拥有自动收集网,挂机产出已解锁</div>`;
    if (state.zone === "stream") {
      html += `<div class="guide-item ${state.zoneCooldownUntil <= Date.now() ? "done" : ""}">${state.zoneCooldownUntil <= Date.now() ? "✅" : "⬜"} 可以前往河流探索新流域了</div>`;
    } else {
      html += `<div class="guide-item done">✅ 已经在河流流域探索中</div>`;
    }
    const ownedBp = Object.keys(state.blueprints).length;
    const totalBp = Object.keys(BLUEPRINTS).length;
    html += `<div class="guide-item">📐 图纸收集进度: ${ownedBp}/${totalBp}</div>`;
    html += `<div class="guide-hint">提示: 翻垃圾堆有机会获得图纸,用图纸可以在「建造」面板里造出更强的木筏部件</div>`;
    box.innerHTML = html;
  }
}

// ====== 背包系统 (固定右上角, 统一管理消耗品: 食用/丢弃/售卖) ======
// category: "material" | "food" | "item" —— 背包按此分组显示标题(材料/食物/道具)
// 注意: 这里必须覆盖 state.res 的每一个key, 否则该资源会在UI上"隐形"(历史上scrap等材料就因遗漏于此而消失过, 详见下方 auditBagItemCoverage 自检)
export const BAG_ITEMS = [
  { key: "wood", icon: "🪵", name: "木头", category: "material", eat: null, sellPrice: 1 },
  { key: "rope", icon: "🧵", name: "绳子", category: "material", eat: null, sellPrice: 1 },
  { key: "scrap", icon: "🔧", name: "废铁", category: "material", eat: null, sellPrice: 1 },
  { key: "iron", icon: "🔩", name: "铁块", category: "material", eat: null, sellPrice: 2 },
  { key: "seaweed", icon: "🌿", name: "水草", category: "material", eat: null, sellPrice: 1 },
  { key: "plastic", icon: "♻️", name: "塑料", category: "material", eat: null, sellPrice: 1 },
  { key: "trash", icon: "🗑️", name: "垃圾", category: "material", eat: null, sellPrice: 1 },

  { key: "fish", icon: "🐟", name: "鱼", category: "food", eat: () => doEat("fish"), eatLabel: `精力+${FOOD_DEFS.fish.restore}`, sellPrice: FISH_SELL_PRICE },
  { key: "bread", icon: "🍞", name: "面包", category: "food", eat: () => doEat("bread"), eatLabel: `精力+${FOOD_DEFS.bread.restore}`, sellPrice: 2 },
  { key: "spam", icon: "🥫", name: "午餐肉", category: "food", eat: () => doEat("spam"), eatLabel: `精力+${FOOD_DEFS.spam.restore}`, sellPrice: 3 },
  { key: "water", icon: "💧", name: "净水", category: "food", eat: () => doDrink(), eatLabel: "精力+10", sellPrice: 1 },
  { key: "coconut", icon: "🥥", name: "椰子", category: "food", eat: () => doEatCoconutRaw(), eatLabel: `精力+${CONFIG.COCONUT_RAW_RESTORE}`, sellPrice: 1 },
  { key: "coconut_meat", icon: "🍖", name: "椰子肉", category: "food", eat: () => doEatCoconutMeat(), eatLabel: `精力+${CONFIG.COCONUT_CRACK_RESTORE}`, sellPrice: 2 },
  { key: "coconut_juice", icon: "🥤", name: "椰子汁", category: "food", eat: () => doEatCoconutJuice(), eatLabel: `精力+${CONFIG.COCONUT_CRACK_RESTORE}`, sellPrice: 2 },

  { key: "jerky", icon: "🍢", name: "鱼干", category: "item", eat: () => doFeedPet(), eatLabel: "宠物饱食度+", actionLabel: "喂宠物", sellPrice: 2 },
  { key: "raftkit", icon: "🧰", name: "修复包", category: "item", eat: null, sellPrice: 3 },
];

// 自检: 确保 state.res 里每个资源key都能在 BAG_ITEMS 找到对应的展示项, 避免未来新增资源时又"静默消失"
export function auditBagItemCoverage() {
  const covered = new Set(BAG_ITEMS.map(i => i.key));
  Object.keys(state.res).forEach(k => {
    if (!covered.has(k)) {
      console.warn(`[背包自检] 资源 "${k}" 在 state.res 中存在, 但没有对应的 BAG_ITEMS 展示项, 会在UI上不可见! 请在 BAG_ITEMS 中补充它的图标/名称/分类。`);
    }
  });
}

// 完整库存: 每个 state.res 里的资源都会出现(哪怕数量为0, 只是变暗), 按 材料/食物/道具 分组展示
export function renderBagModal() {
  const grid = document.getElementById("bag-grid");
  if (!grid) return;
  grid.innerHTML = "";

  BAG_CATEGORY_ORDER.forEach(cat => {
    const items = BAG_ITEMS.filter(i => i.category === cat);
    if (!items.length) return;

    const header = document.createElement("div");
    header.className = "bag-category-title";
    header.textContent = BAG_CATEGORY_LABEL[cat];
    grid.appendChild(header);

    items.forEach(item => {
      const count = Math.floor(state.res[item.key] || 0);
      const empty = count < 1;
      const card = document.createElement("div");
      card.className = "bag-card" + (empty ? " bag-card-empty" : "");
      const expanded = bagExpandedKey === item.key;
      card.innerHTML = `
        <div class="bag-card-main">
          <span class="bag-card-icon">${item.icon}</span>
          <span class="bag-card-name">${item.name}</span>
          <span class="bag-card-count">×${count}</span>
        </div>
        ${expanded ? `
          <div class="bag-actions">
            ${item.eat ? `<button class="bag-action-btn" id="bag-eat" ${empty || (item.key === "jerky" && !state.pet) ? "disabled" : ""}>${item.actionLabel || "食用"} (${item.eatLabel})</button>` : ""}
            <button class="bag-action-btn" id="bag-discard" ${empty ? "disabled" : ""}>丢弃</button>
            <button class="bag-action-btn sell" id="bag-sell" ${empty ? "disabled" : ""}>售卖 (🪙${item.sellPrice}/个)</button>
          </div>
        ` : ""}
      `;
      card.querySelector(".bag-card-main").onclick = () => {
        bagExpandedKey = expanded ? null : item.key;
        renderBagModal();
      };
      if (expanded) {
        if (item.eat) card.querySelector("#bag-eat").onclick = (e) => {
          e.stopPropagation();
          if (empty) return;
          item.eat();
          // 食用后保持该物品展开, 方便连续吃多个; 若数量已吃完则卡片自动变暗
          renderBagModal();
        };
        card.querySelector("#bag-discard").onclick = (e) => { e.stopPropagation(); if (!empty) doDiscardBagItem(item.key, 1); renderBagModal(); };
        card.querySelector("#bag-sell").onclick = (e) => { e.stopPropagation(); if (!empty) doSellBagItem(item.key, 1); renderBagModal(); };
      }
      grid.appendChild(card);
    });
  });
}

// ====== 下拉面板状态管理 ======
export function closeAllDropdowns() {
  baitDropdownOpen = false;
}
export function syncDropdownVisibility() {
  document.getElementById("bait-dropdown").classList.toggle("hidden", !baitDropdownOpen);
}
export function toggleBaitDropdown() {
  baitDropdownOpen = !baitDropdownOpen;
  syncDropdownVisibility();
}

// ====== 进场词条 (Roguelite buff) ======
export function openBuffModal() {
  const keys = Object.keys(BUFFS_REF);
  const choices = [];
  while (choices.length < 3 && choices.length < keys.length) {
    const k = pickRef(keys);
    if (!choices.includes(k)) choices.push(k);
  }
  const box = document.getElementById("buff-options");
  box.innerHTML = "";
  choices.forEach(key => {
    const def = BUFFS_REF[key];
    const btn = document.createElement("button");
    btn.className = "buff-opt-btn";
    btn.innerHTML = `${def.icon} <b>${def.name}</b><br>${def.desc}`;
    btn.onclick = () => {
      state.currentBuff = key;
      if (key === "shield") state.shieldAvailable = true;
      document.getElementById("buff-modal").classList.add("hidden");
      toastRef(`获得祝福: ${def.icon}${def.name}!`);
      updateUI();
      save();
    };
    box.appendChild(btn);
  });
  document.getElementById("buff-modal").classList.remove("hidden");
}
import { BUFFS as BUFFS_REF } from "./data.js";
import { pick as pickRef, toast as toastRef } from "./state.js";

// ====== UI 渲染: 总刷新入口 ======
export function updateUI() {
  document.getElementById("stat-era").textContent = state.era === "iron" ? "⚙️ 铁器时代" : "🪵 石器时代";
  document.getElementById("stat-zone").textContent = state.zone === "river" ? "📍 河流" : "📍 溪流";
  document.getElementById("topbar-raftstats").textContent =
    `⚡速${state.raftStats.speed} 🛡牢${state.raftStats.sturdy} 🎨美${state.raftStats.beauty}`;
  document.getElementById("topbar-gold").textContent = `🪙 ${Math.floor(state.gold)}`;
  document.getElementById("btn-costume").classList.toggle("hidden", !state.mirrorUnlocked);

  const energyPct = Math.max(0, Math.min(100, state.energy));
  const fillEl = document.getElementById("energy-bar-fill");
  fillEl.style.width = energyPct + "%";
  fillEl.classList.toggle("low", energyPct < 30);
  fillEl.classList.toggle("mid", energyPct >= 30 && energyPct < 80);
  document.getElementById("energy-value").textContent = `${Math.round(state.energy)}/100${state.energy <= 0 ? " (疲惫)" : ""}`;

  // 图标导航栏按钮内含 .nav-icon(图标)+.nav-label(常驻小字"换区") —— 只切换图标和title, 标签文字不变
  const zoneBtn = document.getElementById("btn-zone-switch");
  const zoneBtnIcon = zoneBtn.querySelector(".nav-icon");
  const now = Date.now();
  if (state.zone === "stream") {
    if (now < state.zoneCooldownUntil) {
      zoneBtnIcon.textContent = "⛵";
      zoneBtn.title = `冷却中 (${Math.ceil((state.zoneCooldownUntil - now) / 1000)}s)`;
      zoneBtn.disabled = true;
    } else if (state.era !== "iron") {
      zoneBtnIcon.textContent = "🔒";
      zoneBtn.title = "前往河流 (需铁器时代)";
      zoneBtn.disabled = true;
    } else {
      zoneBtnIcon.textContent = "⛵";
      zoneBtn.title = "前往河流";
      zoneBtn.disabled = false;
    }
  } else {
    if (now < state.zoneCooldownUntil) {
      zoneBtnIcon.textContent = "🏞️";
      zoneBtn.title = `冷却中 (${Math.ceil((state.zoneCooldownUntil - now) / 1000)}s)`;
      zoneBtn.disabled = true;
    } else {
      zoneBtnIcon.textContent = "🏞️";
      zoneBtn.title = "返回溪流";
      zoneBtn.disabled = false;
    }
  }

  const energyExhausted = state.energy <= 0;

  const lootBtn = document.getElementById("btn-fish-loot");
  lootBtn.textContent = energyExhausted ? "🪝 拉钩打捞 (精力不足)" : "🪝 拉钩打捞";
  lootBtn.disabled = energyExhausted;

  const rummageBtn = document.getElementById("btn-rummage");
  rummageBtn.textContent = energyExhausted
    ? `🗑️ 翻垃圾 (精力不足)`
    : `🗑️ 翻垃圾 (库存${Math.floor(state.res.trash)})`;
  rummageBtn.disabled = state.res.trash < 1 || energyExhausted;

  const buildBtn = document.getElementById("btn-build");
  buildBtn.textContent = energyExhausted ? "🔨 建造 (精力不足)" : "🔨 建造";
  const craftBtn = document.getElementById("btn-craft");
  craftBtn.textContent = energyExhausted ? "⚒️ 打造 (精力不足)" : "⚒️ 打造";

  for (const k of Object.keys(state.res)) {
    const el = document.getElementById("res-" + k);
    if (el) el.querySelector("span").textContent = Math.floor(state.res[k]);
  }

  renderFishRow();
  renderBaitDropdown();
  syncDropdownVisibility();
  refreshOpenWorkshopPanels();
  renderGuide();
  const bagEl = document.getElementById("bag-modal");
  if (bagEl && !bagEl.classList.contains("hidden")) renderBagModal();
}

// ====== 统一面板切换: 所有信息/管理类弹窗都经过 openPanel(name), 保证同一时刻最多一个可见 ======
// 点开一个面板时会自动关掉其它任何已开的面板(含漂流瓶弹窗), 无需先手动关闭再点开下一个;
// 再次点击当前已打开面板对应的按钮 = 关闭(toggle), 不会重新打开。
const PANEL_DEFS = {
  guide: { id: "guide-modal" },
  bag: { id: "bag-modal", render: () => { bagExpandedKey = null; renderBagModal(); } },
  bestiary: { id: "bestiary-modal", render: renderBestiary },
  blueprint: { id: "blueprint-modal", render: renderBlueprints },
  skilltree: { id: "skilltree-modal", render: renderSkillTree },
  achievement: { id: "achievement-modal", render: renderAchievements },
  shop: { id: "shop-modal", render: renderShopModal },
  costume: { id: "costume-modal", render: renderCostumeModal, guard: () => state.mirrorUnlocked },
  build: { id: "build-modal", render: renderBuildModal },
  craft: { id: "craft-modal", render: renderCraftModal },
  saveio: { id: "save-io-modal" },
};
const PANEL_CLOSE_IDS = [...Object.values(PANEL_DEFS).map(p => p.id), "bottle-modal"];

export function closeAllPanels() {
  PANEL_CLOSE_IDS.forEach(id => document.getElementById(id).classList.add("hidden"));
}

export function openPanel(name) {
  const def = PANEL_DEFS[name];
  if (!def) return;
  if (def.guard && !def.guard()) return;
  const el = document.getElementById(def.id);
  const alreadyOpen = !el.classList.contains("hidden");
  closeAllPanels();
  if (alreadyOpen) return; // 再点一次同一个按钮 = 关闭(toggle)
  if (def.render) def.render();
  el.classList.remove("hidden");
}
