// ====== actions.js: 玩家触发的动作 (打捞/翻垃圾/建造/打造/升级鱼竿/椰子/流域切换/商店/宠物/背包/技能树) ======
// 依赖: config/data/state (基础三层) + ui.js (updateUI/setWorkshopFeedback, 双向依赖已在 ui.js 顶部说明)
//       + fishing.js (rodChance/displayChancePct/rodUpgradeCost, 单向: fishing.js 不反向依赖本文件)
//       + systems.js (checkBuildAchievements/unlockAchievement/isModalOpen, 单向)

import { CONFIG, ICONS, CHEST_CHANCE, ANACHRONISM_CHANCE, FOOD_DROP_CHANCE, COCONUT_DROP_CHANCE, RUMMAGE_JOKE_CHANCE, FISH_SELL_PRICE } from "./config.js";
import {
  LOOT_TABLE_STONE, LOOT_TABLE_IRON, RUMMAGE_TABLE_STONE, RUMMAGE_TABLE_IRON,
  CHEST_LOOT, ANACHRONISMS, RUMMAGE_JOKES, BLUEPRINTS, RAFT_PARTS, BUILDS,
  PET_TYPES, FOOD_DEFS, SKILL_DEFS, BUFFS, SHOP_ITEMS,
  zoneDef, zoneBasin, zoneSlotConfig,
} from "./data.js";
import {
  state, toast, spendEnergy, restoreEnergy, efficiency, addRes, resLine, pick,
  canAfford, payCost, save, ownsBlueprint, grantBlueprint, grantRandomBlueprint,
  zoneTotalSlots, zoneCooldownMs,
} from "./state.js";
import { updateUI, setWorkshopFeedback, openBuffModal, renderSkillTree, BAG_ITEMS } from "./ui.js";
import { rodChance, displayChancePct, rodUpgradeCost } from "./fishing.js";
import { checkBuildAchievements, unlockAchievement, isModalOpen, isZoneUnlocked } from "./systems.js";
import { sfx } from "./audio.js";

// ====== 图纸 / 木筏部件 ======
export function tryBuildPart(key) {
  const part = RAFT_PARTS.find(p => p.key === key);
  if (!part || state.raftParts[key]) return;
  if (!ownsBlueprint(part.bp)) { sfx.error(); toast("没有对应的图纸,无法建造"); return; }
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再建造吧"); setWorkshopFeedback("part_" + key, false); return; }
  if (!canAfford(part.cost)) {
    sfx.error();
    toast("材料不够");
    state.stats.buildFailCount += 1;
    checkBuildAchievements();
    setWorkshopFeedback("part_" + key, false);
    return;
  }
  sfx.build();
  payCost(part.cost);
  state.raftParts[key] = true;
  state.raftStats.speed += part.stats.speed;
  state.raftStats.sturdy += part.stats.sturdy;
  state.raftStats.beauty += part.stats.beauty;
  spendEnergy(4);
  toast(`获得了${part.name}!`);
  checkBuildAchievements();
  updateUI();
  save();
}

// ====== 木筏面积/扩建 ======
// 需要读 data.js 的 ZONES 表, 按分层规则不能放进 state.js, 因此放在这里 (ui.js 也从这里导入它)。
export function canExpandZone(zone) {
  return state.raftSlots < zoneSlotConfig(zone).max;
}

export function doExpandRaft() {
  const zone = state.zone;
  if (!canExpandZone(zone)) { sfx.error(); toast(`这片水域的木筏最多扩建到${zoneSlotConfig(zone).max}格,前往更开阔的水域解锁更大船体`); return; }
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再扩建吧"); setWorkshopFeedback("expand", false); return; }
  if (!canAfford(CONFIG.EXPAND_COST)) { sfx.error(); toast("材料不够"); setWorkshopFeedback("expand", false); return; }
  sfx.build();
  payCost(CONFIG.EXPAND_COST);
  const cfg = zoneSlotConfig(zone);
  state.raftSlots = Math.min(cfg.max, state.raftSlots + cfg.step);
  spendEnergy(4);
  toast(`木筏扩建完成!当前面积: ${zoneTotalSlots(zone)}格`);
  updateUI();
  save();
}

// ====== 通用批量打造 ======
export function craftMaxAffordable(cost) {
  let max = Infinity;
  for (const k in cost) max = Math.min(max, Math.floor((state.res[k] || 0) / cost[k]));
  return max === Infinity ? 0 : Math.max(0, max);
}

