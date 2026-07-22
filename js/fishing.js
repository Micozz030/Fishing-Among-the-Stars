// ====== fishing.js: 钓鱼动画状态机 + 稀有/传说鱼精准小游戏 + 图鉴体长纪录 + 分享卡片 ======
// 依赖: config/data/state (基础三层) + systems.js (成就检测) + ui.js (updateUI)
//
// 关于 fishing.js ⇄ ui.js 的循环依赖 (有意为之, 已评估安全):
// ui.js 的钓鱼饵料面板(renderFishRow/renderBaitDropdown)需要读取本文件的 fishingState 等状态,
// 本文件的每个动作(doFishing等)在状态变化后又需要调用 ui.js 的 updateUI() 刷新界面 —— 这是
// "视图读状态、动作触发视图刷新"这一经典双向关系, 在原始单文件版本里这种耦合到处都是。
// ES 模块的循环 import 是安全的, 只要跨模块的相互调用都发生在函数体内部(不在模块顶层求值时执行),
// 这里完全满足: doFishing 等函数只在被外部事件触发时才会调用 updateUI(), 不会在 import 时立刻执行。
// 拆成"用回调参数层层透传 updateUI"的写法反而会在 setTimeout 链和 DOM 事件回调之间引入脆弱的
// 模块级"当前回调"闭包变量, 复杂度和出错概率都更高, 故这里选择直接接受这个受控的循环依赖。

import { CONFIG, MINIGAME_CONFIG } from "./config.js";
import { FISH, FISH_PIXEL_GRIDS, RARITY_LABEL, zoneBasin } from "./data.js";
import {
  state, ctx, toast, spendEnergy, spawnFloatingText, flashLegendary, pick, save,
  efficiency,
} from "./state.js";
import { checkFishAchievements } from "./systems.js";
import { updateUI } from "./ui.js";
import { sfx } from "./audio.js";

// ====== 钓鱼动画状态机 ======
// 普通鱼: idle -> casting(抛线0.5s) -> waiting(等待咬钩1.5~3s) -> biting(咬钩窗口0.8s) -> pulling(拉线0.5s) -> idle
// 稀有/传说鱼: ...-> waiting -> bitealert(咬钩预警~1.2s, 见 MINIGAME_CONFIG.biteAlertDurationMs) -> minigame(精准小游戏) -> idle
export let fishingState = "idle";
export let fishingPhaseUntil = 0;
export let fishingPhaseDur = 0;            // 当前阶段总时长(ms), 用于进度条计算
export let fishingBaitKey = null;
export let fishingBaitBonus = 0;
let fishingTimer = null;
export const fishRipples = [];               // canvas水面波纹特效 [{x,y,life}]

// ====== 稀有/传说鱼精准小游戏状态 ======
export let fishingBiteTier = null;         // "common"|"rare"|"legendary" 咬钩阶段预判
export let minigame = null;                // 小游戏运行时状态对象, 见 startMinigame()
let minigameOverlayEl = null;       // 全屏输入捕获层 (小游戏进行时点击任意处让指针上浮)
export let biteAlertStartAt = 0;           // 咬钩预警阶段开始时间戳, 用于文字跳动/屏幕抖动的计时

const FISH_ESCAPE_JOKES = ["跑了!手慢了一步", "差一点……", "这条鱼太狡猾了"];

function fishPool(basin, rarity) {
  return Object.keys(FISH).filter(k => FISH[k].rarity === rarity && FISH[k].zones.includes(basin));
}

// 根据鱼种稀有度+专属体长倍率, 随机生成本次捕获的长度(cm), 保留1位小数
export function rollFishLength(fishKey) {
  const def = FISH[fishKey];
  const range = CONFIG.FISH_LENGTH_RANGES[def.rarity] || CONFIG.FISH_LENGTH_RANGES.common;
  const mult = def.lengthMult || 1.0;
  const raw = (range[0] + Math.random() * (range[1] - range[0])) * mult;
  return Math.round(raw * 10) / 10;
}

