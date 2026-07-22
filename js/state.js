// ====== state.js: 存档状态 + 加载/保存/迁移 + 精力系统 + 通用资源/RNG工具 + 共享UI反馈原语 ======
// 依赖: 只 import config.js (符合"state 只依赖 config"的规则)
//
// 架构说明 (为什么 toast/spawnFloatingText/flashLegendary 放在这里, 而不是更符合直觉的 ui.js):
// 这三个函数几乎被 fishing.js/actions.js/systems.js/ui.js 同时用到。如果放进 ui.js,
// 会导致 fishing.js 必须 import ui.js (拿 toast), 而 ui.js 的钓鱼饵料面板又要读 fishing.js
// 的状态 —— 形成一个不必要的循环依赖。state.js 本来就是"人人都会 import"的基础层,
// 把这几个轻量的、几乎不涉及业务逻辑的 DOM 反馈原语放在这里, 可以让 fishing/actions/systems/ui
// 都单向依赖 state.js, 避免循环。这是本次重构中唯一的、经过权衡后的"越界"放置, 特此注明。
//
// 类似地, zoneSlotConfig/zoneTotalSlots/canExpandZone/zoneCooldownMs/sturdyMitigation 是纯粹的
// "从 state 派生只读值"的函数 (不做任何 DOM 操作, 不触发任何一次性副作用), 被 render.js/actions.js/
// systems.js/ui.js 广泛读取, 同样为了避免循环依赖统一放在这里。

import { CONFIG, SAVE_KEY, COSTUME_SAVE_KEY, ICONS } from "./config.js";

// 当前存档结构版本号。Stage 4 新增: 配合 migrate() 实现"旧存档永远能升级到当前形状, 绝不丢进度"。
export const SAVE_VERSION = 3;

export const state = {
  version: SAVE_VERSION,
  era: "stone", // stone -> iron
  res: { wood: 0, rope: 0, scrap: 0, iron: 0, seaweed: 0, plastic: 0, coconut: 0, bread: 0, spam: 0, fish: 0, water: 0, trash: 0, raftkit: 0, jerky: 0, coconut_meat: 0, coconut_juice: 0 },

  // ---- 角色/宠物选择 ----
  character: null,             // "female" | "male", 首次开局选择
  mirrorUnlocked: false,       // 奇幻镜·千变万化 是否解锁

  // ---- 开场剧情 ----
  introSeen: false,            // 开场剧情是否已经播放过 (仅新存档触发一次, 见 js/intro.js), 永不重复自动播放

  // ---- 商店/货币 ----
  gold: 0,
  shopOwned: [],                // 已购买的商店道具 id 列表

  // ---- 漂流瓶引导系统 ----
  bottlesSeen: [],              // 已领取过的漂流瓶 id 列表
  everVisitedRiver: false,      // 是否曾经切换到河流

  // ---- 木筏面积/扩建 (全局格数, 跨流域持久, 各流域有各自的上限) ----
  raftSlots: CONFIG.INITIAL_RAFT_SLOTS,

  // ---- 精力值系统 (合并了原饥饿/口渴/体力) ----
  energy: 80,
  lastActionAt: Date.now(),
  restAccum: 0,
  zeroEnergyRegenAccum: 0,  // 精力耗尽后的被动恢复计时器, 不受"是否操作"影响

  builds: {
    net: false,           // 绳网：提升手动打捞产出
    furnace: false,       // 熔炉：解锁熔炼铁钉
    autocollector: false, // 自动收集网：解锁挂机产出 + 跃升铁器时代
    rod: false,           // 简易鱼竿：解锁钓鱼
    hammer: false,        // 锤子：解锁敲椰子
    purifier: false,      // 净水过滤器：解锁被动产水
  },
  rodLevel: 0, // 鱼竿升级等级 0~6: 每级 普通鱼命中率+5% (50%->80%, 上限设计意图为让后期普通鱼接近"白拿", 作为货币/宠物粮资源) 且 稀有/传说钓鱼小游戏钩取区间+4px (不影响稀有/传说触发概率, 那由饵料/技能/词条决定)
  purifierAccum: 0, // 净水器累积计时器
  autocollectorAccum: 0, // 自动收集网打捞计时器
  lastTick: Date.now(),

  // ---- 流域/图鉴/事件 ----
  zone: "stream",              // stream | river
  bestiary: {},                // { fishKey: { caught, count, firstZone } }
  currentBuff: null,           // 进入河流时选择的词条 key
  shieldAvailable: false,      // 风浪免疫词条剩余次数(0或1)
  castStreak: 0,               // 精准直觉连续钓鱼计数
  fishCooldownUntil: 0,        // 钓鱼冷却结束时间戳
  zoneCooldownUntil: 0,        // 流域切换冷却结束时间戳
  nextEventAt: Date.now() + 90000 + Math.random() * 60000,
  stormForceReturnAt: 0,       // 河流暴风雨"赌一把"窗口到期被强制送回溪流
  tempEffMod: 0, tempEffModExpire: 0,   // 临时效率加成/减益 (事件)
  tempHitMod: 0, tempHitModExpire: 0,   // 临时命中率加成 (事件)

  // ---- 图纸 / 木筏部件 / 三模块数值 ----
  blueprints: {},              // { bpKey: true }
  raftParts: {},               // { partKey: true }
  raftStats: { speed: 0, sturdy: 0, beauty: 0 },
  beautyGiftAccum: 0,

  // ---- 技能树 ----
  skillPoints: { build: 0, fish: 0 },
  skills: {
    build: { handy: false, thrifty: false, veteran: false, pipeline: false, automation_master: false },
    fish: { instinct: false, bait_research: false, rare_sense: false, deepwater: false, legend_hunter: false },
  },

  // ---- 成就系统 ----
  achievements: {},   // { id: { unlocked: true, unlockedAt } }
  stats: {
    totalCasts: 0, totalCatches: 0,
    consecutiveHits: 0, consecutiveMisses: 0, last3Results: [],
    buildFailCount: 0, trashCollected: 0,
    forceExitCount: { stream: 0, river: 0 },
    cooldownClicks: 0,
    zoneEnterAt: Date.now(),
    achievementCheckAccum: 0,
  },

  // ---- 宠物系统 ----
  pet: null, // { type, satiety, lastFeedDate, feedStreakDays }
  petDecayAccum: 0,
  petGiftAccum: 0,

  // ---- 设置 (音效等, 不属于游戏进度但一并存档持久化) ----
  settings: { muted: false },
};