export function doCraftBatch(feedbackKey, cost, yieldObj, n, energyEach, label) {
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再打造吧"); setWorkshopFeedback(feedbackKey, false); return 0; }
  const times = Math.min(n, craftMaxAffordable(cost));
  if (times < 1) { sfx.error(); toast("材料不够"); setWorkshopFeedback(feedbackKey, false); return 0; }
  sfx.craft();
  for (let i = 0; i < times; i++) { payCost(cost); addRes(yieldObj); }
  spendEnergy(energyEach * times);
  const totalYield = {};
  for (const k in yieldObj) totalYield[k] = yieldObj[k] * times;
  toast(`${label} x${times}: 获得 ${resLine(totalYield)}`);
  updateUI();
  save();
  return times;
}

// ====== 木头合成 ======
export function doCraftRope(n) {
  doCraftBatch("craft_rope", CONFIG.ROPE_CRAFT.cost, CONFIG.ROPE_CRAFT.yield, n || 1, 4, "合成绳子");
}

export function doCraftRepairKit(n) {
  doCraftBatch("craft_kit", CONFIG.REPAIR_KIT_CRAFT.cost, CONFIG.REPAIR_KIT_CRAFT.yield, n || 1, 4, "合成木筏修复包");
}

export function doMakeJerky(n) {
  if (!state.builds.dryer) return;
  doCraftBatch("craft_jerky", CONFIG.JERKY_CRAFT.cost, CONFIG.JERKY_CRAFT.yield, n || 1, 4, "晒鱼干");
}

export function doSmeltIron(n) {
  doCraftBatch("smelt", CONFIG.SMELT_CRAFT.cost, CONFIG.SMELT_CRAFT.yield, n || 1, 4, "熔炼铁块");
}

// ====== 宠物系统 ======
export function choosePet(type) {
  if (!PET_TYPES[type] || state.pet) return;
  state.pet = { type, satiety: 80, lastFeedDate: null, feedStreakDays: 0 };
  toast(`${PET_TYPES[type].icon} ${PET_TYPES[type].name} 加入了你的木筏!`);
  updateUI();
  save();
}