// length: 本次捕获的体长(cm), 用于更新该鱼种的个人最长纪录 (state.bestiary[key].record)
// 返回值: 本次捕获是否刷新了纪录
export function registerCatch(fishKey, isExtra, length) {
  const def = FISH[fishKey];
  const entry = state.bestiary[fishKey] || (state.bestiary[fishKey] = { caught: false, count: 0, firstZone: null, record: null });
  entry.caught = true;
  entry.count += 1;
  if (!entry.firstZone) entry.firstZone = state.zone;

  let isNewRecord = false;
  if (typeof length === "number") {
    if (!entry.record || length > entry.record.length) {
      entry.record = { length, caughtAt: Date.now() };
      isNewRecord = true;
    }
  }

  // 普通鱼: 只报体长, 不提"新纪录"(减少刷屏噪音); 稀有/传说: 破纪录时保留"📏 新纪录!"庆祝语
  const rareLenTag = typeof length === "number" ? ` (${length.toFixed(1)}cm${isNewRecord ? " 📏新纪录!" : ""})` : "";
  if (def.rarity === "legendary") {
    state.skillPoints.fish += 3;
    flashLegendary();
    toast(`✨✨ 传说级!钓到了 ${def.icon}${def.name}${rareLenTag}! 钓鱼点+3 ✨✨`);
  } else if (def.rarity === "rare") {
    state.skillPoints.fish += 1;
    toast(`💖 稀有!钓到了 ${def.icon}${def.name}${rareLenTag}! 钓鱼点+1`);
  } else if (!isExtra) {
    const commonLenTag = typeof length === "number" ? ` ${length.toFixed(1)}cm` : "";
    toast(`${def.icon} ${def.name}${commonLenTag}`);
  }
  return isNewRecord;
}

// 根据当前流域+词条+技能决定本次钓上的鱼种
export function rollFishSpecies(forceTier) {
  const basin = zoneBasin(state.zone);
  const legendaryChance = 0.005;
  let tier = forceTier;
  if (!tier) {
    if (Math.random() < legendaryChance) tier = "legendary";
    else if (basin === "river") {
      const luckBonus = state.currentBuff === "luck" ? 0.20 : 0;
      tier = Math.random() < (0.08 + luckBonus) ? "rare" : "common";
    } else {
      tier = "common";
    }
  }
  let pool = fishPool(basin, tier);
  if (!pool.length) pool = fishPool(basin, "common");
  return pick(pool);
}

// ====== 钓鱼系统 (动画状态机, 消耗精力3) ======
export function rodChance() {
  let base = Math.min(1.0, 0.7 + state.rodLevel * 0.05);
  if (state.skills.fish.bait_research) base += 0.15; // 鱼饵研究: 普通鱼命中率+15%
  return Math.min(1, base);
}

// UI上显示的命中率比实际值低10个百分点(给玩家一点"超出预期"的小惊喜), 不影响实际判定概率
export function displayChancePct(actualChance) {
  return Math.round(Math.max(0, actualChance - 0.1) * 100);
}

// 返回稀有/传说鱼出现概率的综合倍率 (饵料 × 技能 × 词条)
function getRareLegendaryMultiplier(baitKey) {
  const BAIT_MULTS = {
    seaweed: { rare: 1.0, legendary: 1.0 },
    bread:   { rare: 1.4, legendary: 1.6 },
    spam:    { rare: 1.6, legendary: 2.0 },
  };
  const bm = BAIT_MULTS[baitKey] || BAIT_MULTS.seaweed;
  let rare = bm.rare;
  let legendary = bm.legendary;
  if (state.skills.fish.rare_sense) { rare *= 1.2; legendary *= 1.1; }
  if (state.currentBuff === "precision" && zoneBasin(state.zone) === "river") { rare *= 1.15; legendary *= 1.15; }
  return { rare, legendary };
}

// 根据饵料+技能+词条预判本次咬钩的鱼种等级
function rollFishTierWithBait(baitKey) {
  const mults = getRareLegendaryMultiplier(baitKey);
  if (Math.random() < 0.005 * mults.legendary) return "legendary";
  if (zoneBasin(state.zone) === "river") {
    const luckBonus = state.currentBuff === "luck" ? 0.20 : 0;
    if (Math.random() < (0.08 + luckBonus) * mults.rare) return "rare";
  }
  return "common";
}

const BAIT_LABEL = { seaweed: "水草饵", bread: "面包饵", spam: "午餐肉饵" };
const CAST_ENERGY_COST = 3;         // 每次抛竿消耗的精力 (与结算时刻脱钩, 抛竿瞬间就扣)
const CAST_DURATION_MS = Math.round(350 * 1.15); // 抛线动画时长: 原350ms的1.15倍(手感微调, 403ms)