// 供 load()/migrate() 内部复用的"资源默认形状", 也用于给全新存档发放初始礼包
function defaultRes() {
  return { wood: 0, rope: 0, scrap: 0, iron: 0, seaweed: 0, plastic: 0, coconut: 0, bread: 0, spam: 0, fish: 0, water: 0, trash: 0, raftkit: 0, jerky: 0, coconut_meat: 0, coconut_juice: 0 };
}

// PET_TYPES 的合法宠物种类集合, 由 state.js 之外的模块在需要迁移校验时传入, 避免 state.js 反向依赖 data.js。
// (state.js 按规则不 import data.js; 旧宠物种类迁移逻辑因此被设计成"传入合法种类表"的纯函数形式)
function migratePetType(petType, validTypes) {
  if (validTypes[petType]) return petType;
  return { turtle: "dog", parrot: "bird" }[petType] || "cat";
}

// ====== 存档迁移: 把任意旧版本存档形状升级为当前 state 形状, 绝不丢失玩家进度 ======
// data: JSON.parse 后的原始存档对象 (来自 localStorage, 任意旧版本)
// validPetTypes: 合法宠物种类表 (由调用方传入, 见 migratePetType 说明)
export function migrate(data, validPetTypes) {
  // 旧存档兼容: 饥饿/口渴/体力 -> 精力值迁移
  if (data.energy === undefined && (data.hunger !== undefined || data.thirst !== undefined || data.stamina !== undefined)) {
    const h = data.hunger !== undefined ? data.hunger : 80;
    const t = data.thirst !== undefined ? data.thirst : 80;
    const s = data.stamina !== undefined ? data.stamina : 80;
    data.energy = Math.max(0, Math.min(100, Math.round((h + t + s) / 3)));
  }
  delete data.hunger; delete data.thirst; delete data.stamina;

  Object.assign(state, data);
  state.res = Object.assign(defaultRes(), data.res);

  // 旧存档兼容: zoneExpansions → raftSlots (全局持久格数, 木筏格数的唯一数据源)
  // 迁移原则: 取玩家曾经合法达到过的最大格数, 绝不缩水; 迁移完成后删除旧的分流域字段, 避免死数据残留
  if (data.raftSlots === undefined && data.zoneExpansions) {
    const ze = data.zoneExpansions;
    const streamSlots = 4 + (ze.stream || 0) * 1;
    const riverSlots = 9 + (ze.river || 0) * 4;
    state.raftSlots = Math.max(streamSlots, riverSlots, CONFIG.INITIAL_RAFT_SLOTS);
  } else {
    state.raftSlots = data.raftSlots !== undefined ? data.raftSlots : CONFIG.INITIAL_RAFT_SLOTS;
  }
  delete state.zoneExpansions;
  state.builds = Object.assign({ net: false, furnace: false, autocollector: false, rod: false, hammer: false, purifier: false }, data.builds);
  state.bestiary = data.bestiary || {};
  state.blueprints = data.blueprints || {};
  state.raftParts = data.raftParts || {};
  state.raftStats = Object.assign({ speed: 0, sturdy: 0, beauty: 0 }, data.raftStats);
  state.skillPoints = Object.assign({ build: 0, fish: 0 }, data.skillPoints);
  state.skills = {
    build: Object.assign({ handy: false, thrifty: false, veteran: false, pipeline: false, automation_master: false }, data.skills && data.skills.build),
    fish: Object.assign({ instinct: false, bait_research: false, rare_sense: false, deepwater: false, legend_hunter: false }, data.skills && data.skills.fish),
  };
  if (!data.zone) state.zone = "stream";
  if (data.nextEventAt === undefined) state.nextEventAt = Date.now() + 90000;
  if (data.energy === undefined) state.energy = 80;
  state.lastActionAt = Date.now();

  state.achievements = data.achievements || {};
  state.stats = Object.assign({
    totalCasts: 0, totalCatches: 0,
    consecutiveHits: 0, consecutiveMisses: 0, last3Results: [],
    buildFailCount: 0, trashCollected: 0,
    forceExitCount: { stream: 0, river: 0 },
    cooldownClicks: 0, zoneEnterAt: Date.now(), achievementCheckAccum: 0,
  }, data.stats);
  state.stats.forceExitCount = Object.assign({ stream: 0, river: 0 }, data.stats && data.stats.forceExitCount);
  state.pet = data.pet || null;
  // 旧存档兼容: 海龟/鹦鹉 宠物种类已被猫/狗/鸟取代
  if (state.pet && validPetTypes && !validPetTypes[state.pet.type]) {
    state.pet.type = migratePetType(state.pet.type, validPetTypes);
  }

  state.character = data.character || null;
  state.mirrorUnlocked = !!data.mirrorUnlocked;
  // 老存档没有这个字段: 视为"已经看过", 避免老玩家读档时突然被拉去重播开场剧情。
  // 真正的"从未见过开场"只发生在 load() 里 !raw 的全新存档分支(那里保留字面量默认值 false)。
  state.introSeen = data.introSeen !== undefined ? !!data.introSeen : true;
  state.gold = data.gold || 0;
  state.shopOwned = data.shopOwned || [];
  state.bottlesSeen = data.bottlesSeen || [];
  state.everVisitedRiver = !!data.everVisitedRiver;

  state.settings = Object.assign({ muted: false }, data.settings);

  state.version = SAVE_VERSION;
}