export function petMood() {
  if (!state.pet) return "happy";
  if (state.pet.satiety >= 80) return "happy";
  if (state.pet.satiety >= 40) return "neutral";
  return "sad";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// petActionUntil/petActionType (宠物跳动动画的临时状态) 属于渲染层, 定义在 render.js;
// 这里用 setPetAction 回调触发, 避免 actions.js 反向依赖 render.js。main.js 启动时会把
// render.js 的 setPetAction 注入进来 (见 wirePetAnimation)。
let _setPetAction = () => {};
export function wirePetAnimation(setPetActionFn) { _setPetAction = setPetActionFn; }

export function doFeedPet() {
  if (!state.pet) return;
  if (state.res.jerky < 1) { sfx.error(); toast("没有鱼干可以喂了,先去晒鱼架做一些"); return; }
  state.res.jerky -= 1;
  state.pet.satiety = Math.min(100, state.pet.satiety + CONFIG.PET_FEED_RESTORE);

  const today = todayStr();
  if (state.pet.lastFeedDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.pet.feedStreakDays = (state.pet.lastFeedDate === yesterday) ? state.pet.feedStreakDays + 1 : 1;
    state.pet.lastFeedDate = today;
    if (state.pet.feedStreakDays >= 3) unlockAchievement("pet_3day_feed");
  }

  _setPetAction("happy", Date.now() + 900);
  toast(`${PET_TYPES[state.pet.type].icon} 喂了宠物一块鱼干,它很开心!`);
  updateUI();
  save();
}

export function doPetInteract() {
  if (!state.pet) return;
  const actions = ["jump", "spin", "wag"];
  const actionType = pick(actions);
  _setPetAction(actionType, Date.now() + 900);
  const actionLabel = { jump: "跳了一下", spin: "转了个圈", wag: "摇了摇尾巴" }[actionType];
  toast(`${PET_TYPES[state.pet.type].icon} ${PET_TYPES[state.pet.type].name}${actionLabel}!`);
}

// ====== 手动打捞 (拉钩, 消耗精力2) ======
export function doFishLoot() {
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再打捞吧"); return; }
  const eff = efficiency();
  const now = Date.now();
  const eventEff = now < state.tempEffModExpire ? state.tempEffMod : 0;
  const table = state.era === "iron" ? LOOT_TABLE_IRON : LOOT_TABLE_STONE;
  let loot = pick(table);
  const netBonus = state.builds.net ? 1.5 : 1;
  const bountyBonus = (state.currentBuff === "bounty" && zoneBasin(state.zone) === "river") ? 1.5 : 1;
  const scaled = {};
  for (const k in loot) {
    let amt = Math.max(1, Math.round(loot[k] * Math.max(0.3, eff + eventEff) * netBonus * bountyBonus));
    if (state.skills.build.handy) amt += 1; // 手巧: 打捞掉落数量+1
    scaled[k] = amt;
  }
  addRes(scaled);
  if (scaled.trash) {
    state.stats.trashCollected += scaled.trash;
    if (state.stats.trashCollected >= 20) unlockAchievement("trash_20");
  }

  let extraMsg = "";
  if (Math.random() < FOOD_DROP_CHANCE) {
    const f = Math.random() < 0.5 ? "bread" : "spam";
    addRes({ [f]: 1 });
    extraMsg += ` ${ICONS[f]}+1`;
  }
  if (Math.random() < COCONUT_DROP_CHANCE) {
    addRes({ coconut: 1 });
    extraMsg += ` 🥥+1`;
  }
  if (Math.random() < CONFIG.SEAWEED_BONUS_CHANCE) {
    addRes({ seaweed: 1 });
    extraMsg += ` 🌿+1`;
  }

  toast(`捞到了 ${resLine(scaled)}${extraMsg}`);
  _spawnFloatingText(`+${Object.values(scaled).reduce((a, b) => a + b, 0)}`);

  if (Math.random() < CHEST_CHANCE) openChest();

  spendEnergy(2);
  updateUI();
  save();
}

// spawnFloatingText 定义在 state.js (共享 UI 反馈原语), 这里直接导入使用
import { spawnFloatingText as _spawnFloatingText } from "./state.js";

export function openChest() {
  sfx.chestOpen();
  let isRare = Math.random() < ANACHRONISM_CHANCE;
  let result = isRare ? pick(ANACHRONISMS) : pick(CHEST_LOOT);
  addRes(result.res);
  const modal = document.getElementById("chest-modal");
  const box = document.getElementById("chest-result");
  box.innerHTML = isRare
    ? `<div class="rare-item">${result.label}</div><div>${resLine(result.res)}</div>`
    : `<div>${result.label}</div><div>${resLine(result.res)}</div>`;
  modal.classList.remove("hidden");
}

document.getElementById("chest-close").onclick = () => {
  document.getElementById("chest-modal").classList.add("hidden");
  updateUI();
  save();
};

// ====== 吃喝 (恢复精力) ======
export function doEat(key) {
  if (state.res[key] < 1) return;
  state.res[key] -= 1;
  restoreEnergy(FOOD_DEFS[key].restore);
  toast(`吃了${FOOD_DEFS[key].label},精力+${FOOD_DEFS[key].restore}`);
  updateUI();
  save();
}

export function doDrink() {
  if (state.res.water < 1) return;
  state.res.water -= 1;
  restoreEnergy(10);
  toast("喝了一口净水,精力+10 💧");
  updateUI();
  save();
}

// ====== 鱼竿升级 ======
export function doUpgradeRod() {
  if (state.rodLevel >= 6) return;
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再升级吧"); setWorkshopFeedback("rod_upgrade", false); return; }
  const cost = rodUpgradeCost();
  if (!canAfford(cost)) { sfx.error(); toast("升级材料不够"); setWorkshopFeedback("rod_upgrade", false); return; }
  payCost(cost);
  state.rodLevel += 1;
  spendEnergy(4);
  toast(`鱼竿升级! 普通鱼命中 ${displayChancePct(rodChance())}% · 钩取区间 +4px`);
  updateUI();
  save();
}

// ====== 椰子处理: 生吃(+8精力) / 锤子敲开(产出椰子肉×1+椰子汁×1) ======
export function doEatCoconutRaw() {
  if (state.res.coconut < 1) { sfx.error(); toast("没有椰子了"); setWorkshopFeedback("coconut_raw", false); return; }
  state.res.coconut -= 1;
  restoreEnergy(CONFIG.COCONUT_RAW_RESTORE);
  toast(`生吃了一个椰子,精力+${CONFIG.COCONUT_RAW_RESTORE} 🥥`);
  updateUI();
  save();
}

export function doOpenCoconut() {
  if (!state.builds.hammer) return;
  if (state.res.coconut < 1) { sfx.error(); toast("没有椰子可以敲"); setWorkshopFeedback("coconut_hammer", false); return; }
  state.res.coconut -= 1;
  state.res.coconut_meat = (state.res.coconut_meat || 0) + 1;
  state.res.coconut_juice = (state.res.coconut_juice || 0) + 1;
  toast("敲开了一个椰子!获得 🍖椰子肉×1 + 🥤椰子汁×1,可分开食用各+8精力");
  updateUI();
  save();
}

export function doEatCoconutMeat() {
  if ((state.res.coconut_meat || 0) < 1) { sfx.error(); toast("没有椰子肉了"); return; }
  state.res.coconut_meat -= 1;
  restoreEnergy(FOOD_DEFS.coconut_meat.restore);
  toast(`吃了椰子肉,精力+${FOOD_DEFS.coconut_meat.restore} 🍖`);
  updateUI();
  save();
}

export function doEatCoconutJuice() {
  if ((state.res.coconut_juice || 0) < 1) { sfx.error(); toast("没有椰子汁了"); return; }
  state.res.coconut_juice -= 1;
  restoreEnergy(FOOD_DEFS.coconut_juice.restore);
  toast(`喝了椰子汁,精力+${FOOD_DEFS.coconut_juice.restore} 🥤`);
  updateUI();
  save();
}

// ====== 翻垃圾 (消耗精力5+1垃圾, 翻出废铁/铁块概率比普通打捞更高, 小概率出图纸) ======
function rummageLootTable() {
  return state.era === "iron" ? RUMMAGE_TABLE_IRON : RUMMAGE_TABLE_STONE;
}
function rummageSuccessChance() {
  return CONFIG.RUMMAGE_CHANCE[zoneBasin(state.zone)] || CONFIG.RUMMAGE_CHANCE.stream;
}

export function doRummage() {
  if (state.res.trash < 1) { sfx.error(); toast("没有垃圾可以翻了,先去拉钩打捞几个垃圾回来"); return; }
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再翻吧"); return; }
  state.res.trash -= 1;

  const eff = efficiency();
  const bpChance = CONFIG.BLUEPRINT_DROP_CHANCE + (state.skills.build.veteran ? 0.03 : 0);
  if (Math.random() < bpChance) {
    if (grantRandomBlueprint(BLUEPRINTS)) {
      unlockAchievement("bp_from_trash");
      checkBuildAchievements();
    }
  }

  if (Math.random() < rummageSuccessChance() * eff) {
    const loot = pick(rummageLootTable());
    const bountyBonus = (state.currentBuff === "bounty" && zoneBasin(state.zone) === "river") ? 1.5 : 1;
    const scaledLoot = {};
    for (const k in loot) {
      let amt = Math.max(1, Math.round(loot[k] * bountyBonus));
      if (state.skills.build.handy) amt += 1;
      scaledLoot[k] = amt;
    }
    addRes(scaledLoot);
    toast(`翻垃圾发现了 ${resLine(scaledLoot)}`);
    _spawnFloatingText(`+${Object.values(scaledLoot).reduce((a, b) => a + b, 0)}`);
  } else if (Math.random() < RUMMAGE_JOKE_CHANCE) {
    toast(pick(RUMMAGE_JOKES));
  } else {
    toast(`翻了半天什么都没找到...`);
  }
  spendEnergy(CONFIG.RUMMAGE_ENERGY_COST);
  updateUI();
  save();
}

// ====== 建筑/科技树 ======
export function tryBuild(key) {
  const def = BUILDS.find(b => b.key === key);
  if (!def || state.builds[key]) return;
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再建造吧"); setWorkshopFeedback("build_" + key, false); return; }
  if (!canAfford(def.cost)) {
    sfx.error();
    toast("材料不够");
    state.stats.buildFailCount += 1;
    checkBuildAchievements();
    setWorkshopFeedback("build_" + key, false);
    return;
  }
  sfx.build();
  payCost(def.cost);
  state.builds[key] = true;
  spendEnergy(4);

  if (key === "net") toast("获得了绳网!打捞效率提升 🪝");
  else if (key === "furnace") toast("获得了熔炉! 🔥 现在可以熔炼铁块了");
  else if (key === "autocollector") { toast("获得了自动收集网! ⚙️ 木筏文明跃升铁器时代!"); state.era = "iron"; }
  else if (key === "rod") toast("获得了简易鱼竿! 🎣");
  else if (key === "hammer") toast("获得了锤子! 🔨 可以敲椰子了");
  else if (key === "purifier") toast("获得了净水过滤器! 🚰 开始缓慢产水");
  else if (key === "dryer") toast("获得了晒鱼架! 🍢 现在可以晒鱼干喂宠物了");
  else if (key === "anchor") toast("获得了加固船锚! ⚓ 木筏可以驶向更深的水域了");
  else toast(`获得了${def.name}`);

  checkBuildAchievements();
  updateUI();
  save();
}

// ====== 流域系统 (5流域, 数据驱动) ======
// 由 地图面板 里点击某个已解锁流域触发。同一水域(basin)内互相往返即时且免费,
// 木筏/背包/建筑等其余一切照旧, 只有"流域切换冷却"和"当前流域"会变化。
export function doZoneTravel(targetZoneKey) {
  if (targetZoneKey === state.zone) return;
  const now = Date.now();
  if (now < state.zoneCooldownUntil) {
    const left = Math.ceil((state.zoneCooldownUntil - now) / 1000);
    toast(`流域切换冷却中,还剩${left}秒`);
    state.stats.cooldownClicks += 1;
    if (state.stats.cooldownClicks > 5) unlockAchievement("cooldown_spam_5");
    save();
    return;
  }
  if (!isZoneUnlocked(targetZoneKey)) { sfx.error(); toast("这片水域还未解锁"); return; }

  const targetDef = zoneDef(targetZoneKey);
  state.zone = targetZoneKey;
  if (zoneBasin(targetZoneKey) === "river") state.everVisitedRiver = true;
  else state.stormForceReturnAt = 0; // 回到溪流水域: 河流专属的暴风雨强制离场窗口作废
  state.castStreak = 0;
  state.shieldAvailable = state.currentBuff === "shield"; // 风浪免疫是否还可用, 取决于当前生效的祝福
  state.nextEventAt = now + 90000 + Math.random() * 60000;
  state.zoneCooldownUntil = now + zoneCooldownMs();
  state.stats.zoneEnterAt = now;
  toast(`⛵ 木筏缓缓驶入了「${targetDef.name}」...`);

  // 每个流域(除起始的初语浅溪外)首次抵达时提供一次性祝福选择, 选择会替换掉之前生效的祝福; 之后再来不会重复弹出
  if (targetZoneKey !== "stream_clear" && !state.zoneBlessed[targetZoneKey]) {
    openBuffModal(targetZoneKey);
  }
  updateUI();
  save();
}

// ====== 商店系统 ======
export function doSellFish(amount) {
  const n = Math.min(amount, Math.floor(state.res.fish));
  if (n < 1) { sfx.error(); toast("没有鱼可以出售"); return; }
  state.res.fish -= n;
  state.gold += n * FISH_SELL_PRICE;
  toast(`出售了 🐟${n}条,获得 🪙${n * FISH_SELL_PRICE}`);
  updateUI();
  save();
}

export function doBuyItem(id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || state.shopOwned.includes(id)) return;
  if (state.gold < item.price) { sfx.error(); toast("金币不够"); return; }
  state.gold -= item.price;
  state.shopOwned.push(id);
  toast(`🛍️ 购买了 ${item.icon}${item.name}!`);
  updateUI();
  save();
}