// 入口: 点击「钓鱼」按钮 (idle时起竿, biting时拉线)
// 消耗规则(明确以此为准): 每次抛竿在起竿瞬间就扣 精力3 + 所选鱼饵×1, 不论后续命中/未命中/小游戏成败,
// 都不会再重复或额外扣鱼饵——小游戏失败只是"鱼跑了", 因为鱼饵已经在抛竿那一下用掉了。
export function doFishing(useFoodBait) {
  if (fishingState === "biting") { pullFishingLine(); return; }
  if (fishingState !== "idle") return;
  if (!state.builds.rod) return;
  if (state.energy <= 0) { sfx.error(); toast("精力不足,歇一会再钓吧"); return; }

  let baitKey = "seaweed";
  if (useFoodBait === "bread" || useFoodBait === "spam") baitKey = useFoodBait;
  if (state.res[baitKey] < 1) {
    sfx.error();
    toast(`没有${BAIT_LABEL[baitKey]}了,换一种饵料吧`);
    return;
  }

  sfx.cast();
  spendEnergy(CAST_ENERGY_COST);
  state.res[baitKey] -= 1;

  fishingBaitKey = baitKey;
  fishingBaitBonus = 0; // 饵料不再影响命中率, 改为影响稀有/传说触发概率
  fishingState = "casting";
  fishingPhaseDur = CAST_DURATION_MS;
  fishingPhaseUntil = Date.now() + fishingPhaseDur;
  updateUI();
  save();
  clearTimeout(fishingTimer);
  fishingTimer = setTimeout(enterFishWaitPhase, fishingPhaseDur);
}

function enterFishWaitPhase() {
  const dur = 1000 + Math.random() * 1000;
  fishingState = "waiting";
  fishingPhaseDur = dur;
  fishingPhaseUntil = Date.now() + dur;
  updateUI();
  fishingTimer = setTimeout(enterFishBitePhase, dur);
}

// 普通鱼: 沿用原有"抛线->等待->咬钩(0.8s窗口, 点击拉线)->收线"流程, 无小游戏
// 稀有/传说鱼: 先经过一小段"咬钩预警"缓冲, 再进入精准小游戏 (见 startBiteAlert / startMinigame)
function enterFishBitePhase() {
  fishingBiteTier = rollFishTierWithBait(fishingBaitKey);
  if (fishingBiteTier !== "common") {
    startBiteAlert(fishingBiteTier);
    return;
  }
  fishingState = "biting";
  fishingPhaseDur = 800;
  fishingPhaseUntil = Date.now() + fishingPhaseDur;
  updateUI();
  fishingTimer = setTimeout(missFishBite, 800);
}

// 咬钩预警: 小游戏正式开始前冻结~1.2s, 显示"❗咬钩了!"+屏幕抖动(传说鱼额外触发全屏金光特效), 让玩家反应过来。
// 此阶段还没有创建小游戏的全屏输入捕获层(见 ensureMinigameOverlay 在 startMinigame 里才调用),
// 所以这段时间的点击不会被误判为小游戏操作, 天然满足"预警期间不接受点击"的要求。
function startBiteAlert(tier) {
  sfx.biteAlert();
  fishingState = "bitealert";
  biteAlertStartAt = Date.now();
  fishingPhaseDur = MINIGAME_CONFIG.biteAlertDurationMs;
  fishingPhaseUntil = biteAlertStartAt + MINIGAME_CONFIG.biteAlertDurationMs;
  if (tier === "legendary") flashLegendary();
  clearTimeout(fishingTimer);
  updateUI();
  fishingTimer = setTimeout(() => startMinigame(tier), MINIGAME_CONFIG.biteAlertDurationMs);
}

function missFishBite() {
  sfx.escape();
  fishingState = "idle";
  toast(pick(FISH_ESCAPE_JOKES));
  fishingBiteTier = null;
  updateUI();
  save();
}

function pullFishingLine() {
  if (fishingState !== "biting") return;
  clearTimeout(fishingTimer);
  fishingState = "pulling";
  fishingPhaseDur = 350;
  fishingPhaseUntil = Date.now() + fishingPhaseDur;
  updateUI();
  fishingTimer = setTimeout(resolveFishCatch, fishingPhaseDur);
}