// ====== 加载存档 ======
// validPetTypes: 合法宠物种类表 (来自 data.js 的 PET_TYPES), 由 main.js 在启动时传入
export function load(validPetTypes) {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.warn("localStorage 不可用, 存档无法读取", e);
    return;
  }

  if (!raw) {
    // 全新存档: 发放初始礼包
    addRes({ wood: 10, rope: 10, iron: 2, bread: 2, spam: 2 });
    return;
  }

  try {
    const data = JSON.parse(raw);
    migrate(data, validPetTypes);
  } catch (e) {
    // 存档损坏(JSON解析失败): 备份原始字符串, 不静默丢弃玩家数据, 然后以全新存档继续
    console.warn("存档解析失败, 已备份原始数据并重新开始", e);
    try { localStorage.setItem(SAVE_KEY + "_backup", raw); } catch (e2) { /* 备份失败也不阻塞游戏继续 */ }
    addRes({ wood: 10, rope: 10, iron: 2, bread: 2, spam: 2 });
    toast("检测到存档损坏,已为你保留备份并重新开始。如需找回请联系开发者。");
  }
}

// ====== 保存 (节流: 最多每2秒写入一次 localStorage, 用脏标记 + 定时器实现) ======
// 行为等价性说明: save() 内部只做 localStorage.setItem, 没有任何游戏逻辑副作用,
// 节流只影响"写盘频率"这一纯I/O层面, 不改变任何可观察的游戏行为; 通过 visibilitychange/
// beforeunload 兜底强制落盘, 保证玩家切走/关闭页面时不会丢失最近2秒内的操作。
let saveDirty = false;
let saveFlushTimer = null;
const SAVE_THROTTLE_MS = 2000;