// ====== 背包 ======
export function doDiscardBagItem(key, amount) {
  const n = Math.min(amount, Math.floor(state.res[key] || 0));
  if (n < 1) return;
  state.res[key] -= n;
  toast(`丢弃了 ${ICONS[key] || ""}${n}个`);
  updateUI();
  save();
}

export function doSellBagItem(key, amount) {
  const item = BAG_ITEMS.find(i => i.key === key);
  if (!item) return;
  const n = Math.min(amount, Math.floor(state.res[key] || 0));
  if (n < 1) return;
  state.res[key] -= n;
  state.gold += n * item.sellPrice;
  toast(`出售了 ${item.icon}${n}个,获得 🪙${n * item.sellPrice}`);
  updateUI();
  save();
}

// ====== 技能树 ======
export function treeHasTierUnlocked(tree, tier) {
  return SKILL_DEFS[tree].some(n => n.tier === tier && state.skills[tree][n.key]);
}

export function canUnlockSkillNode(tree, node) {
  if (state.skills[tree][node.key]) return false;
  if (state.skillPoints[tree] < node.cost) return false;
  if (node.tier === 1) return true;
  return treeHasTierUnlocked(tree, node.tier - 1);
}

export function unlockSkillNode(tree, key) {
  const node = SKILL_DEFS[tree].find(n => n.key === key);
  if (!node || !canUnlockSkillNode(tree, node)) return;
  state.skillPoints[tree] -= node.cost;
  state.skills[tree][key] = true;
  toast(`🌳 解锁技能: ${node.icon}${node.name}!`);
  renderSkillTree();
  updateUI();
  save();
}