// 仅处理普通鱼的收线判定 (命中率生成 + 松弛的容错), 稀有/传说鱼由 finalizeMinigameCatch 处理
function resolveFishCatch() {
  const now = Date.now();
  const tempHit = now < state.tempHitModExpire ? state.tempHitMod : 0;
  const eff = efficiency();
  const chance = Math.min(1, (rodChance() + tempHit) * eff);
  const hit = Math.random() < chance;
  const precisionActive = state.currentBuff === "precision" && zoneBasin(state.zone) === "river";

  if (hit) {
    sfx.commonCatch();
    state.castStreak += 1;

    const speciesKey = rollFishSpecies("common");
    const length = rollFishLength(speciesKey);
    registerCatch(speciesKey, false, length);
    const gain = 1 + (Math.random() < 0.25 ? 1 : 0);
    state.res.fish += gain;
    spawnFloatingText(`🐟+${gain}`);
    checkFishAchievements(speciesKey, true);

    // 磁力鱼钩: 额外多钓1条普通鱼
    if (state.currentBuff === "magnet") {
      const extraKey = rollFishSpecies("common");
      const extraLen = rollFishLength(extraKey);
      registerCatch(extraKey, true, extraLen);
      state.res.fish += 1;
      toast(`磁力鱼钩还多带上来一条 ${FISH[extraKey].icon}${FISH[extraKey].name}!`);
    }

    // 精准直觉: 每3次成功钓到普通鱼, 额外白送一条稀有鱼 (不占用小游戏)
    if (precisionActive && state.castStreak % 3 === 0) {
      const bonusKey = rollFishSpecies("rare");
      const bonusLen = rollFishLength(bonusKey);
      registerCatch(bonusKey, true, bonusLen);
      state.res.fish += 1;
      toast(`精准直觉发动!额外获得 ${FISH[bonusKey].icon}${FISH[bonusKey].name} (${bonusLen.toFixed(1)}cm)!`);
    }
  } else {
    sfx.escape();
    state.castStreak = 0;
    toast("鱼饵被叼跑了,这次没钓到...");
    checkFishAchievements(null, false);
  }
  // 精力与鱼饵已经在 doFishing() 抛竿瞬间扣过了, 这里(收线结算)不再重复扣
  fishingState = "idle";
  fishingBaitKey = null;
  fishingBiteTier = null;
  updateUI();
  save();
}

// ====== 稀有/传说鱼: 时机型收杆小游戏 ======
// 鱼图标在条内不规则游动(随机变速换向, 平滑过渡); 绿色钩取区间规律往返移动;
// 玩家点击瞬间若鱼图标落在钩取区间内则命中一次, 累计到所需命中次数即成功; 落空消耗一次尝试并让鱼受惊加速
function startMinigame(tier) {
  const isLeg = tier === "legendary";
  const zoneH = Math.min(MINIGAME_CONFIG.barH * MINIGAME_CONFIG.zoneMaxRatio,
    (isLeg ? MINIGAME_CONFIG.legendaryZoneH : MINIGAME_CONFIG.rareZoneH) + state.rodLevel * MINIGAME_CONFIG.zoneBonusPxPerLevel);
  const zoneBaseSpeed = isLeg ? MINIGAME_CONFIG.legendaryZoneSpeed : MINIGAME_CONFIG.rareZoneSpeed;
  const zoneSpeed = zoneBaseSpeed * (1 - state.rodLevel * MINIGAME_CONFIG.zoneSpeedReductionPerLevel);
  const fishBaseSpeed = isLeg ? MINIGAME_CONFIG.legendaryFishSpeed : MINIGAME_CONFIG.rareFishSpeed;
  const durationMs = isLeg ? MINIGAME_CONFIG.legendaryDurationMs : MINIGAME_CONFIG.rareDurationMs;
  const hooksNeeded = isLeg ? MINIGAME_CONFIG.legendaryHooksNeeded : MINIGAME_CONFIG.rareHooksNeeded;
  const attemptsAllowed = isLeg ? MINIGAME_CONFIG.legendaryAttemptsAllowed : MINIGAME_CONFIG.rareAttemptsAllowed;

  minigame = {
    tier,
    // 鱼图标游动状态
    fishY: Math.random() * (MINIGAME_CONFIG.barH - MINIGAME_CONFIG.pointerH),
    fishVel: 0,
    fishTargetVel: (Math.random() < 0.5 ? -1 : 1) * fishBaseSpeed,
    fishNextRedirectAt: 0,        // 0 表示下一帧立刻重新选一次目标速度
    fishBaseSpeed,
    fishStartledUntil: 0,         // 玩家点空后的受惊状态结束时间戳
    fishHookedSpeedBonus: 1,      // 传说鱼首次命中后触发的永久提速倍率

    // 绿色钩取区间 (规律乒乓)
    zoneY: Math.random() * (MINIGAME_CONFIG.barH - zoneH),
    zoneH,
    zoneDir: Math.random() < 0.5 ? 1 : -1,
    zoneSpeed,

    startAt: Date.now(),
    durationMs,
    hooksNeeded,
    hooksDone: 0,
    attemptsAllowed,
    attemptsUsed: 0,

    resolved: null,      // null | "success" | "fail"
    resolvedAt: 0,
    tapFlash: null,       // { type: "hit"|"miss", until } 点击瞬间的命中/落空反馈
  };
  fishingState = "minigame";
  fishingPhaseDur = durationMs;
  fishingPhaseUntil = minigame.startAt + durationMs;
  clearTimeout(fishingTimer);
  ensureMinigameOverlay();
  updateUI();
}