function flushSave() {
  if (!saveDirty) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    saveDirty = false;
  } catch (e) {
    console.warn("存档写入失败", e);
  }
  if (saveFlushTimer) { clearTimeout(saveFlushTimer); saveFlushTimer = null; }
}

export function save() {
  saveDirty = true;
  if (!saveFlushTimer) {
    saveFlushTimer = setTimeout(flushSave, SAVE_THROTTLE_MS);
  }
}

// 立即强制落盘 (跳过节流), 供存档导出等需要拿到"当前最新状态"的场景使用。
export function saveNow() {
  saveDirty = true;
  flushSave();
}

// 页面切走/关闭前强制把未落盘的最新状态写入, 避免节流窗口内丢数据
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushSave);
}

// ====== 存档导出/导入 (文本形式, 供玩家手动备份/跨设备转移) ======
// 格式: "RAFTSAVE.v{存档版本号}." + Base64(JSON字符串), 前缀用于识别/校验格式。
const SAVE_EXPORT_PREFIX = "RAFTSAVE.v";

export function exportSaveString() {
  saveNow(); // 确保导出的是最新状态(跳过节流窗口)
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${SAVE_EXPORT_PREFIX}${state.version}.${b64}`;
}

// 导入存档字符串。校验通过则直接覆盖当前 state 并落盘, 调用方负责在此之后 reload 页面。
// 返回 true = 导入成功, false = 格式不正确/解析失败(不改变任何数据)。
// validPetTypes: 合法宠物种类表(见 migrate() 说明), 由调用方从 data.js 传入。
export function importSaveString(str, validPetTypes) {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  const m = trimmed.match(/^RAFTSAVE\.v(\d+)\.([\s\S]+)$/);
  if (!m) return false;

  let data;
  try {
    const json = decodeURIComponent(escape(atob(m[2])));
    data = JSON.parse(json);
  } catch (e) {
    return false;
  }
  if (!data || typeof data !== "object" || (data.version === undefined && data.res === undefined)) {
    return false;
  }

  // 导入将覆盖当前进度: 先备份当前存档, 再应用
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) localStorage.setItem(SAVE_KEY + "_pre_import", raw);
  } catch (e) { /* 备份失败不阻塞导入 */ }

  try {
    migrate(data, validPetTypes); // 复用现有迁移逻辑, 把任意版本的导入数据升级为当前形状
  } catch (e) {
    console.warn("导入存档迁移失败", e);
    return false;
  }

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("导入存档写入失败", e);
    return false;
  }
  return true;
}

// ====== 精力值系统 ======
// 精力耗尽不会致死,只会让所有主动行为效率减半 ("疲惫状态")
export function markActivity() {
  state.lastActionAt = Date.now();
  state.restAccum = 0;
}
export function spendEnergy(n) {
  const wasAboveZero = state.energy > 0;
  state.energy = Math.max(0, state.energy - n);
  if (wasAboveZero && state.energy <= 0) toast("休息一下等精力回复吧~");
  markActivity();
}
export function restoreEnergy(n) {
  state.energy = Math.min(100, state.energy + n);
  markActivity();
}
export function efficiency() {
  return state.energy <= 0 ? 0.5 : 1.0;
}

// ====== 角色换装系统: costumeState 的加载/保存 (与主存档 SAVE_KEY 分开存储) ======
export let costumeState = { gender: "female", hairColor: "pink", eyeColor: "green", outfitColor: "pink", accessory: "none" };
export function loadCostume() {
  try {
    const raw = localStorage.getItem(COSTUME_SAVE_KEY);
    if (raw) Object.assign(costumeState, JSON.parse(raw));
  } catch (e) { console.warn("costume load failed", e); }
}
export function saveCostume() {
  localStorage.setItem(COSTUME_SAVE_KEY, JSON.stringify(costumeState));
}

// ====== 提示条 (toast) ======
export function toast(msg) {
  const layer = document.getElementById("toast-layer");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

// ====== 传说鱼全屏闪光特效 ======
export function flashLegendary() {
  const el = document.getElementById("legendary-flash");
  el.classList.remove("flash");
  void el.offsetWidth; // 重新触发动画
  el.classList.add("flash");
}

// ====== 浮动文字特效 (canvas 内的 "+N" 飘字) ======
export const floatTexts = [];
export function spawnFloatingText(text) {
  floatTexts.push({ text, x: 180 + (Math.random() * 40 - 20), y: 180, life: 1.0 });
}

// ====== 通用 RNG / 资源工具 ======
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 按权重随机抽取一项 (entries: [{weight, res}])
export function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    if (r < e.weight) return e.res;
    r -= e.weight;
  }
  return entries[entries.length - 1].res;
}

export function addRes(obj) {
  for (const k in obj) state.res[k] = (state.res[k] || 0) + obj[k];
}

export function resLine(obj) {
  return Object.entries(obj).map(([k, v]) => `${ICONS[k] || ""}+${v}`).join(" ");
}

// ====== 图纸持有/发放 (放在 state.js 而非 actions.js: 成就系统 systems.js 的奖励回调也要发图纸,
// 若放进 actions.js 会形成 actions.js ⇄ systems.js 循环, 这几个函数本质只是操作 state.blueprints
// + toast, 和 canAfford/payCost 是同一类"资源相关的通用小工具", 放这里更合适) ======
export function ownsBlueprint(key) { return !!state.blueprints[key]; }
export function grantBlueprint(key, BLUEPRINTS) {
  if (!BLUEPRINTS[key] || state.blueprints[key]) return false;
  state.blueprints[key] = true;
  toast(`📐 获得图纸: ${BLUEPRINTS[key].icon}${BLUEPRINTS[key].name}!`);
  return true;
}
export function grantRandomBlueprint(BLUEPRINTS) {
  const unowned = Object.keys(BLUEPRINTS).filter(k => !state.blueprints[k]);
  if (!unowned.length) return false;
  return grantBlueprint(pick(unowned), BLUEPRINTS);
}

export function canAfford(cost) {
  return Object.entries(cost).every(([k, v]) => (state.res[k] || 0) >= v);
}
export function payCost(cost) {
  Object.entries(cost).forEach(([k, v]) => { state.res[k] -= v; });
  if (state.skills.build.thrifty) {
    // 节约: 建造材料返还10%
    Object.entries(cost).forEach(([k, v]) => { state.res[k] += Math.round(v * 0.1); });
  }
}

// ====== 木筏面积/扩建 (派生只读值) ======
// state.raftSlots 是木筏格数的唯一数据源(Single Source of Truth), 只能被 doExpandRaft() 显式修改。
// 各流域的 ZONE_SLOTS.max 仅用作"在该流域内是否还能继续扩建"的门槛, 绝不能用来对已达成的格数做上限/下限裁剪——
// 否则会出现"切换流域时木筏显示的格数忽大忽小"的历史bug (根因即此前 zoneTotalSlots 用 cfg.base 做了展示层下限)。
export function zoneSlotConfig(zone) { return CONFIG.ZONE_SLOTS[zone] || CONFIG.ZONE_SLOTS.stream; }
export function zoneTotalSlots() {
  return state.raftSlots;
}
export function canExpandZone(zone) {
  const cfg = zoneSlotConfig(zone);
  return state.raftSlots < cfg.max;
}
export function zoneCooldownMs() {
  const reduction = Math.min(90, state.raftStats.speed * 5);
  return (180 - reduction) * 1000;
}
export function sturdyMitigation() {
  return Math.min(0.5, state.raftStats.sturdy * 0.03);
}

// ====== Canvas / 2D 上下文 ======
// 放在 state.js (而不是更直觉的 render.js) 的原因: render.js 的 drawScene 需要编排调用
// fishing.js 的 drawMinigame/drawBiteAlert 和 systems.js 的 drawDriftBottle, 而这两个模块
// 自己的绘制函数又都需要拿到 ctx —— 如果 ctx 定义在 render.js, 就会形成
// render.js ⇄ fishing.js / render.js ⇄ systems.js 的循环依赖。把 ctx/canvas 提升到大家
//都能单向依赖的 state.js, 三个模块都只需要"读" state.js, 编排关系保持单向 (render.js
// 依赖 fishing.js/systems.js, 反过来则不需要)。
export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ====== 建筑渲染顺序 / 是否已建成 (派生只读值, 被 render.js 的 drawRaft 和 systems.js 的
// checkBuildAchievements 同时用到, 放在这里同样是为了避免 render.js ⇄ systems.js 循环) ======
export const BUILDING_RENDER_ORDER = ["furnace", "purifier", "autocollector", "furnace_v2", "water_tank", "sunshade", "watchtower", "flag", "flowerpot"];
export function isBuiltKey(key) {
  if (key === "furnace" || key === "purifier" || key === "autocollector") return !!state.builds[key];
  return !!state.raftParts[key];
}