export function updateMinigame() {
  if (!minigame) return;
  const now = Date.now();
  if (minigame.resolved === null) {
    // 鱼: 每隔一段随机时间重新选择一次目标速度(方向+可能的爆发), 当前速度向目标速度平滑插值
    if (now >= minigame.fishNextRedirectAt) {
      const burst = Math.random() < 0.3 ? (1 + Math.random() * (MINIGAME_CONFIG.fishBurstMult - 1)) : 1;
      const dir = Math.random() < 0.5 ? -1 : 1;
      minigame.fishTargetVel = dir * minigame.fishBaseSpeed * burst;
      minigame.fishNextRedirectAt = now + MINIGAME_CONFIG.fishRedirectMinMs +
        Math.random() * (MINIGAME_CONFIG.fishRedirectMaxMs - MINIGAME_CONFIG.fishRedirectMinMs);
    }
    minigame.fishVel += (minigame.fishTargetVel - minigame.fishVel) * MINIGAME_CONFIG.fishLerpRate;

    const startledActive = minigame.fishStartledUntil > now;
    const speedMult = (startledActive ? MINIGAME_CONFIG.fishStartledMult : 1) * minigame.fishHookedSpeedBonus;
    const maxFishY = MINIGAME_CONFIG.barH - MINIGAME_CONFIG.pointerH;
    minigame.fishY += minigame.fishVel * speedMult;
    if (minigame.fishY <= 0) { minigame.fishY = 0; minigame.fishVel = Math.abs(minigame.fishVel); minigame.fishTargetVel = Math.abs(minigame.fishTargetVel); }
    if (minigame.fishY >= maxFishY) { minigame.fishY = maxFishY; minigame.fishVel = -Math.abs(minigame.fishVel); minigame.fishTargetVel = -Math.abs(minigame.fishTargetVel); }

    // 绿色钩取区间: 匀速乒乓往返
    const maxZoneY = MINIGAME_CONFIG.barH - minigame.zoneH;
    minigame.zoneY += minigame.zoneDir * minigame.zoneSpeed;
    if (minigame.zoneY <= 0) { minigame.zoneY = 0; minigame.zoneDir = 1; }
    if (minigame.zoneY >= maxZoneY) { minigame.zoneY = maxZoneY; minigame.zoneDir = -1; }

    // 尝试次数耗尽仍未达标 -> 失败; 时间耗尽仍未达标 -> 失败 (由 finalizeMinigameCatch 统一结算)
    if (minigame.attemptsUsed >= minigame.attemptsAllowed && minigame.hooksDone < minigame.hooksNeeded) {
      minigame.resolved = "fail";
      minigame.resolvedAt = now;
    } else if (now - minigame.startAt >= minigame.durationMs) {
      minigame.resolved = "fail";
      minigame.resolvedAt = now;
    }
  } else if (now - minigame.resolvedAt >= MINIGAME_CONFIG.flashDurationMs) {
    finalizeMinigameCatch(minigame.resolved === "success");
  }
}

// 点击/点按瞬间判定: 鱼图标中心此刻是否落在绿色钩取区间内
function onMinigameTap() {
  if (fishingState !== "minigame" || !minigame || minigame.resolved !== null) return;
  const now = Date.now();
  const fishCenter = minigame.fishY + MINIGAME_CONFIG.pointerH / 2;
  const inZone = fishCenter >= minigame.zoneY && fishCenter <= minigame.zoneY + minigame.zoneH;
  minigame.attemptsUsed += 1;

  if (inZone) {
    sfx.hookHit();
    minigame.hooksDone += 1;
    minigame.tapFlash = { type: "hit", until: now + MINIGAME_CONFIG.tapFlashDurationMs };
    if (minigame.hooksDone >= minigame.hooksNeeded) {
      minigame.resolved = "success";
      minigame.resolvedAt = now;
      return;
    }
    if (minigame.tier === "legendary") {
      minigame.fishHookedSpeedBonus = MINIGAME_CONFIG.fishHookedSpeedMult;
      toast("钩住了!再来一次!");
    }
  } else {
    sfx.hookMiss();
    minigame.tapFlash = { type: "miss", until: now + MINIGAME_CONFIG.tapFlashDurationMs };
    minigame.fishStartledUntil = now + MINIGAME_CONFIG.fishStartledDurationMs;
    if (minigame.attemptsUsed >= minigame.attemptsAllowed) {
      minigame.resolved = "fail";
      minigame.resolvedAt = now;
    }
  }
}

function ensureMinigameOverlay() {
  if (minigameOverlayEl) return minigameOverlayEl;
  const el = document.createElement("div");
  el.id = "minigame-input-overlay";
  el.style.cssText = "position:fixed;inset:0;z-index:600;background:transparent;touch-action:none;cursor:pointer;";
  el.addEventListener("click", onMinigameTap);
  el.addEventListener("touchstart", (e) => { e.preventDefault(); onMinigameTap(); }, { passive: false });
  document.body.appendChild(el);
  minigameOverlayEl = el;
  return el;
}
function removeMinigameOverlay() {
  if (minigameOverlayEl) { minigameOverlayEl.remove(); minigameOverlayEl = null; }
}

// 在游戏画布(360x420)中央绘制小游戏浮层: 目标区间(绿色/自动移动) + 指针(点击上浮/自动下沉) + 右侧倒计时条
export function drawMinigame() {
  if (!minigame) return;
  const now = Date.now();
  const barW = MINIGAME_CONFIG.barW, barH = MINIGAME_CONFIG.barH;
  const x = 180 - barW / 2 - 8;
  const y = (420 - barH) / 2 - 6;
  const isLeg = minigame.tier === "legendary";
  const accent = isLeg ? "#ffd86b" : "#5bd17a";

  // 半透明遮罩: 视觉上突出小游戏, 并配合全屏输入捕获层阻断其余按钮
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, 360, 420);

  ctx.fillStyle = "rgba(8,18,30,0.92)";
  ctx.fillRect(x - 14, y - 40, barW + MINIGAME_CONFIG.timerBarW + 28, barH + 60);

  // 顶部标签: 结果未确认前显示❓, 结算后才揭晓
  let label = "❓";
  if (minigame.resolved === "success") label = isLeg ? "✨传说!" : "💖稀有!";
  else if (minigame.resolved === "fail") label = "💔逃脱了";
  ctx.fillStyle = accent;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + barW / 2, y - 23);

  // 剩余尝试次数 ○○○ (实心=剩余, 空心=已用)
  const remainingAttempts = Math.max(0, minigame.attemptsAllowed - minigame.attemptsUsed);
  let dotsStr = "";
  for (let i = 0; i < minigame.attemptsAllowed; i++) dotsStr += i < remainingAttempts ? "●" : "○";
  ctx.fillStyle = "#cfe8f0";
  ctx.font = "11px sans-serif";
  ctx.fillText(dotsStr, x + barW / 2, y - 7);

  // 传说鱼需要多次命中: 显示 🪝 已命中/所需
  if (minigame.hooksNeeded > 1) {
    ctx.fillStyle = accent;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`🪝 ${minigame.hooksDone}/${minigame.hooksNeeded}`, x + barW / 2, y + 9);
  }

  // 主条背景
  ctx.fillStyle = "#0a1622";
  ctx.fillRect(x, y, barW, barH);

  // 绿色钩取区间 (zoneY 以条底为0点, 需换算为canvas从上往下的像素坐标)
  const zoneTopPx = y + (barH - minigame.zoneY - minigame.zoneH);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x, zoneTopPx, barW, minigame.zoneH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, zoneTopPx, barW, minigame.zoneH);

  // 鱼图标 (不规则游动)
  const fishTopPx = y + (barH - minigame.fishY - MINIGAME_CONFIG.pointerH);
  const fishCenter = minigame.fishY + MINIGAME_CONFIG.pointerH / 2;
  const inZone = fishCenter >= minigame.zoneY && fishCenter <= minigame.zoneY + minigame.zoneH;
  const startledActive = minigame.fishStartledUntil > now;
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = startledActive ? "#ff8f6b" : (inZone ? "#ffffff" : "#cfe8f0");
  ctx.fillText(isLeg ? "✨" : "🐟", x + barW / 2, fishTopPx + MINIGAME_CONFIG.pointerH + 4);

  // 外框: 成功闪金光, 失败抖动闪红光
  let frameColor = accent, shakeX = 0;
  if (minigame.resolved === "success") frameColor = "#ffe17a";
  else if (minigame.resolved === "fail") { frameColor = "#ff5c4c"; shakeX = Math.sin(now / 30) * 3; }
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + shakeX, y, barW, barH);

  // 点击瞬间反馈: 命中(绿色光环)/落空(红色光环), 短暂显示后自动消失
  if (minigame.tapFlash && now < minigame.tapFlash.until) {
    const ringAlpha = (minigame.tapFlash.until - now) / MINIGAME_CONFIG.tapFlashDurationMs;
    ctx.globalAlpha = ringAlpha * 0.8;
    ctx.strokeStyle = minigame.tapFlash.type === "hit" ? "#5bd17a" : "#ff5c4c";
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 6, y - 6, barW + 12, barH + 12);
    ctx.globalAlpha = 1;
  }

  // 右侧倒计时条
  const tbX = x + barW + 10;
  ctx.fillStyle = "#0a1622";
  ctx.fillRect(tbX, y, MINIGAME_CONFIG.timerBarW, barH);
  const elapsed = Math.min(minigame.durationMs, now - minigame.startAt);
  const remainRatio = minigame.resolved === null
    ? Math.max(0, 1 - elapsed / minigame.durationMs)
    : (minigame.resolved === "success" ? 1 : 0);
  const tbFillH = barH * remainRatio;
  ctx.fillStyle = remainRatio > 0.3 ? "#5bd17a" : "#ff8f6b";
  ctx.fillRect(tbX, y + (barH - tbFillH), MINIGAME_CONFIG.timerBarW, tbFillH);
  ctx.strokeStyle = "#2a4a64";
  ctx.lineWidth = 1;
  ctx.strokeRect(tbX, y, MINIGAME_CONFIG.timerBarW, barH);

  // 底部操作提示
  if (minigame.resolved === null) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText("鱼进入绿色区间时点击屏幕收杆!", x + barW / 2, y + barH + 16);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}

function finalizeMinigameCatch(success) {
  const tier = minigame ? minigame.tier : fishingBiteTier;

  if (success) {
    if (tier === "legendary") sfx.legendaryCatch(); else sfx.rareCatch();
    const speciesKey = rollFishSpecies(tier);
    const length = rollFishLength(speciesKey);
    registerCatch(speciesKey, false, length);
    const gain = 1 + (Math.random() < 0.25 ? 1 : 0);
    state.res.fish += gain;
    spawnFloatingText(`🐟+${gain}`);
    checkFishAchievements(speciesKey, true);
    showShareButton(speciesKey, length, tier);
  } else {
    sfx.escape();
    // 鱼饵已经在抛竿瞬间扣过了, 小游戏失败不再额外扣一次 —— 只是单纯的"鱼跑了"
    toast(tier === "legendary" ? "传说鱼挣脱鱼钩,跑掉了!" : "稀有鱼挣脱鱼钩,跑掉了!");
    checkFishAchievements(null, false);
  }

  // 精力与鱼饵已经在 doFishing() 抛竿瞬间扣过了, 这里(小游戏结算)不再重复扣
  fishingState = "idle";
  fishingBaitKey = null;
  fishingBiteTier = null;
  minigame = null;
  removeMinigameOverlay();
  updateUI();
  save();
}

// ====== 社交分享卡片: 稀有/传说鱼捕获后展示"分享战绩"按钮, 点击生成可下载的PNG图片 ======
let shareButtonTimer = null;

function showShareButton(speciesKey, length, tier) {
  removeShareButton();
  const def = FISH[speciesKey];
  const btn = document.createElement("button");
  btn.id = "share-catch-btn";
  btn.className = "share-catch-btn";
  btn.textContent = `📤 分享战绩 (${def.icon}${def.name} ${length.toFixed(1)}cm)`;
  btn.onclick = () => {
    generateShareCard(speciesKey, length, tier);
    removeShareButton();
  };
  document.body.appendChild(btn);
  shareButtonTimer = setTimeout(removeShareButton, 6000);
}

function removeShareButton() {
  const el = document.getElementById("share-catch-btn");
  if (el) el.remove();
  if (shareButtonTimer) { clearTimeout(shareButtonTimer); shareButtonTimer = null; }
}

// 根据体长匹配一个日常物品作比例参照, 增强分享卡的"炫耀感"
function lengthComparisonLabel(cm) {
  if (cm < 20) return "一支圆珠笔";
  if (cm < 50) return "一把雨伞";
  if (cm < 90) return "一把吉他";
  if (cm < 140) return "一扇门";
  return "一个成年人";
}

function generateShareCard(speciesKey, length, tier) {
  const def = FISH[speciesKey];
  const isLeg = tier === "legendary";
  const W = 600, H = 800;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");

  // 背景: 海洋渐变
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0a1f33");
  grad.addColorStop(0.55, "#0f3a4a");
  grad.addColorStop(1, "#123f4f");
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  // 装饰性水波纹底纹
  c.strokeStyle = "rgba(255,255,255,0.08)";
  c.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(W / 2, H * 0.42, 90 + i * 40, 0, Math.PI * 2);
    c.stroke();
  }

  // 标题
  c.textAlign = "center";
  c.fillStyle = "#eef6ff";
  c.font = "bold 30px sans-serif";
  c.fillText("星际钓鱼 🎣", W / 2, 70);

  // 中央鱼图标 (像素鱼放大绘制, 否则用大号emoji)
  const pg = FISH_PIXEL_GRIDS[speciesKey];
  if (def.pixel && pg) {
    const scale = 14;
    const gw = pg.grid[0].length * scale, gh = pg.grid.length * scale;
    const ox = W / 2 - gw / 2, oy = H * 0.30 - gh / 2;
    c.imageSmoothingEnabled = false;
    for (let row = 0; row < pg.grid.length; row++) {
      for (let col = 0; col < pg.grid[row].length; col++) {
        const ch = pg.grid[row][col];
        if (ch === ".") continue;
        c.fillStyle = pg.colors[ch];
        c.fillRect(ox + col * scale, oy + row * scale, scale, scale);
      }
    }
  } else {
    c.font = "160px sans-serif";
    c.fillText(def.icon, W / 2, H * 0.36);
  }

  // 鱼名 + 稀有度徽章
  c.font = "bold 26px sans-serif";
  c.fillStyle = "#eef6ff";
  c.fillText(def.name, W / 2, H * 0.46);

  const badgeColor = isLeg ? "#ffd86b" : "#ff8bd1";
  c.fillStyle = badgeColor;
  const badgeText = RARITY_LABEL[tier] || RARITY_LABEL.rare;
  c.font = "bold 16px sans-serif";
  const badgeW = c.measureText(badgeText).width + 28;
  c.beginPath();
  c.roundRect ? c.roundRect(W / 2 - badgeW / 2, H * 0.485, badgeW, 30, 15) : c.rect(W / 2 - badgeW / 2, H * 0.485, badgeW, 30);
  c.fill();
  c.fillStyle = "#1a1a1a";
  c.fillText(badgeText, W / 2, H * 0.485 + 21);

  // 大号体长数字
  c.fillStyle = "#ffd86b";
  c.font = "bold 64px sans-serif";
  c.fillText(`${length.toFixed(1)} cm`, W / 2, H * 0.62);

  // 挑战语
  c.fillStyle = "rgba(238,246,255,0.75)";
  c.font = "16px sans-serif";
  c.fillText(`你见过这么大的${def.name}吗?来挑战我?`, W / 2, H * 0.665);

  // 底部: 长度参照尺子 (简单横条 + 参照物文字)
  const rulerY = H * 0.78;
  const rulerMaxW = W - 120;
  const rulerW = Math.max(40, Math.min(rulerMaxW, (length / 150) * rulerMaxW));
  c.fillStyle = "rgba(255,216,107,0.85)";
  c.fillRect(W / 2 - rulerW / 2, rulerY, rulerW, 14);
  c.strokeStyle = "#eef6ff";
  c.lineWidth = 2;
  c.strokeRect(W / 2 - rulerW / 2, rulerY, rulerW, 14);
  c.fillStyle = "rgba(238,246,255,0.85)";
  c.font = "14px sans-serif";
  c.fillText(`约等于 ${lengthComparisonLabel(length)} 的长度`, W / 2, rulerY + 40);

  // 水印
  c.fillStyle = "rgba(238,246,255,0.5)";
  c.font = "12px sans-serif";
  c.fillText("星际钓鱼 · 试试你的手气", W / 2, H - 24);

  c.textAlign = "left";

  const dataUrl = cv.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `星际钓鱼_${def.name}_${length.toFixed(1)}cm.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("战绩卡片已生成,长按/保存图片即可分享 📤");
}

// ====== 咬钩预警画面: 半透明遮罩 + 居中"❗咬钩了!"大字, 文字随时间做正弦上下跳动 ======
export function drawBiteAlert() {
  const elapsed = Date.now() - biteAlertStartAt;
  const bounceY = Math.sin(elapsed * MINIGAME_CONFIG.biteAlertBounceSpeed) * MINIGAME_CONFIG.biteAlertBounceAmp;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, 360, 420);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd86b";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("❗咬钩了!", 180, 210 + bounceY);
  ctx.textAlign = "left";
}

// ====== 鱼竿升级 ======
export function rodUpgradeCost() {
  const n = state.rodLevel + 1;
  return { rope: 2 + n, iron: 1 + n };
}
