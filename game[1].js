// ====== 木筏漂流记 - 简易版 ======
const SAVE_KEY = "raft_save_v2";

const ICONS = {
  wood: "🪵", rope: "🧵", scrap: "🔧", iron: "🔩",
  seaweed: "🌿", plastic: "♻️", coconut: "🥥",
  bread: "🍞", spam: "🥫", fish: "🐟", water: "💧", trash: "🗑️", raftkit: "🧰",
  jerky: "🍢",
};

// ====== 可调数值配置 (集中管理, 方便后续平衡性调整) ======
const CONFIG = {
  RUMMAGE_CHANCE: { stream: 0.60, river: 0.60 },     // 翻垃圾成功概率
  BLUEPRINT_DROP_CHANCE: 0.13,                        // 翻垃圾掉落图纸概率
  RAFT_PART_COST_MULTIPLIER: 2,                       // 图纸建筑材料成本倍数
  EXPAND_COST: { wood: 15, rope: 5 },                  // 每次扩建木筏消耗
  ROPE_CRAFT: { cost: { wood: 5 }, yield: { rope: 2 } },        // 合成绳子
  REPAIR_KIT_CRAFT: { cost: { wood: 8 }, yield: { raftkit: 1 } }, // 合成木筏修复包
  JERKY_CRAFT: { cost: { fish: 3 }, yield: { jerky: 1 } },        // 晒鱼干
  SMELT_CRAFT: { cost: { scrap: 3 }, yield: { iron: 1 } },        // 熔炼铁块
  PET_FEED_RESTORE: 40,             // 每次喂食恢复饱食度
  PET_DECAY_INTERVAL: 600,          // 宠物饱食度每10分钟(秒)衰减一次
  PET_DECAY_AMOUNT: 10,
  PET_GIFT_CHANCE_PER_MIN: 0.05,    // 饱食度满时, 每分钟5%概率叼来礼物
  ZONE_SLOTS: {
    stream: { base: 4, max: 9, step: 1, maxExpansions: 5 },   // 2x2 -> 3x3, 最多扩建5次
    river: { base: 9, max: 25, step: 4, maxExpansions: 4 },    // 3x3 -> 5x5, 最多扩建4次
  },
  ENERGY_REGEN_INTERVAL: 30,        // 精力耗尽后, 每隔多少秒被动恢复一次
  ENERGY_REGEN_AMOUNT: 5,           // 每次被动恢复的精力值
};

// ====== UI 临时状态 (不写入存档 state, 单独持久化或纯内存) ======
let selectedBait = "seaweed";       // 当前选中的鱼饵 (下拉选择, 默认水草)
let baitDropdownOpen = false;       // 鱼饵下拉是否展开
let refillDropdownOpen = false;     // 补充精力下拉是否展开
let collapsedBuiltOpen = false;     // 建造面板"已建造"折叠区是否展开

// ====== 工坊系统 ======
let workshopTab = "build";          // "build" | "craft"
let workshopFeedback = {};          // { key: { ok: bool, until: timestamp } } 操作结果反馈(1.5秒)

function setWorkshopFeedback(key, ok) {
  workshopFeedback[key] = { ok, until: Date.now() + 1500 };
  renderWorkshopModal();
  setTimeout(() => {
    if (workshopFeedback[key] && Date.now() >= workshopFeedback[key].until) {
      delete workshopFeedback[key];
      renderWorkshopModal();
    }
  }, 1600);
}

// ====== 钓鱼动画状态机 ======
// idle -> casting(抛线0.5s) -> waiting(等待咬钩1.5~3s) -> biting(咬钩窗口0.8s) -> pulling(拉线0.5s) -> idle
let fishingState = "idle";
let fishingPhaseUntil = 0;
let fishingPhaseDur = 0;            // 当前阶段总时长(ms), 用于进度条计算
let fishingBaitKey = null;
let fishingBaitBonus = 0;
let fishingTimer = null;
let fishRipples = [];               // canvas水面波纹特效 [{x,y,life}]
let fishRippleAccum = 0;

// ====== 角色换装系统 (奇幻镜) ======
const COSTUME_SAVE_KEY = "costume_state";
let costumeState = { gender: "female", hairColor: "pink", eyeColor: "green", outfitColor: "pink", accessory: "none" };
function loadCostume() {
  try {
    const raw = localStorage.getItem(COSTUME_SAVE_KEY);
    if (raw) Object.assign(costumeState, JSON.parse(raw));
  } catch (e) { console.warn("costume load failed", e); }
}
function saveCostume() {
  localStorage.setItem(COSTUME_SAVE_KEY, JSON.stringify(costumeState));
}

// 颜色 key 含义 (男女通用同一套): B/C=头发主/暗部, F/H=衣服主色/腮红, G/I=眼睛暗/亮部
const COSTUME_OPTIONS = {
  hairColor: {
    pink: { icon: "🌸", label: "粉棕", B: "#b89a8d", C: "#a67b68" },
    black: { icon: "🌙", label: "黑色", B: "#3a3a3a", C: "#2a2a2a" },
    gold: { icon: "☀️", label: "金色", B: "#d4a653", C: "#b8843a" },
    red: { icon: "🍎", label: "红色", B: "#c0504d", C: "#8b2e2c" },
    blue: { icon: "❄️", label: "蓝色", B: "#5b9bd5", C: "#2a5a9a" },
  },
  eyeColor: {
    green: { icon: "🍀", label: "绿色", G: "#929e42", I: "#b3bf65" },
    purple: { icon: "🟣", label: "紫色", G: "#7b5ea7", I: "#9b7ec7" },
    red: { icon: "❤️", label: "红色", G: "#c0504d", I: "#d4706d" },
    black: { icon: "⚫", label: "黑色", G: "#3a3a3a", I: "#5a5a5a" },
    blue: { icon: "🔵", label: "蓝色", G: "#2a5a9a", I: "#5b9bd5" },
  },
  outfitColor: {
    pink: { icon: "🎀", label: "粉色", F: "#ffd9de", H: "#ffb0ba" },
    default: { icon: "🎀", label: "粉色", F: "#ffd9de", H: "#ffb0ba" },
  },
};
// 商店购买后追加的发色选项 (奇幻镜里动态合并进 COSTUME_OPTIONS.hairColor)
const SHOP_HAIR_EXTRA = {
  rainbow: { icon: "🌈", label: "彩虹" },
};

// 角色固定 (不可换) 颜色: A轮廓 D肤色 E高光 J下身 K腰带 L鞋子
const CHAR_FIXED_COLORS = { A: "#000000", D: "#faefed", E: "#ffffff", J: "#a5b8cf", K: "#ddbe86", L: "#38577c" };

// 配件定义: none + 基础3款(商店50金币) + 特殊2款(商店100金币, 王冠/蝴蝶结)
const ACCESSORY_DEFS = {
  none: { icon: "🚫", label: "无" },
  hat: { icon: "🎩", label: "小帽子" },
  flower: { icon: "🌸", label: "发花" },
  star: { icon: "⭐", label: "星星" },
  crown: { icon: "👑", label: "皇冠" },
  bow: { icon: "🎀", label: "蝴蝶结" },
};

// ====== 商店系统 ======
const SHOP_ITEMS = [
  { id: "hat", name: "小帽子", icon: "🎩", price: 50, type: "accessory", key: "hat" },
  { id: "flower", name: "发花", icon: "🌸", price: 50, type: "accessory", key: "flower" },
  { id: "star", name: "头顶星星", icon: "⭐", price: 50, type: "accessory", key: "star" },
  { id: "flag", name: "木筏彩旗", icon: "🎌", price: 50, type: "raftDecor" },
  { id: "crown", name: "皇冠", icon: "👑", price: 100, type: "accessory", key: "crown" },
  { id: "rainbow_hair", name: "彩虹发色", icon: "🌈", price: 100, type: "hairColor", key: "rainbow" },
  { id: "bow", name: "蝴蝶结", icon: "🎀", price: 100, type: "accessory", key: "bow" },
];
const FISH_SELL_PRICE = 5; // 鱼出售单价 (金币/条)

const state = {
  era: "stone", // stone -> iron
  res: { wood: 0, rope: 0, scrap: 0, iron: 0, seaweed: 0, plastic: 0, coconut: 0, bread: 0, spam: 0, fish: 0, water: 0, trash: 0, raftkit: 0, jerky: 0 },

  // ---- 角色/宠物选择 ----
  character: null,             // "female" | "male", 首次开局选择
  mirrorUnlocked: false,       // 奇幻镜·千变万化 是否解锁

  // ---- 商店/货币 ----
  gold: 0,
  shopOwned: [],                // 已购买的商店道具 id 列表

  // ---- 漂流瓶引导系统 ----
  bottlesSeen: [],              // 已领取过的漂流瓶 id 列表
  everVisitedRiver: false,      // 是否曾经切换到河流

  // ---- 木筏面积/扩建 ----
  zoneExpansions: { stream: 0, river: 0 },

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
  rodLevel: 0, // 鱼竿升级等级 0~6, 每级+5%命中率 (50% -> 80%)
  purifierAccum: 0, // 净水器累积计时器
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
};

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);

      // 旧存档兼容: 饥饿/口渴/体力 -> 精力值迁移
      if (data.energy === undefined && (data.hunger !== undefined || data.thirst !== undefined || data.stamina !== undefined)) {
        const h = data.hunger !== undefined ? data.hunger : 80;
        const t = data.thirst !== undefined ? data.thirst : 80;
        const s = data.stamina !== undefined ? data.stamina : 80;
        data.energy = Math.max(0, Math.min(100, Math.round((h + t + s) / 3)));
      }
      delete data.hunger; delete data.thirst; delete data.stamina;

      Object.assign(state, data);
      state.res = Object.assign({ wood: 0, rope: 0, scrap: 0, iron: 0, seaweed: 0, plastic: 0, coconut: 0, bread: 0, spam: 0, fish: 0, water: 0, trash: 0, raftkit: 0, jerky: 0 }, data.res);
      state.zoneExpansions = Object.assign({ stream: 0, river: 0 }, data.zoneExpansions);
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
      if (state.pet && !PET_TYPES[state.pet.type]) {
        state.pet.type = { turtle: "dog", parrot: "bird" }[state.pet.type] || "cat";
      }

      state.character = data.character || null;
      state.mirrorUnlocked = !!data.mirrorUnlocked;
      state.gold = data.gold || 0;
      state.shopOwned = data.shopOwned || [];
      state.bottlesSeen = data.bottlesSeen || [];
      state.everVisitedRiver = !!data.everVisitedRiver;
    }
  } catch (e) { console.warn("load failed", e); }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

// ====== 精力值系统 ======
// 精力耗尽不会致死,只会让所有主动行为效率减半 ("疲惫状态")
function markActivity() {
  state.lastActionAt = Date.now();
  state.restAccum = 0;
}
function spendEnergy(n) {
  state.energy = Math.max(0, state.energy - n);
  markActivity();
}
function restoreEnergy(n) {
  state.energy = Math.min(100, state.energy + n);
  markActivity();
}
function efficiency() {
  return state.energy <= 0 ? 0.5 : 1.0;
}

// ====== 提示条 ======
function toast(msg) {
  const layer = document.getElementById("toast-layer");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

// ====== 打捞表 (基础资源, 拉钩打捞每次从中抽一种) ======
const LOOT_TABLE_STONE = [
  { wood: 1 }, { wood: 2 }, { rope: 1 }, { scrap: 1 },
  { wood: 1, rope: 1 }, { seaweed: 1 }, { seaweed: 2 }, { plastic: 1 },
  { trash: 1 }, { trash: 2 },
];
const LOOT_TABLE_IRON = [
  { wood: 2 }, { wood: 3 }, { rope: 2 }, { scrap: 2 }, { iron: 1 },
  { seaweed: 2 }, { plastic: 2 }, { trash: 1 }, { trash: 2 },
];

// 翻垃圾专用掉落表: 废铁/铁块权重明显高于普通打捞
const RUMMAGE_TABLE_STONE = [
  { scrap: 2 }, { scrap: 1 }, { scrap: 1 }, { scrap: 2 },
  { wood: 1 }, { rope: 1 }, { scrap: 1, wood: 1 },
];
const RUMMAGE_TABLE_IRON = [
  { scrap: 2 }, { iron: 1 }, { scrap: 1 }, { iron: 1 },
  { scrap: 2 }, { wood: 2 }, { rope: 1 },
];

const CHEST_CHANCE = 0.12;
const ANACHRONISM_CHANCE = 0.06;
const FOOD_DROP_CHANCE = 0.07;   // 拉钩打捞捞到面包/午餐肉概率 (原0.10, 降低30%)
const COCONUT_DROP_CHANCE = 0.10; // 捞到椰子概率 (原0.20, 降低50%, 变稀有)

const CHEST_LOOT = [
  { label: "一卷结实的麻绳", res: { rope: 3 } },
  { label: "半截浸水的木料", res: { wood: 4 } },
  { label: "一把锈蚀的废铁片", res: { scrap: 3 } },
  { label: "意外完好的铁块", res: { iron: 1 } },
];

const ANACHRONISMS = [
  { label: "🥫 一罐真空包装的午餐肉（不知为何漂到这里）", res: { spam: 1, wood: 2 } },
  { label: "🔋 一节锈迹斑斑但仍有电的电池", res: { scrap: 4, iron: 1 } },
  { label: "🧮 一个掉了漆的太阳能计算器", res: { iron: 2 } },
];

// ====== 图纸 / 木筏部件 ======
const BLUEPRINTS = {
  bp_autocollector_v2: { name: "自动收集网升级版", icon: "🔧", category: "basic" },
  bp_furnace_v2: { name: "强化熔炉", icon: "🔧", category: "basic" },
  bp_water_tank: { name: "储水大桶", icon: "🔧", category: "basic" },
  bp_raft_extension: { name: "木筏扩展板", icon: "🪵", category: "structural" },
  bp_watchtower: { name: "瞭望台", icon: "🪵", category: "structural" },
  bp_sunshade: { name: "遮阳篷", icon: "🪵", category: "structural" },
  bp_flag: { name: "彩色旗帜", icon: "✨", category: "decorative" },
  bp_flowerpot: { name: "花盆角落", icon: "✨", category: "decorative" },
};
const BP_CATEGORY_LABEL = { basic: "基础", structural: "结构", decorative: "装饰" };

const RAFT_PARTS = [
  { key: "autocollector_v2", bp: "bp_autocollector_v2", name: "自动收集网升级版", cost: { iron: 6, rope: 4 }, stats: { speed: 2, sturdy: 0, beauty: 0 } },
  { key: "furnace_v2", bp: "bp_furnace_v2", name: "强化熔炉", cost: { iron: 4, scrap: 6 }, stats: { speed: 0, sturdy: 2, beauty: 0 } },
  { key: "water_tank", bp: "bp_water_tank", name: "储水大桶", cost: { plastic: 6, wood: 6 }, stats: { speed: 1, sturdy: 1, beauty: 0 } },
  { key: "raft_extension", bp: "bp_raft_extension", name: "木筏扩展板", cost: { wood: 14, rope: 6 }, stats: { speed: 0, sturdy: 3, beauty: 0 } },
  { key: "watchtower", bp: "bp_watchtower", name: "瞭望台", cost: { wood: 10, iron: 2 }, stats: { speed: 2, sturdy: 0, beauty: 0 } },
  { key: "sunshade", bp: "bp_sunshade", name: "遮阳篷", cost: { wood: 8, rope: 3 }, stats: { speed: 0, sturdy: 1, beauty: 1 } },
  { key: "flag", bp: "bp_flag", name: "彩色旗帜", cost: { rope: 5, plastic: 3 }, stats: { speed: 0, sturdy: 0, beauty: 3 } },
  { key: "flowerpot", bp: "bp_flowerpot", name: "花盆角落", cost: { wood: 4, seaweed: 4 }, stats: { speed: 0, sturdy: 0, beauty: 3 } },
];
// 图纸建筑材料成本统一翻倍 (调整 CONFIG.RAFT_PART_COST_MULTIPLIER 即可整体平衡)
RAFT_PARTS.forEach(p => {
  for (const k in p.cost) p.cost[k] *= CONFIG.RAFT_PART_COST_MULTIPLIER;
});

function ownsBlueprint(key) { return !!state.blueprints[key]; }
function grantBlueprint(key) {
  if (!BLUEPRINTS[key] || state.blueprints[key]) return false;
  state.blueprints[key] = true;
  toast(`📐 获得图纸: ${BLUEPRINTS[key].icon}${BLUEPRINTS[key].name}!`);
  return true;
}
function grantRandomBlueprint() {
  const unowned = Object.keys(BLUEPRINTS).filter(k => !state.blueprints[k]);
  if (!unowned.length) return false;
  return grantBlueprint(pick(unowned));
}

function tryBuildPart(key) {
  const part = RAFT_PARTS.find(p => p.key === key);
  if (!part || state.raftParts[key]) return;
  if (!ownsBlueprint(part.bp)) { toast("没有对应的图纸,无法建造"); return; }
  if (state.energy <= 0) { toast("精力不足,歇一会再建造吧"); setWorkshopFeedback("part_" + key, false); return; }
  if (!canAfford(part.cost)) {
    toast("材料不够");
    state.stats.buildFailCount += 1;
    checkBuildAchievements();
    setWorkshopFeedback("part_" + key, false);
    return;
  }
  payCost(part.cost);
  state.raftParts[key] = true;
  state.raftStats.speed += part.stats.speed;
  state.raftStats.sturdy += part.stats.sturdy;
  state.raftStats.beauty += part.stats.beauty;
  spendEnergy(4);
  toast(`🔨 建成了 ${part.name}!`);
  checkBuildAchievements();
  setWorkshopFeedback("part_" + key, true);
  updateUI();
  save();
}

function zoneCooldownMs() {
  const reduction = Math.min(90, state.raftStats.speed * 5);
  return (180 - reduction) * 1000;
}
function sturdyMitigation() {
  return Math.min(0.5, state.raftStats.sturdy * 0.03);
}

// ====== 木筏面积/扩建 ======
function zoneSlotConfig(zone) { return CONFIG.ZONE_SLOTS[zone] || CONFIG.ZONE_SLOTS.stream; }
function zoneTotalSlots(zone) {
  const cfg = zoneSlotConfig(zone);
  return Math.min(cfg.max, cfg.base + state.zoneExpansions[zone] * cfg.step);
}
function canExpandZone(zone) {
  const cfg = zoneSlotConfig(zone);
  return state.zoneExpansions[zone] < cfg.maxExpansions;
}

function doExpandRaft() {
  const zone = state.zone;
  if (!canExpandZone(zone)) { toast("木筏面积已达上限"); return; }
  if (state.energy <= 0) { toast("精力不足,歇一会再扩建吧"); setWorkshopFeedback("expand", false); return; }
  if (!canAfford(CONFIG.EXPAND_COST)) { toast("材料不够"); setWorkshopFeedback("expand", false); return; }
  payCost(CONFIG.EXPAND_COST);
  state.zoneExpansions[zone] += 1;
  spendEnergy(4);
  toast(`木筏扩建完成!当前面积: ${zoneTotalSlots(zone)}格`);
  setWorkshopFeedback("expand", true);
  updateUI();
  save();
}

// ====== 通用批量打造 ======
function craftMaxAffordable(cost) {
  let max = Infinity;
  for (const k in cost) max = Math.min(max, Math.floor((state.res[k] || 0) / cost[k]));
  return max === Infinity ? 0 : Math.max(0, max);
}

function doCraftBatch(feedbackKey, cost, yieldObj, n, energyEach, label) {
  if (state.energy <= 0) { toast("精力不足,歇一会再打造吧"); setWorkshopFeedback(feedbackKey, false); return 0; }
  const times = Math.min(n, craftMaxAffordable(cost));
  if (times < 1) { toast("材料不够"); setWorkshopFeedback(feedbackKey, false); return 0; }
  for (let i = 0; i < times; i++) { payCost(cost); addRes(yieldObj); }
  spendEnergy(energyEach * times);
  const totalYield = {};
  for (const k in yieldObj) totalYield[k] = yieldObj[k] * times;
  toast(`${label} x${times}: 获得 ${resLine(totalYield)}`);
  setWorkshopFeedback(feedbackKey, true);
  updateUI();
  save();
  return times;
}

// ====== 木头合成 ======
function doCraftRope(n) {
  doCraftBatch("craft_rope", CONFIG.ROPE_CRAFT.cost, CONFIG.ROPE_CRAFT.yield, n || 1, 4, "合成绳子");
}

function doCraftRepairKit(n) {
  doCraftBatch("craft_kit", CONFIG.REPAIR_KIT_CRAFT.cost, CONFIG.REPAIR_KIT_CRAFT.yield, n || 1, 4, "合成木筏修复包");
}

function doMakeJerky(n) {
  if (!state.builds.dryer) return;
  doCraftBatch("craft_jerky", CONFIG.JERKY_CRAFT.cost, CONFIG.JERKY_CRAFT.yield, n || 1, 4, "晒鱼干");
}

// ====== 宠物系统 ======
const PET_TYPES = {
  cat: { name: "小橘猫", icon: "🐱" },
  dog: { name: "小狗", icon: "🐶" },
  bird: { name: "小鸟", icon: "🐦" },
};

function choosePet(type) {
  if (!PET_TYPES[type] || state.pet) return;
  state.pet = { type, satiety: 80, lastFeedDate: null, feedStreakDays: 0 };
  toast(`${PET_TYPES[type].icon} ${PET_TYPES[type].name} 加入了你的木筏!`);
  updateUI();
  save();
}

function petMood() {
  if (!state.pet) return "happy";
  if (state.pet.satiety >= 80) return "happy";
  if (state.pet.satiety >= 40) return "neutral";
  return "sad";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function doFeedPet() {
  if (!state.pet) return;
  if (state.res.jerky < 1) { toast("没有鱼干可以喂了,先去晒鱼架做一些"); return; }
  state.res.jerky -= 1;
  state.pet.satiety = Math.min(100, state.pet.satiety + CONFIG.PET_FEED_RESTORE);

  const today = todayStr();
  if (state.pet.lastFeedDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.pet.feedStreakDays = (state.pet.lastFeedDate === yesterday) ? state.pet.feedStreakDays + 1 : 1;
    state.pet.lastFeedDate = today;
    if (state.pet.feedStreakDays >= 3) unlockAchievement("pet_3day_feed");
  }

  petActionUntil = Date.now() + 900;
  petActionType = "happy";
  toast(`${PET_TYPES[state.pet.type].icon} 喂了宠物一块鱼干,它很开心!`);
  updateUI();
  save();
}

function doPetInteract() {
  if (!state.pet) return;
  const actions = ["jump", "spin", "wag"];
  petActionType = pick(actions);
  petActionUntil = Date.now() + 900;
  const actionLabel = { jump: "跳了一下", spin: "转了个圈", wag: "摇了摇尾巴" }[petActionType];
  toast(`${PET_TYPES[state.pet.type].icon} ${PET_TYPES[state.pet.type].name}${actionLabel}!`);
}

// ====== 漂流瓶引导系统 ======
// 后台每60秒检测一次玩家状态, 满足条件且未领取过时漂来一个发光漂流瓶
const BOTTLE_DEFS = [
  {
    id: "fisherman_letter",
    title: "来自远方的渔夫信",
    quote: "好的工具才能钓到好的鱼……",
    instruction: "在工坊中消耗铁块×3升级鱼竿,解锁更高的钓鱼命中率和稀有鱼概率!",
    rewardText: "铁块×2",
    condition: () => state.stats.totalCasts >= 20 && state.rodLevel === 0,
    reward: () => addRes({ iron: 2 }),
  },
  {
    id: "raft_secret",
    title: "木筏上的秘密",
    quote: "铁块放着生锈可惜了……",
    instruction: "在工坊→建造中建造熔炉,可以将废铁熔炼成更多铁块,提升建造效率!",
    rewardText: "木头×5",
    condition: () => state.res.iron >= 3 && !state.builds.furnace,
    reward: () => addRes({ wood: 5 }),
  },
  {
    id: "river_ripple",
    title: "远处的涟漪",
    quote: "河流里的鱼,见过吗?",
    instruction: "你的木筏已经足够强壮了!点击顶部「前往河流」按钮,探索新的流域吧!",
    rewardText: "面包×2",
    condition: () => state.era === "iron" && !state.everVisitedRiver,
    reward: () => addRes({ bread: 2 }),
  },
  {
    id: "mirror_gift",
    title: "大自然的馈赠",
    quote: "水面倒影中,你看到了另一个自己……",
    instruction: "你钓到了一面神奇的镜子!点击主界面的「🪞奇幻镜」按钮,可以改变你的发色、瞳色和装扮!",
    rewardText: "面包×2",
    condition: () => state.mirrorUnlocked,
    reward: () => addRes({ bread: 2 }),
  },
  {
    id: "pet_protest",
    title: "小家伙的抗议",
    quote: "有个毛茸茸的东西一直盯着你……",
    instruction: "点击画面中的宠物可以喂食鱼干,保持饱食度让它心情好!",
    rewardText: "鱼干×1",
    condition: () => state.pet && state.pet.satiety <= 0 && state.res.jerky >= 1,
    reward: () => addRes({ jerky: 1 }),
  },
];

let activeBottle = null;   // { id, x, y }
let bottleCheckAccum = 0;  // 60秒检测一次, 不持久化(重进游戏重新计时即可)
const BOTTLE_REST_X = 280;

function checkBottleConditions() {
  if (activeBottle || isModalOpen()) return;
  for (const def of BOTTLE_DEFS) {
    if (state.bottlesSeen.includes(def.id)) continue;
    if (def.condition()) {
      activeBottle = { id: def.id, x: 380, y: 300 + Math.random() * 50 };
      break;
    }
  }
}

function updateBottleDrift() {
  if (!activeBottle) return;
  if (activeBottle.x > BOTTLE_REST_X) activeBottle.x -= 0.6;
}

function drawDriftBottle() {
  if (!activeBottle) return;
  const { x, y } = activeBottle;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);

  ctx.save();
  // 到达静止位置后用一圈柔和的光晕脉动来吸引注意力, 而不是靠移动
  const haloR = 16 + pulse * 6;
  const halo = ctx.createRadialGradient(x, y, 2, x, y, haloR);
  halo.addColorStop(0, `rgba(180,255,210,${0.55 + pulse * 0.25})`);
  halo.addColorStop(1, "rgba(180,255,210,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "#5bd17a";
  ctx.shadowBlur = 14 + pulse * 6;
  ctx.fillStyle = "#5bd17a";
  ctx.fillRect(x - 6, y - 15, 12, 21);
  ctx.fillStyle = "#bdf2cc";
  ctx.fillRect(x - 3, y - 10, 6, 12);
  ctx.fillStyle = "#2a7a3f";
  ctx.fillRect(x - 3, y - 21, 6, 6);

  // 头顶提示星标, 原地闪烁(不移动), 进一步提示"这里有东西"
  ctx.shadowBlur = 0;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = "#ffe066";
  ctx.fillRect(x - 1, y - 30, 2, 6);
  ctx.fillRect(x - 4, y - 27, 8, 2);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function bottleHit(px, py) {
  if (!activeBottle) return false;
  const dx = px - activeBottle.x, dy = py - activeBottle.y;
  return Math.sqrt(dx * dx + dy * dy) <= 24;
}

function openBottleModal() {
  if (!activeBottle) return;
  const def = BOTTLE_DEFS.find(d => d.id === activeBottle.id);
  if (!def) return;
  document.getElementById("bottle-title").textContent = `🍾「${def.title}」`;
  document.getElementById("bottle-quote").textContent = def.quote;
  document.getElementById("bottle-instruction").textContent = `👉 ${def.instruction}`;
  document.getElementById("bottle-reward").textContent = `完成奖励: ${def.rewardText}`;
  document.getElementById("bottle-modal").classList.remove("hidden");
}

function claimBottleReward() {
  if (!activeBottle) return;
  const def = BOTTLE_DEFS.find(d => d.id === activeBottle.id);
  if (def) {
    def.reward();
    state.bottlesSeen.push(def.id);
    toast(`🍾 领取了漂流瓶奖励: ${def.rewardText}`);
  }
  activeBottle = null;
  document.getElementById("bottle-modal").classList.add("hidden");
  updateUI();
  save();
}

// ====== 鱼类图鉴数据 ======
const FISH_PIXEL_GRIDS = {
  koi: {
    grid: ["..WWWW..", ".WRRRRW.", "WRRWWRRW", "WRRRRRRW", ".WRRRRW.", "..WWWW.."],
    colors: { W: "#ffffff", R: "#e8453c" },
  },
  blackfish: {
    grid: ["..KKKK..", ".KKKKKK.", "KKKuKKKK", "KKKKKKKK", ".KKKKKK.", "..KKKK.."],
    colors: { K: "#1a1a1a", u: "#c8a8ff" },
  },
  turtle: {
    grid: ["..GGGG..", ".GggggG.", "GgGgGgGg", "GgggggGg", ".GggggG.", "..GG.GG."],
    colors: { G: "#7cfc9a", g: "#3a7d44" },
  },
  jellyfish: {
    grid: [".BBBB...", "BBBBBB..", "BPPPPB..", ".B..B...", ".B..B...", "B....B.."],
    colors: { B: "#8fc7ff", P: "#c79bff" },
  },
};

const FISH = {
  trout: { name: "小溪鳟鱼", icon: "🐟", rarity: "common", zones: ["stream"] },
  stripey: { name: "石斑小鱼", icon: "🐠", rarity: "common", zones: ["stream"] },
  shrimp: { name: "透明虾虎", icon: "🦐", rarity: "common", zones: ["stream"] },
  loach: { name: "溪流泥鳅", icon: "🐡", rarity: "common", zones: ["stream"] },
  carp: { name: "河鲤", icon: "🐟", rarity: "common", zones: ["river"] },
  grassfish: { name: "草鱼", icon: "🐟", rarity: "common", zones: ["river"] },
  catfish: { name: "鲶鱼", icon: "🐟", rarity: "common", zones: ["river"] },
  puffer: { name: "河豚", icon: "🐡", rarity: "common", zones: ["river"] },
  koi: { name: "锦鲤", icon: "✨", rarity: "rare", zones: ["river"], pixel: true },
  blackfish: { name: "巨口黑鱼", icon: "💀", rarity: "rare", zones: ["river"], pixel: true },
  turtle: { name: "漂流老龟", icon: "🐢", rarity: "legendary", zones: ["stream", "river"], pixel: true },
  jellyfish: { name: "幽灵水母", icon: "👻", rarity: "legendary", zones: ["stream", "river"], pixel: true },
};
const RARITY_LABEL = { common: "普通", rare: "稀有", legendary: "传说" };

function fishPool(zone, rarity) {
  return Object.keys(FISH).filter(k => FISH[k].rarity === rarity && FISH[k].zones.includes(zone));
}

function flashLegendary() {
  const el = document.getElementById("legendary-flash");
  el.classList.remove("flash");
  void el.offsetWidth; // 重新触发动画
  el.classList.add("flash");
}

function registerCatch(fishKey, isExtra) {
  const def = FISH[fishKey];
  const entry = state.bestiary[fishKey] || (state.bestiary[fishKey] = { caught: false, count: 0, firstZone: null });
  entry.caught = true;
  entry.count += 1;
  if (!entry.firstZone) entry.firstZone = state.zone;

  if (def.rarity === "legendary") {
    state.skillPoints.fish += 3;
    flashLegendary();
    toast(`✨✨ 传说级!钓到了 ${def.icon}${def.name}! 钓鱼点+3 ✨✨`);
  } else if (def.rarity === "rare") {
    state.skillPoints.fish += 1;
    toast(`💖 稀有!钓到了 ${def.icon}${def.name}! 钓鱼点+1`);
  } else if (!isExtra) {
    toast(`钓上了 ${def.icon}${def.name}`);
  }
}

// 根据当前流域+词条+技能决定本次钓上的鱼种
function rollFishSpecies(forceTier) {
  const zone = state.zone;
  const legendaryChance = 0.005;
  let tier = forceTier;
  if (!tier) {
    if (Math.random() < legendaryChance) tier = "legendary";
    else if (zone === "river") {
      const luckBonus = state.currentBuff === "luck" ? 0.20 : 0;
      const skillBonus = state.skills.fish.rare_sense ? 0.10 : 0;
      tier = Math.random() < (0.08 + luckBonus + skillBonus) ? "rare" : "common";
    } else {
      tier = "common";
    }
  }
  let pool = fishPool(zone, tier);
  if (!pool.length) pool = fishPool(zone, "common");
  return pick(pool);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function addRes(obj) {
  for (const k in obj) state.res[k] = (state.res[k] || 0) + obj[k];
}

function resLine(obj) {
  return Object.entries(obj).map(([k, v]) => `${ICONS[k] || ""}+${v}`).join(" ");
}

// ====== 手动打捞 (拉钩, 消耗精力2) ======
function doFishLoot() {
  if (state.energy <= 0) { toast("精力不足,歇一会再打捞吧"); return; }
  const eff = efficiency();
  const now = Date.now();
  const eventEff = now < state.tempEffModExpire ? state.tempEffMod : 0;
  const table = state.era === "iron" ? LOOT_TABLE_IRON : LOOT_TABLE_STONE;
  let loot = pick(table);
  const netBonus = state.builds.net ? 1.5 : 1;
  const bountyBonus = (state.currentBuff === "bounty" && state.zone === "river") ? 1.5 : 1;
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

  toast(`捞到了 ${resLine(scaled)}${extraMsg}`);
  spawnFloatingText(`+${Object.values(scaled).reduce((a, b) => a + b, 0)}`);

  if (Math.random() < CHEST_CHANCE) openChest();

  spendEnergy(2);
  updateUI();
  save();
}

function openChest() {
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
const FOOD_DEFS = {
  bread: { restore: 15, label: "面包" },
  spam: { restore: 18, label: "午餐肉" },
  fish: { restore: 12, label: "鱼" }, // 注: 鱼目前不分稀有度库存, 统一按普通鱼回复值计算
};

function doEat(key) {
  if (state.res[key] < 1) return;
  state.res[key] -= 1;
  restoreEnergy(FOOD_DEFS[key].restore);
  toast(`吃了${FOOD_DEFS[key].label},精力+${FOOD_DEFS[key].restore}`);
  updateUI();
  save();
}

function doDrink() {
  if (state.res.water < 1) return;
  state.res.water -= 1;
  restoreEnergy(10);
  toast("喝了一口净水,精力+10 💧");
  updateUI();
  save();
}

// ====== 钓鱼系统 (动画状态机: idle->casting->waiting->biting->pulling->idle, 消耗精力3) ======
function rodChance() {
  let base = Math.min(1.0, 0.7 + state.rodLevel * 0.05);
  if (state.skills.fish.bait_research) base += 0.15; // 鱼饵研究: 普通鱼命中率+15%
  return Math.min(1, base);
}

// UI上显示的命中率比实际值低10个百分点(给玩家一点"超出预期"的小惊喜), 不影响实际判定概率
function displayChancePct(actualChance) {
  return Math.round(Math.max(0, actualChance - 0.1) * 100);
}

const FISH_ESCAPE_JOKES = ["跑了!手慢了一步", "差一点……", "这条鱼太狡猾了"];

// 入口: 点击「钓鱼」按钮 (idle时起竿, biting时拉线)
function doFishing(useFoodBait) {
  if (fishingState === "biting") { pullFishingLine(); return; }
  if (fishingState !== "idle") return;
  if (!state.builds.rod) return;
  if (state.energy <= 0) { toast("精力不足,歇一会再钓吧"); return; }

  let baitKey = "seaweed", bonus = 0;
  if (useFoodBait === "bread" || useFoodBait === "spam") { baitKey = useFoodBait; bonus = 0.10; }
  if (state.res[baitKey] < 1) { toast(`没有${ICONS[baitKey]}可以做鱼饵了`); return; }
  state.res[baitKey] -= 1;

  fishingBaitKey = baitKey;
  fishingBaitBonus = bonus;
  fishingState = "casting";
  fishingPhaseDur = 350;
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

function enterFishBitePhase() {
  fishingState = "biting";
  fishingPhaseDur = 800;
  fishingPhaseUntil = Date.now() + fishingPhaseDur;
  updateUI();
  fishingTimer = setTimeout(missFishBite, 800);
}

function missFishBite() {
  fishingState = "idle";
  toast(pick(FISH_ESCAPE_JOKES));
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

function resolveFishCatch() {
  const now = Date.now();
  const tempHit = now < state.tempHitModExpire ? state.tempHitMod : 0;
  const eff = efficiency();
  const chance = Math.min(1, (rodChance() + fishingBaitBonus + tempHit) * eff);

  // 精准直觉: 每3次成功钓鱼必定命中一次稀有鱼 (仅河流有效)
  let forceTier = null;
  const precisionActive = state.currentBuff === "precision" && state.zone === "river";

  if (Math.random() < chance) {
    state.castStreak += 1;
    if (precisionActive && state.castStreak % 3 === 0) forceTier = "rare";

    const speciesKey = rollFishSpecies(forceTier);
    registerCatch(speciesKey);
    const gain = 1 + (Math.random() < 0.25 ? 1 : 0);
    state.res.fish += gain;
    spawnFloatingText(`🐟+${gain}`);
    checkFishAchievements(speciesKey, true);

    // 磁力鱼钩: 额外多钓1条普通鱼
    if (state.currentBuff === "magnet") {
      const extraKey = rollFishSpecies("common");
      registerCatch(extraKey, true);
      state.res.fish += 1;
      toast(`磁力鱼钩还多带上来一条 ${FISH[extraKey].icon}${FISH[extraKey].name}!`);
    }
  } else {
    state.castStreak = 0;
    toast("鱼饵被叼跑了,这次没钓到...");
    checkFishAchievements(null, false);
  }
  spendEnergy(3);
  fishingState = "idle";
  fishingBaitKey = null;
  updateUI();
  save();
}

function rodUpgradeCost() {
  const n = state.rodLevel + 1;
  return { rope: 2 + n, iron: 1 + n };
}

function doUpgradeRod() {
  if (state.rodLevel >= 6) return;
  if (state.energy <= 0) { toast("精力不足,歇一会再升级吧"); setWorkshopFeedback("rod_upgrade", false); return; }
  const cost = rodUpgradeCost();
  if (!canAfford(cost)) { toast("升级材料不够"); setWorkshopFeedback("rod_upgrade", false); return; }
  payCost(cost);
  state.rodLevel += 1;
  spendEnergy(4);
  toast(`鱼竿升级! 命中率提升到 ${displayChancePct(rodChance())}%`);
  setWorkshopFeedback("rod_upgrade", true);
  updateUI();
  save();
}

// ====== 椰子处理: 生吃 / 锤子敲开 / 净水器过滤, 三种方式直接回复精力 ======
function doEatCoconutRaw() {
  if (state.res.coconut < 1) { toast("没有椰子了"); setWorkshopFeedback("coconut_raw", false); return; }
  state.res.coconut -= 1;
  restoreEnergy(10);
  toast("生吃了一个椰子,精力+10 🥥");
  setWorkshopFeedback("coconut_raw", true);
  updateUI();
  save();
}

function doOpenCoconut() {
  if (!state.builds.hammer) return;
  if (state.res.coconut < 1) { toast("没有椰子可以敲"); setWorkshopFeedback("coconut_hammer", false); return; }
  state.res.coconut -= 1;
  restoreEnergy(15);
  if (Math.random() < 0.3) { state.res.scrap += 1; }
  toast("敲开了一个椰子,精力+15 🔨");
  setWorkshopFeedback("coconut_hammer", true);
  updateUI();
  save();
}

function doFilterCoconutEnergy() {
  if (!state.builds.purifier) return;
  if (state.res.coconut < 1) { toast("没有椰子可以过滤"); setWorkshopFeedback("coconut_filter", false); return; }
  state.res.coconut -= 1;
  restoreEnergy(20);
  toast("用净水器过滤了椰子汁,精力+20 💧");
  setWorkshopFeedback("coconut_filter", true);
  updateUI();
  save();
}

// ====== 翻垃圾 (消耗精力5+1垃圾, 翻出废铁/铁块概率比普通打捞更高, 小概率出图纸) ======
const RUMMAGE_JOKE_CHANCE = 0.40; // 失败时有这个概率翻到"破烂垃圾"并触发吐槽
const RUMMAGE_JOKES = [
  "翻到了一只臭袜子",
  "一个破瓶子,扔回去了",
  "什么都没有,只有海风",
  "翻到了上一个漂流者的日记,字迹模糊看不清",
  "一团破渔网,没有利用价值",
];

function rummageLootTable() {
  return state.era === "iron" ? RUMMAGE_TABLE_IRON : RUMMAGE_TABLE_STONE;
}
function rummageSuccessChance() {
  return CONFIG.RUMMAGE_CHANCE[state.zone] || CONFIG.RUMMAGE_CHANCE.stream;
}

function doRummage() {
  if (state.res.trash < 1) { toast("没有垃圾可以翻了,先去拉钩打捞几个垃圾回来"); return; }
  if (state.energy <= 0) { toast("精力不足,歇一会再翻吧"); return; }
  state.res.trash -= 1;

  const eff = efficiency();
  const bpChance = CONFIG.BLUEPRINT_DROP_CHANCE + (state.skills.build.veteran ? 0.03 : 0);
  if (Math.random() < bpChance) {
    if (grantRandomBlueprint()) {
      unlockAchievement("bp_from_trash");
      checkBuildAchievements();
    }
  }

  if (Math.random() < rummageSuccessChance() * eff) {
    const loot = pick(rummageLootTable());
    const bountyBonus = (state.currentBuff === "bounty" && state.zone === "river") ? 1.5 : 1;
    const scaledLoot = {};
    for (const k in loot) {
      let amt = Math.max(1, Math.round(loot[k] * bountyBonus));
      if (state.skills.build.handy) amt += 1;
      scaledLoot[k] = amt;
    }
    addRes(scaledLoot);
    toast(`翻垃圾发现了 ${resLine(scaledLoot)}`);
    spawnFloatingText(`+${Object.values(scaledLoot).reduce((a, b) => a + b, 0)}`);
  } else if (Math.random() < RUMMAGE_JOKE_CHANCE) {
    toast(pick(RUMMAGE_JOKES));
  } else {
    toast(`翻了半天什么都没找到...`);
  }
  spendEnergy(5);
  updateUI();
  save();
}

// ====== 建筑/科技树 ======
// repeatable: false 表示一次性建成后不可重复建造 (用于建造面板"已建造"折叠隐藏)
const BUILDS = [
  { key: "net", icon: "🪝", name: "绳网", desc: "升级打捞工具,手动捞取产出 +50%", cost: { wood: 6, rope: 4 }, repeatable: false },
  { key: "furnace", icon: "🔥", name: "简易熔炉", desc: "解锁熔炼铁块功能,消耗废铁炼出铁块", cost: { wood: 10, scrap: 6 }, repeatable: false },
  { key: "autocollector", icon: "⚙️", name: "自动收集网", desc: "解锁挂机自动打捞!跃升进入铁器时代", cost: { iron: 3, rope: 6, wood: 8 }, requireBuild: "furnace", repeatable: false },
  { key: "rod", icon: "🎣", name: "简易鱼竿", desc: "解锁钓鱼,用水草当鱼饵,初始命中率60%", cost: { wood: 10, iron: 3 }, repeatable: false },
  { key: "hammer", icon: "🔨", name: "锤子", desc: "解锁敲开椰子,直接回复精力", cost: { wood: 3, iron: 3 }, repeatable: false },
  { key: "purifier", icon: "🚰", name: "净水过滤器", desc: "被动缓慢产出净水 (每次消耗1塑料存储)", cost: { plastic: 5, wood: 5 }, repeatable: false },
  { key: "dryer", icon: "🍢", name: "晒鱼架", desc: "解锁晒鱼干,鱼x3 → 鱼干x1 (宠物食物)", cost: { wood: 8, rope: 3 }, repeatable: false },
];

function canAfford(cost) {
  return Object.entries(cost).every(([k, v]) => (state.res[k] || 0) >= v);
}
function payCost(cost) {
  Object.entries(cost).forEach(([k, v]) => { state.res[k] -= v; });
  if (state.skills.build.thrifty) {
    // 节约: 建造材料返还10%
    Object.entries(cost).forEach(([k, v]) => { state.res[k] += Math.round(v * 0.1); });
  }
}

function tryBuild(key) {
  const def = BUILDS.find(b => b.key === key);
  if (!def || state.builds[key]) return;
  if (state.energy <= 0) { toast("精力不足,歇一会再建造吧"); setWorkshopFeedback("build_" + key, false); return; }
  if (!canAfford(def.cost)) {
    toast("材料不够");
    state.stats.buildFailCount += 1;
    checkBuildAchievements();
    setWorkshopFeedback("build_" + key, false);
    return;
  }
  payCost(def.cost);
  state.builds[key] = true;
  spendEnergy(4);

  if (key === "net") toast("绳网做好了!打捞效率提升 🪝");
  if (key === "furnace") toast("熔炉建成!现在可以熔炼铁块了 🔥");
  if (key === "autocollector") { toast("自动收集网启动!木筏文明跃升 ⚙️➡️ 铁器时代!"); state.era = "iron"; }
  if (key === "rod") toast("做好了一根简易鱼竿! 🎣");
  if (key === "hammer") toast("打造了一把锤子! 🔨 可以敲椰子了");
  if (key === "purifier") toast("净水过滤器搭建完成! 🚰 开始缓慢产水");
  if (key === "dryer") toast("晒鱼架搭好了! 🍢 现在可以晒鱼干喂宠物了");

  checkBuildAchievements();
  setWorkshopFeedback("build_" + key, true);
  updateUI();
  save();
}

function doSmeltIron(n) {
  doCraftBatch("smelt", CONFIG.SMELT_CRAFT.cost, CONFIG.SMELT_CRAFT.yield, n || 1, 4, "熔炼铁块");
}

// ====== 流域系统 ======
function isModalOpen() {
  return !document.getElementById("chest-modal").classList.contains("hidden")
    || !document.getElementById("event-modal").classList.contains("hidden")
    || !document.getElementById("buff-modal").classList.contains("hidden")
    || !document.getElementById("bestiary-modal").classList.contains("hidden")
    || !document.getElementById("blueprint-modal").classList.contains("hidden")
    || !document.getElementById("skilltree-modal").classList.contains("hidden")
    || !document.getElementById("achievement-modal").classList.contains("hidden")
    || !document.getElementById("costume-modal").classList.contains("hidden")
    || !document.getElementById("shop-modal").classList.contains("hidden")
    || !document.getElementById("workshop-modal").classList.contains("hidden")
    || !document.getElementById("bottle-modal").classList.contains("hidden");
}

function doZoneSwitch() {
  const now = Date.now();
  if (now < state.zoneCooldownUntil) {
    const left = Math.ceil((state.zoneCooldownUntil - now) / 1000);
    toast(`流域切换冷却中,还剩${left}秒`);
    state.stats.cooldownClicks += 1;
    if (state.stats.cooldownClicks > 5) unlockAchievement("cooldown_spam_5");
    save();
    return;
  }
  if (state.zone === "stream") {
    if (state.era !== "iron") { toast("需要先跃升到铁器时代(造出自动收集网)才能前往河流"); return; }
    state.zone = "river";
    state.everVisitedRiver = true;
    state.castStreak = 0;
    state.shieldAvailable = false;
    state.nextEventAt = now + 90000 + Math.random() * 60000;
    state.zoneCooldownUntil = now + zoneCooldownMs();
    state.stats.zoneEnterAt = now;
    toast("⛵ 木筏缓缓驶入了宽阔的河流...");
    openBuffModal();
  } else {
    state.zone = "stream";
    state.currentBuff = null;
    state.castStreak = 0;
    state.stormForceReturnAt = 0;
    state.nextEventAt = now + 90000 + Math.random() * 60000;
    state.zoneCooldownUntil = now + zoneCooldownMs();
    state.stats.zoneEnterAt = now;
    toast("🏞️ 回到了平静的溪流");
  }
  updateUI();
  save();
}

// ====== 进场词条 (Roguelite buff) ======
const BUFFS = {
  luck: { icon: "🍀", name: "幸运之手", desc: "稀有鱼出现概率 +20%" },
  speed: { icon: "⚡", name: "手速加持", desc: "钓鱼冷却时间 -25%" },
  magnet: { icon: "🧲", name: "磁力鱼钩", desc: "每次额外多钓1条普通鱼" },
  shield: { icon: "🛡️", name: "风浪免疫", desc: "本次进场免疫第一次负面突发事件" },
  bounty: { icon: "💰", name: "丰收时节", desc: "所有物资掉落数量 +50%" },
  precision: { icon: "🎯", name: "精准直觉", desc: "连续钓鱼第3次必定命中稀有鱼" },
};

function openBuffModal() {
  const keys = Object.keys(BUFFS);
  const choices = [];
  while (choices.length < 3 && choices.length < keys.length) {
    const k = pick(keys);
    if (!choices.includes(k)) choices.push(k);
  }
  const box = document.getElementById("buff-options");
  box.innerHTML = "";
  choices.forEach(key => {
    const def = BUFFS[key];
    const btn = document.createElement("button");
    btn.className = "buff-opt-btn";
    btn.innerHTML = `${def.icon} <b>${def.name}</b><br>${def.desc}`;
    btn.onclick = () => {
      state.currentBuff = key;
      if (key === "shield") state.shieldAvailable = true;
      document.getElementById("buff-modal").classList.add("hidden");
      toast(`获得祝福: ${def.icon}${def.name}!`);
      updateUI();
      save();
    };
    box.appendChild(btn);
  });
  document.getElementById("buff-modal").classList.remove("hidden");
}

// ====== 突发事件系统 ======
function applyTempEff(mod, durationMs) {
  state.tempEffMod = mod;
  state.tempEffModExpire = Date.now() + durationMs;
}
function applyTempHit(mod, durationMs) {
  state.tempHitMod = mod;
  state.tempHitModExpire = Date.now() + durationMs;
}

const EVENTS_STREAM = [
  {
    icon: "🌧️", title: "突然下雨", negative: true,
    desc: "乌云压顶,豆大的雨点砸了下来。",
    options: [
      { label: "A. 撑伞继续钓 (效率-20%, 持续60秒)", cls: "", effect: () => { applyTempEff(-0.2, 60000); toast("雨中坚持打捞,效率暂时降低"); } },
      { label: "B. 收竿躲雨 (精力+10)", cls: "opt-b", effect: () => { restoreEnergy(10); toast("躲了一会雨,精力+10"); } },
    ],
  },
  {
    icon: "🦅", title: "大鸟来抢鱼", negative: true,
    desc: "一只大鸟盯上了你新鲜的渔获!",
    options: [
      { label: "A. 驱赶 (精力-5, 保住鱼)", cls: "", effect: () => { spendEnergy(5); toast("挥手赶走了大鸟,鱼保住了"); } },
      { label: "B. 让它叼走 (损失1条鱼)", cls: "opt-b", effect: () => { if (state.res.fish >= 1) { state.res.fish -= 1; toast("大鸟叼走了一条鱼"); } else { toast("反正你也没有鱼,它白跑一趟"); } } },
    ],
  },
  {
    icon: "🌊", title: "水流湍急", negative: false,
    desc: "一段湍急的水流冲向木筏。",
    options: [
      { label: "A. 固定木筏 (消耗绳子x1, 钓鱼效率正常)", cls: "", effect: () => { if (state.res.rope >= 1) { state.res.rope -= 1; toast("用绳子固定住了木筏"); } else { toast("没有绳子,只能随波逐流了"); } } },
      { label: "B. 随波逐流 (50%概率获得漂来的物资)", cls: "opt-b", effect: () => { if (Math.random() < 0.5) { const loot = pick(LOOT_TABLE_STONE); addRes(loot); toast(`随波逐流捡到了 ${resLine(loot)}`); } else { toast("什么都没捡到"); } } },
    ],
  },
  {
    icon: "💎", title: "水底光芒", negative: false,
    desc: "水底似乎有什么东西在闪光...",
    options: [
      { label: "A. 潜水摸一下 (精力-10, 60%概率获得稀有资源)", cls: "", effect: () => { spendEnergy(10); if (Math.random() < 0.6) { state.res.iron += 1; state.res.scrap += 2; toast("摸到了 🔩+1 🔧+2!"); } else { toast("摸了个空,只有泥沙"); } } },
      { label: "B. 忽略", cls: "opt-b", effect: () => { toast("懒得理它,继续钓鱼"); } },
    ],
  },
  {
    icon: "🐢", title: "小海龟路过", negative: false, auto: true,
    desc: "一只小海龟慢悠悠地游了过来。",
    effect: () => { const loot = pick(LOOT_TABLE_STONE); addRes(loot); toast(`🐢 一只小海龟游过来,留下了一些东西: ${resLine(loot)}`); },
  },
];

const EVENTS_RIVER = [
  {
    icon: "🚢", title: "商船路过", negative: false,
    desc: "一艘小商船缓缓驶过,船家朝你打招呼。",
    options: [
      { label: "A. 挥手求助 (获得随机食物x2)", cls: "", effect: () => { for (let i = 0; i < 2; i++) { const f = Math.random() < 0.5 ? "bread" : "spam"; state.res[f] += 1; } toast("商船送了你一些食物!"); } },
      { label: "B. 悄悄跟上 (30%概率钓到河流稀有鱼)", cls: "opt-b", effect: () => { if (Math.random() < 0.3) { const k = pick(fishPool("river", "rare")); registerCatch(k); state.res.fish += 1; } else { toast("跟丢了,什么都没发生"); } } },
    ],
  },
  {
    icon: "⛈️", title: "暴风雨预警", negative: true,
    desc: "天色骤变,远处传来雷声。",
    options: [
      { label: "A. 提前撤离 (安全返回,保留所有资源)", cls: "", effect: () => { toast("安全撤离,资源毫无损失"); } },
      { label: "B. 赌一把继续 (2分钟高效窗口, 之后强制离场)", cls: "opt-b", effect: () => { applyTempEff(0.3, 120000); state.stormForceReturnAt = Date.now() + 120000; toast("豁出去了!接下来2分钟效率大增,但时间到会被赶回溪流"); } },
    ],
  },
  {
    icon: "🐊", title: "鳄鱼出没", negative: true,
    desc: "水面下一双眼睛正盯着你的木筏。",
    options: [
      { label: "A. 立刻收竿 (安全,跳过本次钓鱼机会)", cls: "", effect: () => { toast("默默收起了鱼竿,鳄鱼游走了"); } },
      { label: "B. 用食物引开 (消耗食物x1, 换3分钟效率+30%)", cls: "opt-b", effect: () => { const f = state.res.spam >= 1 ? "spam" : (state.res.bread >= 1 ? "bread" : null); if (f) { state.res[f] -= 1; applyTempHit(0.3, 180000); toast("鳄鱼被食物引开了,接下来3分钟命中率+30%"); } else { toast("没有食物可以用,只能干瞪眼"); } } },
    ],
  },
  {
    icon: "🎣", title: "老渔夫路过", negative: false,
    desc: "一位老渔夫划着小船经过,似乎很有经验。",
    options: [
      { label: "A. 请教技巧 (剩余停留时间命中率+15%)", cls: "", effect: () => { applyTempHit(0.15, 6 * 60000); toast("老渔夫传授了技巧,命中率+15%"); } },
      { label: "B. 交换物资 (木头x3 换随机鱼饵x3)", cls: "opt-b", effect: () => { if (state.res.wood >= 3) { state.res.wood -= 3; state.res.seaweed += 3; toast("用木头换到了3份水草鱼饵"); } else { toast("木头不够,老渔夫摇头划走了"); } } },
    ],
  },
  {
    icon: "🌅", title: "平静的傍晚", negative: false, auto: true,
    desc: "夕阳西下,水面泛起金色的光。",
    effect: () => { applyTempEff(0.2, 120000); toast("🌅 夕阳西下,鱼儿都浮上来了! 钓鱼效率+20%,持续2分钟"); },
  },
];

function triggerRandomEvent() {
  if (isModalOpen()) return;
  const pool = state.zone === "river" ? EVENTS_RIVER : EVENTS_STREAM;
  const ev = pick(pool);

  if (ev.auto) {
    ev.effect();
    save();
    return;
  }

  if (ev.negative && state.shieldAvailable) {
    state.shieldAvailable = false;
    toast(`🛡️ 风浪免疫抵消了一次突发事件: ${ev.icon}${ev.title}`);
    return;
  }

  // 牢固度: 有几率直接化解负面事件
  if (ev.negative && Math.random() < sturdyMitigation()) {
    toast(`🛡️ 牢固的木筏扛住了这次风浪 (${ev.icon}${ev.title}),毫发无损`);
    return;
  }

  document.getElementById("event-title").textContent = `${ev.icon} ${ev.title}`;
  document.getElementById("event-desc").textContent = ev.desc;
  const optBox = document.getElementById("event-options");
  optBox.innerHTML = "";
  ev.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "event-opt-btn " + (opt.cls || "");
    btn.textContent = opt.label;
    btn.onclick = () => {
      opt.effect();
      document.getElementById("event-modal").classList.add("hidden");
      updateUI();
      save();
    };
    optBox.appendChild(btn);
  });
  document.getElementById("event-modal").classList.remove("hidden");
}

// ====== 图鉴面板 ======
function renderBestiary() {
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

    card.innerHTML = `
      <div class="fish-icon">${iconHtml}</div>
      <div class="fish-name">${entry ? def.name : "???"}</div>
      <div class="rarity-tag rarity-${def.rarity}">${RARITY_LABEL[def.rarity]}</div>
      <div class="fish-count">${entry ? `钓到${entry.count}次 · 初遇${entry.firstZone === "river" ? "河流" : "溪流"}` : "尚未发现"}</div>
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
function renderBlueprints() {
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
const SKILL_DEFS = {
  build: [
    { tier: 1, key: "handy", icon: "✋", name: "手巧", desc: "打捞/翻垃圾堆掉落数量 +1", cost: 1 },
    { tier: 1, key: "thrifty", icon: "💰", name: "节约", desc: "建造材料返还率 10%", cost: 1 },
    { tier: 2, key: "veteran", icon: "🧓", name: "老手", desc: "图纸从垃圾堆掉落概率 +3%", cost: 2 },
    { tier: 2, key: "pipeline", icon: "⚙️", name: "流水线", desc: "建造速度 +20% (敬请期待)", cost: 2 },
    { tier: 3, key: "automation_master", icon: "🤖", name: "自动化大师", desc: "自动收集网每次额外+1资源 (敬请期待)", cost: 3 },
  ],
  fish: [
    { tier: 1, key: "instinct", icon: "👆", name: "手感", desc: "钓鱼冷却时间 -10%", cost: 1 },
    { tier: 1, key: "bait_research", icon: "🪱", name: "鱼饵研究", desc: "普通鱼命中率 +15%", cost: 1 },
    { tier: 2, key: "rare_sense", icon: "👁️", name: "稀有感知", desc: "稀有鱼出现概率 +10%", cost: 2 },
    { tier: 2, key: "deepwater", icon: "🌊", name: "深水探索", desc: "解锁特殊鱼饵 (敬请期待)", cost: 2 },
    { tier: 3, key: "legend_hunter", icon: "🏆", name: "传说猎手", desc: "传说鱼出现概率+5%,累计触发永久buff (敬请期待)", cost: 3 },
  ],
};

function treeHasTierUnlocked(tree, tier) {
  return SKILL_DEFS[tree].some(n => n.tier === tier && state.skills[tree][n.key]);
}

function canUnlockSkillNode(tree, node) {
  if (state.skills[tree][node.key]) return false;
  if (state.skillPoints[tree] < node.cost) return false;
  if (node.tier === 1) return true;
  return treeHasTierUnlocked(tree, node.tier - 1);
}

function unlockSkillNode(tree, key) {
  const node = SKILL_DEFS[tree].find(n => n.key === key);
  if (!node || !canUnlockSkillNode(tree, node)) return;
  state.skillPoints[tree] -= node.cost;
  state.skills[tree][key] = true;
  toast(`🌳 解锁技能: ${node.icon}${node.name}!`);
  renderSkillTree();
  updateUI();
  save();
}

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

function renderSkillTree() {
  document.getElementById("skill-points-build").textContent = `🪵 建造点: ${state.skillPoints.build}`;
  document.getElementById("skill-points-fish").textContent = `🎣 钓鱼点: ${state.skillPoints.fish}`;
  renderSkillTreeColumn("build");
  renderSkillTreeColumn("fish");
}

// ====== 成就系统 (AchievementManager) ======
const ACHIEVEMENTS = [
  // 🎣 钓鱼类
  { id: "first_catch", cat: "fish", name: "第一竿", desc: "第一次钓到鱼", hidden: false },
  { id: "win_streak10", cat: "fish", name: "孤独求败", desc: "连续钓鱼10次都命中", hidden: false },
  { id: "lose_streak10", cat: "fish", name: "孤独求败(黑化版)", desc: "连续钓鱼10次全部失败", hidden: false },
  { id: "total_casts100", cat: "fish", name: "我独自垂钓", desc: "累计钓鱼超过100次", hidden: false },
  { id: "same_fish_50", cat: "fish", name: "你和这条鱼有什么深仇大恨", desc: "同一种普通鱼钓到超过50条", hidden: false },
  { id: "shrimp_10", cat: "fish", name: "niko is watching you", desc: "钓到虾虎超过10次", hidden: true },
  { id: "fail_success_fail", cat: "fish", name: "薛定谔的鱼竿", desc: "钓鱼结果连续出现 失败-成功-失败", hidden: true },
  { id: "first_legendary", cat: "fish", name: "等等这不是梦吧", desc: "第一次钓到传说鱼", hidden: false, reward: () => grantBlueprintByCategory("structural") },

  // 🪵 建造类
  { id: "build_fail_3", cat: "build", name: "巧妇难为无米之炊", desc: "尝试建造但材料不足,触发3次", hidden: false },
  { id: "all_slots_full", cat: "build", name: "寸土寸金(字面意思)", desc: "木筏所有槽位全部建满", hidden: false, reward: () => grantBlueprintByCategory("decorative") },
  { id: "half_blueprints", cat: "build", name: "破烂收集家(褒义)", desc: "收集超过一半图纸", hidden: false, reward: () => grantBlueprintByCategory("basic") },
  { id: "bp_from_trash", cat: "build", name: "天降鸿运(垃圾堆版)", desc: "翻垃圾堆翻到图纸", hidden: true },

  // 🌊 流域类
  { id: "first_force_exit", cat: "zone", name: "社会毒打初体验", desc: "第一次进入河流被突发事件强制退出", hidden: false },
  { id: "force_exit_3", cat: "zone", name: "屡败屡战(你没救了)", desc: "同一个流域被赶出去3次", hidden: false },
  { id: "cooldown_spam_5", cat: "zone", name: "急什么急什么", desc: "流域切换冷却期间点击切换按钮超过5次", hidden: true },

  // 😴 玄学/隐藏类
  { id: "idle_5min", cat: "hidden", name: "放空(合理)", desc: "什么都不做静置5分钟", hidden: true },
  { id: "idle_20min", cat: "hidden", name: "老僧入定", desc: "什么都不做静置20分钟", hidden: true },
  { id: "idle_1h", cat: "hidden", name: "羽化登仙", desc: "什么都不做静置1小时", hidden: true },
  { id: "trash_20", cat: "hidden", name: "海洋清洁工(不情愿)", desc: "钓上来垃圾超过20次", hidden: true },
  { id: "same_zone_30min", cat: "hidden", name: "此心安处是吾乡", desc: "在同一个流域连续待超过30分钟", hidden: true },

  // 🐾 宠物类
  { id: "pet_3day_feed", cat: "pet", name: "比养自己还上心", desc: "连续3天登录并喂宠物", hidden: true },
  { id: "pet_starve", cat: "pet", name: "它没事,它理解你", desc: "宠物饱食度降到0", hidden: true },

  // 🪞 奇幻镜
  { id: "mirror_unlock", cat: "hidden", name: "大自然的馈赠", desc: "鱼竿升级后,第一次在溪流钓到鱼", hidden: true, reward: () => { state.mirrorUnlocked = true; } },
];
const ACHV_CATEGORY_LABEL = { fish: "🎣 钓鱼类", build: "🪵 建造类", zone: "🌊 流域类", hidden: "😴 玄学/隐藏类", pet: "🐾 宠物类" };

function grantBlueprintByCategory(category) {
  const unowned = Object.keys(BLUEPRINTS).filter(k => !state.blueprints[k] && BLUEPRINTS[k].category === category);
  if (unowned.length) return grantBlueprint(pick(unowned));
  return grantRandomBlueprint();
}

function showAchievementToast(def) {
  const layer = document.getElementById("achievement-toast-layer");
  const el = document.createElement("div");
  el.className = "achievement-toast";
  el.innerHTML = `🏆 <b>${def.name}</b><br>${def.desc}${def.hidden ? '<br><span class="hidden-tag">隐藏成就解锁!</span>' : ""}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function unlockAchievement(id) {
  if (state.achievements[id]) return;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  state.achievements[id] = { unlocked: true, unlockedAt: Date.now() };
  if (def.cat === "fish") state.skillPoints.fish += 1;
  if (def.cat === "build") state.skillPoints.build += 1;
  if (def.reward) def.reward();
  showAchievementToast(def);
  if (id === "mirror_unlock") triggerMirrorUnlockEffect();
  updateUI();
  save();
}

// 奇幻镜解锁专属特效: 全屏闪光 + 剧情文案
function triggerMirrorUnlockEffect() {
  flashLegendary();
  toast("✨ 你钓到了一面奇怪的镜子,水面倒影中你看到了另一个自己... 🪞");
}

function renderAchievements() {
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

// ====== 成就检测钩子 ======
function checkBuildAchievements() {
  if (state.stats.buildFailCount >= 3) unlockAchievement("build_fail_3");
  const ownedBp = Object.keys(state.blueprints).length;
  if (ownedBp > Object.keys(BLUEPRINTS).length / 2) unlockAchievement("half_blueprints");
  const builtKeys = BUILDING_RENDER_ORDER.filter(isBuiltKey);
  if (builtKeys.length >= zoneTotalSlots(state.zone)) unlockAchievement("all_slots_full");
}

function checkFishAchievements(speciesKey, hit) {
  state.stats.totalCasts += 1;
  state.stats.last3Results.push(hit ? "hit" : "miss");
  if (state.stats.last3Results.length > 3) state.stats.last3Results.shift();
  if (state.stats.last3Results.join(",") === "miss,hit,miss") unlockAchievement("fail_success_fail");

  if (hit) {
    state.stats.totalCatches += 1;
    state.stats.consecutiveHits += 1;
    state.stats.consecutiveMisses = 0;
    if (state.stats.totalCatches === 1) unlockAchievement("first_catch");
    if (state.stats.consecutiveHits >= 10) unlockAchievement("win_streak10");
    const entry = state.bestiary[speciesKey];
    const def = FISH[speciesKey];
    if (def.rarity === "common" && entry && entry.count >= 50) unlockAchievement("same_fish_50");
    if (speciesKey === "shrimp" && entry && entry.count >= 10) unlockAchievement("shrimp_10");
    if (def.rarity === "legendary") unlockAchievement("first_legendary");
    if (state.rodLevel >= 1 && state.zone === "stream" && !state.mirrorUnlocked) unlockAchievement("mirror_unlock");
  } else {
    state.stats.consecutiveMisses += 1;
    state.stats.consecutiveHits = 0;
    if (state.stats.consecutiveMisses >= 10) unlockAchievement("lose_streak10");
  }
  if (state.stats.totalCasts > 100) unlockAchievement("total_casts100");
}

function checkIdleAchievements(now) {
  const idleMs = now - state.lastActionAt;
  if (idleMs >= 5 * 60000) unlockAchievement("idle_5min");
  if (idleMs >= 20 * 60000) unlockAchievement("idle_20min");
  if (idleMs >= 60 * 60000) unlockAchievement("idle_1h");
  if (now - state.stats.zoneEnterAt >= 30 * 60000) unlockAchievement("same_zone_30min");
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

function renderCostumeModal() {
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

function doSellFish(amount) {
  const n = Math.min(amount, Math.floor(state.res.fish));
  if (n < 1) { toast("没有鱼可以出售"); return; }
  state.res.fish -= n;
  state.gold += n * FISH_SELL_PRICE;
  toast(`出售了 🐟${n}条,获得 🪙${n * FISH_SELL_PRICE}`);
  updateUI();
  renderShopModal();
  save();
}

function doBuyItem(id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || state.shopOwned.includes(id)) return;
  if (state.gold < item.price) { toast("金币不够"); return; }
  state.gold -= item.price;
  state.shopOwned.push(id);
  toast(`🛍️ 购买了 ${item.icon}${item.name}!`);
  updateUI();
  renderShopModal();
  save();
}

function renderShopModal() {
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
    card.querySelector("#btn-sell-one").onclick = () => doSellFish(1);
    card.querySelector("#btn-sell-all").onclick = () => doSellFish(Math.floor(state.res.fish));

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
      if (!owned) card.querySelector("button").onclick = () => doBuyItem(item.id);
      list.appendChild(card);
    });
  }
}

// ====== UI 渲染 ======
function updateUI() {
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

  const zoneBtn = document.getElementById("btn-zone-switch");
  const now = Date.now();
  if (state.zone === "stream") {
    if (now < state.zoneCooldownUntil) {
      zoneBtn.textContent = `⛵ 冷却中 (${Math.ceil((state.zoneCooldownUntil - now) / 1000)}s)`;
      zoneBtn.disabled = true;
    } else if (state.era !== "iron") {
      zoneBtn.textContent = "🔒 前往河流 (需铁器时代)";
      zoneBtn.disabled = true;
    } else {
      zoneBtn.textContent = "⛵ 前往河流";
      zoneBtn.disabled = false;
    }
  } else {
    if (now < state.zoneCooldownUntil) {
      zoneBtn.textContent = `🏞️ 冷却中 (${Math.ceil((state.zoneCooldownUntil - now) / 1000)}s)`;
      zoneBtn.disabled = true;
    } else {
      zoneBtn.textContent = "🏞️ 返回溪流";
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

  const workshopBtn = document.getElementById("btn-workshop");
  workshopBtn.textContent = energyExhausted ? "🔨 工坊 (精力不足)" : "🔨 工坊";

  for (const k of Object.keys(state.res)) {
    const el = document.getElementById("res-" + k);
    if (el) el.querySelector("span").textContent = Math.floor(state.res[k]);
  }

  renderFishRow();
  renderRefillRow();
  renderBaitDropdown();
  renderRefillDropdown();
  syncDropdownVisibility();
  const workshopModalEl = document.getElementById("workshop-modal");
  if (workshopModalEl && !workshopModalEl.classList.contains("hidden")) renderWorkshopModal();
}

// ====== 第一行: 钓鱼按钮 ======
function baitDefs() {
  return {
    seaweed: { label: "水草饵", bonus: 0, stock: state.res.seaweed },
    bread: { label: "面包饵", bonus: 0.10, stock: state.res.bread },
    spam: { label: "午餐肉饵", bonus: 0.10, stock: state.res.spam },
  };
}

function renderFishRow() {
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
    }
    return;
  }

  fishBtn.classList.remove("biting");
  progressWrap.classList.add("hidden");
  const defs = baitDefs();
  const cur = defs[selectedBait] || defs.seaweed;
  const chancePct = displayChancePct(Math.min(1, rodChance() + cur.bonus));
  fishBtn.textContent = `🎣 钓鱼-${cur.label} (${chancePct}%, 库存${Math.floor(cur.stock)})`;
  fishBtn.disabled = cur.stock < 1 || state.energy <= 0;
  arrowBtn.disabled = false;
}

function renderBaitDropdown() {
  const box = document.getElementById("bait-dropdown");
  box.innerHTML = "";
  const defs = baitDefs();
  const list = document.createElement("div");
  list.className = "bait-dropdown-list";
  Object.entries(defs).forEach(([key, def]) => {
    const item = document.createElement("button");
    item.className = "bait-option" + (key === selectedBait ? " selected" : "");
    item.textContent = `${def.label}${def.bonus > 0 ? ` (+${Math.round(def.bonus * 100)}%)` : ""} 库存${Math.floor(def.stock)}`;
    item.onclick = () => { selectedBait = key; baitDropdownOpen = false; updateUI(); };
    list.appendChild(item);
  });
  box.appendChild(list);
}

// ====== 第四行: 补充精力 (下拉, 列出所有食物) ======
function doRefillEat(key) {
  if (state.energy >= 100) return;
  doEat(key);
}

function renderRefillRow() {
  const btn = document.getElementById("btn-refill-toggle");
  const full = state.energy >= 100;
  btn.classList.toggle("full", full);
  btn.querySelector(".refill-btn-label").textContent = full ? "⚡ 精力已满" : "⚡ 补充精力";
}

function renderRefillDropdown() {
  const list = document.getElementById("refill-dropdown-list");
  list.innerHTML = "";
  const full = state.energy >= 100;

  const addRow = (icon, label, detail, stockText, btnLabel, onClick, disabled) => {
    const row = document.createElement("div");
    row.className = "refill-row";
    row.innerHTML = `
      <div class="refill-row-info"><span class="refill-row-icon">${icon}</span> <b>${label}</b> ${detail}<br><span class="refill-row-stock">${stockText}</span></div>
      <button class="build-btn" ${disabled ? "disabled" : ""}>${btnLabel}</button>
    `;
    // 阻止事件冒泡到 document 的"点击外部关闭下拉"监听: 否则按钮点击后这一行DOM被
    // updateUI()重新渲染替换掉, 事件冒泡时找不到原节点的父级, 会被误判为"点了外面"而关闭面板
    row.querySelector("button").onclick = (e) => { e.stopPropagation(); onClick(); };
    list.appendChild(row);
  };

  addRow("🍞", "面包", `+${FOOD_DEFS.bread.restore}精力`, `库存 ${Math.floor(state.res.bread)}`, "吃",
    () => doRefillEat("bread"), full || state.res.bread < 1);
  addRow("🥩", "午餐肉", `+${FOOD_DEFS.spam.restore}精力`, `库存 ${Math.floor(state.res.spam)}`, "吃",
    () => doRefillEat("spam"), full || state.res.spam < 1);
  addRow("🐟", "鱼", `+${FOOD_DEFS.fish.restore}精力 <span class="refill-sell-hint">⚠️ 可卖金币</span>`, `库存 ${Math.floor(state.res.fish)}`, "吃",
    () => doRefillEat("fish"), full || state.res.fish < 1);
  addRow("🥥", "椰子", `+${10}精力`, `库存 ${Math.floor(state.res.coconut)}`, "吃",
    doEatCoconutRaw, state.res.coconut < 1);
  addRow("🍢", "鱼干", "宠物食物", `库存 ${Math.floor(state.res.jerky)}`, "→喂宠物",
    () => { closeAllDropdowns(); syncDropdownVisibility(); doFeedPet(); }, !state.pet || state.res.jerky < 1);

  if (full) {
    const note = document.createElement("div");
    note.className = "refill-full-note";
    note.textContent = "精力已满";
    list.prepend(note);
  }
}

// ====== 工坊系统: 全屏弹窗, 建造/打造 两个标签 ======
function openWorkshop(tab) {
  workshopTab = tab || "build";
  renderWorkshopModal();
  document.getElementById("workshop-modal").classList.remove("hidden");
}

function renderWorkshopModal() {
  // 即使面板当前已关闭也允许刷新内容(用于成功/失败提示的延时清除)
  if (!document.getElementById("workshop-modal")) return;
  document.getElementById("workshop-tab-build").classList.toggle("active", workshopTab === "build");
  document.getElementById("workshop-tab-craft").classList.toggle("active", workshopTab === "craft");
  document.getElementById("workshop-build-pane").classList.toggle("hidden", workshopTab !== "build");
  document.getElementById("workshop-craft-pane").classList.toggle("hidden", workshopTab !== "craft");

  if (workshopTab === "build") renderWorkshopBuildGrid();
  else renderWorkshopCraftList();
}

function costLineHtml(cost) {
  return Object.entries(cost).map(([k, v]) => {
    const have = state.res[k] || 0;
    const cls = have >= v ? "cost-ok" : "cost-bad";
    return `<span class="${cls}">${ICONS[k]}${k}×${v}</span>`;
  }).join(" ");
}

function feedbackOverlayHtml(key) {
  const fb = workshopFeedback[key];
  if (!fb || Date.now() >= fb.until) return null;
  return fb.ok ? `<div class="workshop-feedback ok">✅ 建造成功</div>` : `<div class="workshop-feedback fail">❌ 材料不足</div>`;
}

function renderWorkshopBuildGrid() {
  const grid = document.getElementById("workshop-build-grid");
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
      card.innerHTML = `<div class="wcard-icon">🎣</div><div class="wcard-name">鱼竿已满级</div><div class="wcard-sub">命中率 ${displayChancePct(rodChance())}%</div><button class="wcard-btn done">✓</button>`;
    } else {
      const cost = rodUpgradeCost();
      card.innerHTML = fb || `
        <div class="wcard-icon">🎣</div>
        <div class="wcard-name">升级鱼竿 Lv.${state.rodLevel}</div>
        <div class="wcard-cost">${costLineHtml(cost)}</div>
        <div class="wcard-sub">命中率 ${displayChancePct(rodChance())}% → +5%</div>
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
    toggle.onclick = () => { collapsedBuiltOpen = !collapsedBuiltOpen; renderWorkshopBuildGrid(); };
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

function renderWorkshopCraftList() {
  const list = document.getElementById("workshop-craft-list");
  list.innerHTML = "";

  const addRecipeRow = (key, icon, label, cost, yieldObj, craftFn, allowBatch) => {
    const row = document.createElement("div");
    row.className = "wrow";
    const fb = feedbackOverlayHtml(key);
    const maxN = craftMaxAffordable(cost);
    row.innerHTML = fb || `
      <div class="wrow-info"><span class="wrow-icon">${icon}</span> <b>${label}</b><br>
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

  addRecipeRow("craft_rope", "🪢", "木头→绳子", CONFIG.ROPE_CRAFT.cost, CONFIG.ROPE_CRAFT.yield, doCraftRope, true);
  addRecipeRow("craft_kit", "🔧", "木筏修复包", CONFIG.REPAIR_KIT_CRAFT.cost, CONFIG.REPAIR_KIT_CRAFT.yield, doCraftRepairKit, false);
  if (state.builds.dryer) addRecipeRow("craft_jerky", "🥩", "鱼→鱼干", CONFIG.JERKY_CRAFT.cost, CONFIG.JERKY_CRAFT.yield, doMakeJerky, true);
  if (state.builds.furnace) addRecipeRow("smelt", "🔥", "废铁→铁块", CONFIG.SMELT_CRAFT.cost, CONFIG.SMELT_CRAFT.yield, doSmeltIron, true);

  // 椰子处理 (三种方式直接回复精力)
  const coconutRow = (key, icon, label, requireLabel, restoreText, fn, locked) => {
    const row = document.createElement("div");
    row.className = "wrow";
    const fb = feedbackOverlayHtml(key);
    row.innerHTML = fb || `
      <div class="wrow-info"><span class="wrow-icon">${icon}</span> <b>${label}</b><br>
      <span class="wrow-cost">椰子×1${requireLabel} → ${restoreText}</span></div>
      <div class="wrow-actions"><button class="wcard-btn wrow-btn1" ${locked || state.res.coconut < 1 ? "disabled" : ""}>${locked ? "🔒锁定" : "处理"}</button></div>
    `;
    if (!fb && !locked) row.querySelector(".wrow-btn1").onclick = fn;
    list.appendChild(row);
  };
  // 注: "直接吃椰子"已移到下方"补充精力"下拉里, 这里只保留需要建筑配合的两种处理方式
  coconutRow("coconut_hammer", "🔨", "锤子开椰子", "+锤子", "精力+15", doOpenCoconut, !state.builds.hammer);
  coconutRow("coconut_filter", "💧", "过滤净水", "+净水器", "精力+20", doFilterCoconutEnergy, !state.builds.purifier);

  if (!list.children.length) {
    list.innerHTML = `<div class="wrow-info" style="opacity:0.6;">暂无可打造项目</div>`;
  }

  if (state.energy <= 0) {
    list.querySelectorAll("button.wcard-btn:not(.done)").forEach(b => { b.disabled = true; b.textContent = "精力不足"; });
  }
}

// ====== 下拉面板状态管理 ======
function closeAllDropdowns() {
  baitDropdownOpen = false;
  refillDropdownOpen = false;
}
function syncDropdownVisibility() {
  document.getElementById("bait-dropdown").classList.toggle("hidden", !baitDropdownOpen);
  document.getElementById("refill-dropdown").classList.toggle("hidden", !refillDropdownOpen);
}

// ====== 浮动文字特效 ======
const floatTexts = [];
function spawnFloatingText(text) {
  floatTexts.push({ text, x: 180 + (Math.random() * 40 - 20), y: 180, life: 1.0 });
}

// ====== Canvas 场景渲染 (MC 像素方块风) ======
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
let waveOffset = 0;
const PX = 4; // 基础像素单元

// 溪流/河流背景图 (静态底图, 含石头/小岛等装饰)
const streamBgImg = new Image();
streamBgImg.src = "bg_stream.png";
const riverBgImg = new Image();
riverBgImg.src = "bg_river.png";

// 宠物动画状态 (临时, 不持久化)
let petActionUntil = 0;
let petActionType = "";
let petLastDrawPos = { x: 0, y: 0, r: 14 };

// 漂浮垃圾的像素图案 (各3x3格), 用色码字符表示
const DEBRIS_SPRITES = [
  { grid: ["GgG", "ggg", "GgG"], colors: { G: "#5fae6b", g: "#3a7d44" } },      // 海草团
  { grid: ["WwW", "www", "WwW"], colors: { W: "#caa86b", w: "#8a6a3f" } },      // 浮木块
  { grid: [".bb", "bbb", "bb."], colors: { b: "#cfe8f0" } },                   // 塑料瓶碎片
];
const debris = [];
for (let i = 0; i < 6; i++) {
  debris.push({
    x: Math.random() * 360, y: 60 + Math.random() * 300,
    speed: 0.12 + Math.random() * 0.15,
    sprite: DEBRIS_SPRITES[Math.floor(Math.random() * DEBRIS_SPRITES.length)],
  });
}

// 像素格用"相邻格边界差值"做宽高, 而不是固定 size, 避免非整数 size 时四舍五入
// 误差累积造成相邻格之间出现1px缝隙(视觉上看起来像被小方格切开)
function drawPixelGrid(grid, colors, ox, oy, size) {
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    const y0 = Math.round(oy + row * size), y1 = Math.round(oy + (row + 1) * size);
    for (let col = 0; col < line.length; col++) {
      const c = line[col];
      if (c === "." || c === " ") continue;
      const x0 = Math.round(ox + col * size), x1 = Math.round(ox + (col + 1) * size);
      ctx.fillStyle = colors[c];
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

// MC风格水面: 细腻多档渐变对角水流 + 漂移波光点 (放慢流速,避免晃眼)
// 溪流: 青绿色调; 河流: 深蓝棕色调, 偶尔有水流纹理。切换流域时颜色平滑过渡
const ZONE_PALETTE = {
  stream: { base: [47, 156, 138], light: [84, 196, 171], dark: [31, 110, 96] },
  river: { base: [58, 74, 96], light: [84, 108, 138], dark: [34, 44, 58] },
};
let waterColorT = 0; // 0=溪流, 1=河流 (用于平滑过渡)

function lerpRGB(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

// 水面波光点: 固定数量, 沿水流对角方向缓慢漂移, 营造比纯色块更细腻的水流质感
const WATER_SPARKLES = [];
for (let i = 0; i < 36; i++) {
  WATER_SPARKLES.push({
    x: Math.random() * 360, y: Math.random() * 420,
    speed: 0.04 + Math.random() * 0.06,
    size: Math.random() < 0.3 ? 2 : 1,
    twinklePhase: Math.random() * Math.PI * 2,
  });
}
const WATER_FLOW_DIR = { x: -0.6, y: -0.8 }; // 与对角条纹同向缓慢漂移

function drawWaterSparkles() {
  WATER_SPARKLES.forEach(p => {
    p.x += WATER_FLOW_DIR.x * p.speed;
    p.y += WATER_FLOW_DIR.y * p.speed;
    if (p.x < -4) p.x += 364;
    if (p.x > 364) p.x -= 364;
    if (p.y < -4) p.y += 424;
    if (p.y > 424) p.y -= 424;
    const twinkle = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(waveOffset * 0.05 + p.twinklePhase));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = "#eafff8";
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// 斜向流光层: 多条不同速度/透明度的半透明白色光带, 沿30~45度角缓慢平移, 8~12秒一个循环
const WATER_FLOW_LAYERS = [
  { angleDeg: 35, period: 28, width: 4, spacing: 140, opacity: 0.06 },
  { angleDeg: 40, period: 36, width: 3, spacing: 220, opacity: 0.05 },
];

function drawWaterFlowStreaks() {
  const t = Date.now() / 1000;
  ctx.save();
  ctx.translate(180, 210);
  WATER_FLOW_LAYERS.forEach(layer => {
    ctx.save();
    ctx.rotate((layer.angleDeg * Math.PI) / 180);
    const offset = ((t % layer.period) / layer.period) * layer.spacing;
    ctx.fillStyle = `rgba(255,255,255,${layer.opacity})`;
    for (let x = -700; x < 700; x += layer.spacing) {
      ctx.fillRect(Math.round(x + offset), -700, layer.width, 1400);
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawWater() {
  const target = state.zone === "river" ? 1 : 0;
  waterColorT += (target - waterColorT) * 0.03;
  const baseRGB = lerpRGB(ZONE_PALETTE.stream.base, ZONE_PALETTE.river.base, waterColorT);
  const lightRGB = lerpRGB(ZONE_PALETTE.stream.light, ZONE_PALETTE.river.light, waterColorT);
  const darkRGB = lerpRGB(ZONE_PALETTE.stream.dark, ZONE_PALETTE.river.dark, waterColorT);

  // 5档渐变色阶 (暗->基础->亮), 让对角水流条纹比纯色块更柔和细腻
  const STEPS = 5;
  const palette = [];
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    const rgb = t < 0.5 ? lerpRGB(darkRGB, baseRGB, t / 0.5) : lerpRGB(baseRGB, lightRGB, (t - 0.5) / 0.5);
    palette.push(`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
  }

  // 底层: 静态基础色(将来可替换为背景图)
  ctx.fillStyle = palette[2];
  ctx.fillRect(0, 0, 360, 420);

  const cell = 8;
  for (let y = 0; y < 420; y += cell) {
    for (let x = 0; x < 360; x += cell) {
      const wave = Math.sin(x * 0.05 + y * 0.09 + waveOffset * 0.12);
      const idx = Math.max(0, Math.min(STEPS - 1, Math.round((wave * 0.5 + 0.5) * (STEPS - 1))));
      if (idx === 2) continue; // 与底色相同, 省去重复填充
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, cell, cell);
    }
  }

  // 河流偶尔出现的水流纹理线 (仅河流可见)
  if (waterColorT > 0.5) {
    ctx.fillStyle = palette[0];
    for (let y = 0; y < 420; y += cell * 2) {
      for (let x = 0; x < 360; x += cell) {
        const wave = Math.sin(x * 0.05 + y * 0.09 + waveOffset * 0.12);
        if (wave > 0.8) ctx.fillRect(x, y, cell, 2);
      }
    }
  }

  // 溪流/河流背景图 (静态底图, 自带石头/小岛等装饰), 随切换流域的色调过渡交叉淡入淡出
  if (streamBgImg.complete && streamBgImg.naturalWidth > 0) {
    const streamAlpha = 1 - waterColorT;
    if (streamAlpha > 0.02) {
      ctx.globalAlpha = streamAlpha;
      ctx.drawImage(streamBgImg, 0, 0, 360, 420);
      ctx.globalAlpha = 1;
    }
  }
  if (riverBgImg.complete && riverBgImg.naturalWidth > 0) {
    const riverAlpha = waterColorT;
    if (riverAlpha > 0.02) {
      ctx.globalAlpha = riverAlpha;
      ctx.drawImage(riverBgImg, 0, 0, 360, 420);
      ctx.globalAlpha = 1;
    }
  }

  // 上层: 动态水流光影 (斜向流光带 + 细碎波光点)
  drawWaterFlowStreaks();
  drawWaterSparkles();
}

// ====== 溪流静态景物 (石头/荷叶/芦苇/小花), 位置固定、完全静止 ======
// 一次性绘制到离屏缓存, 之后每帧只 drawImage 贴图, 不重新计算几何
const STREAM_DECOR = [
  { type: "rock", x: 34, y: 62, s: 11 },
  { type: "rock", x: 54, y: 82, s: 7 },
  { type: "rock", x: 314, y: 108, s: 10 },
  { type: "rock", x: 334, y: 130, s: 6 },
  { type: "rock", x: 30, y: 338, s: 9 },
  { type: "rock", x: 322, y: 362, s: 10 },
  { type: "rock", x: 300, y: 384, s: 6 },
  { type: "lily", x: 92, y: 152, flower: true },
  { type: "lily", x: 282, y: 232 },
  { type: "lily", x: 48, y: 272, flower: true },
  { type: "lily", x: 332, y: 304 },
  { type: "reed", x: 96, y: 42 },
  { type: "reed", x: 312, y: 58 },
  { type: "reed", x: 58, y: 292 },
  { type: "reed", x: 252, y: 372 },
  { type: "flower", x: 110, y: 332 },
  { type: "flower", x: 270, y: 352 },
  { type: "flower", x: 38, y: 198 },
  { type: "flower", x: 332, y: 218 },
];

function drawRockDecor(c, x, y, s) {
  c.fillStyle = "rgba(255,255,255,0.4)";
  c.beginPath(); c.ellipse(x, y + s * 0.55, s * 1.3, s * 0.45, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#7a8088";
  c.beginPath(); c.ellipse(x, y, s, s * 0.8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#5f6770";
  c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.15, s * 0.5, s * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#4a8f5a";
  c.fillRect(Math.round(x - s * 0.4), Math.round(y - s * 0.65), Math.round(s * 0.6), Math.round(s * 0.25));
}

function drawLilyPadDecor(c, x, y, hasFlower) {
  c.fillStyle = "#5fae6b";
  c.beginPath();
  c.moveTo(x, y);
  c.arc(x, y, 9, 0.5, Math.PI * 2 - 0.5);
  c.closePath();
  c.fill();
  c.fillStyle = "#3a7d44";
  c.beginPath();
  c.moveTo(x, y);
  c.arc(x, y, 9, 0.5, 1.4);
  c.closePath();
  c.fill();
  if (hasFlower) {
    c.fillStyle = "#ff8bbf";
    c.fillRect(x - 7, y - 9, 4, 4);
    c.fillStyle = "#ffd86b";
    c.fillRect(x - 6, y - 8, 2, 2);
  }
}

// 芦苇完全静止 (不随波纹摆动), 满足"景物全部静止不动"的要求
function drawReedDecor(c, x, y) {
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 1 ? "#b8923f" : "#c4a45a";
    c.fillRect(x + i * 4, y, 2, 18 - i * 3);
    c.fillStyle = "#a9844a";
    c.fillRect(x + i * 4 - 1, y - 4, 4, 5);
  }
}

function drawFlowerDecor(c, x, y) {
  c.fillStyle = "#ff8bbf";
  c.fillRect(x - 3, y, 2, 2);
  c.fillRect(x + 1, y, 2, 2);
  c.fillRect(x - 1, y - 2, 2, 2);
  c.fillRect(x - 1, y + 2, 2, 2);
  c.fillStyle = "#ffd86b";
  c.fillRect(x - 1, y, 2, 2);
}

// 离屏缓存: 景物只在这里画一次, drawScene 每帧只需 drawImage 贴上去
const decorCanvas = document.createElement("canvas");
decorCanvas.width = 360;
decorCanvas.height = 420;
const decorCtx = decorCanvas.getContext("2d");
STREAM_DECOR.forEach(d => {
  if (d.type === "rock") drawRockDecor(decorCtx, d.x, d.y, d.s);
  else if (d.type === "lily") drawLilyPadDecor(decorCtx, d.x, d.y, d.flower);
  else if (d.type === "reed") drawReedDecor(decorCtx, d.x, d.y);
  else if (d.type === "flower") drawFlowerDecor(decorCtx, d.x, d.y);
});

function drawStreamDecor(alpha) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(decorCanvas, 0, 0);
  ctx.globalAlpha = 1;
}

// MC风格木板方块: 实色块 + 深色边框 + 木纹像素线
function drawPlankBlock(x, y, w, h, baseColor, borderColor, grainColor) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = grainColor;
  for (let gy = PX; gy < h; gy += PX * 2) {
    ctx.fillRect(x + PX, y + gy, w - PX * 2, PX * 0.6);
  }
  ctx.fillStyle = borderColor;
  ctx.fillRect(x, y, w, PX * 0.6);
  ctx.fillRect(x, y + h - PX * 0.6, w, PX * 0.6);
  ctx.fillRect(x, y, PX * 0.6, h);
  ctx.fillRect(x + w - PX * 0.6, y, PX * 0.6, h);
}

// ====== 像素建筑占位图 (临时美术, 后期替换为手绘图只需替换这些函数) ======
// 每个函数签名统一为 (x, y, s): x,y为格子左上角坐标, s为格子边长
function drawFurnaceBlock(x, y, s) {
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(x + s * 0.15, y + s * 0.35, s * 0.7, s * 0.55);
  ctx.fillStyle = "#ff6a3c";
  ctx.fillRect(x + s * 0.22, y + s * 0.15, s * 0.56, s * 0.25);
}
function drawFurnaceV2Block(x, y, s) {
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x + s * 0.15, y + s * 0.3, s * 0.7, s * 0.6);
  ctx.strokeStyle = "#ffd86b";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + s * 0.15, y + s * 0.3, s * 0.7, s * 0.6);
  ctx.fillStyle = "#ffb347";
  ctx.fillRect(x + s * 0.2, y + s * 0.12, s * 0.6, s * 0.2);
}
function drawPurifierBlock(x, y, s) {
  ctx.fillStyle = "#7fd0e8";
  ctx.fillRect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + s * 0.25, y + s * 0.15, s * 0.5, s * 0.2);
}
function drawWaterTankBlock(x, y, s) {
  ctx.fillStyle = "#6a7f99";
  ctx.fillRect(x + s * 0.25, y + s * 0.15, s * 0.5, s * 0.7);
  ctx.fillStyle = "#8aa0b8";
  ctx.fillRect(x + s * 0.25, y + s * 0.15, s * 0.5, s * 0.12);
}
function drawAutocollectorBlock(x, y, s) {
  ctx.fillStyle = "#8a5a34";
  ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
  ctx.fillStyle = "#1a3a5a";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + s * 0.1 + i * s * 0.27, y + s * 0.15, s * 0.04, s * 0.7);
    ctx.fillRect(x + s * 0.15, y + s * 0.1 + i * s * 0.27, s * 0.7, s * 0.04);
  }
}
function drawSunshadeBlock(x, y, s) {
  ctx.fillStyle = "#8a5a34";
  ctx.fillRect(x + s * 0.2, y + s * 0.5, s * 0.08, s * 0.4);
  ctx.fillRect(x + s * 0.72, y + s * 0.5, s * 0.08, s * 0.4);
  ctx.fillStyle = "#c4794a";
  ctx.beginPath();
  ctx.moveTo(x + s * 0.1, y + s * 0.5);
  ctx.lineTo(x + s * 0.5, y + s * 0.1);
  ctx.lineTo(x + s * 0.9, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
}
function drawWatchtowerBlock(x, y, s) {
  ctx.fillStyle = "#8a5a34";
  ctx.fillRect(x + s * 0.3, y + s * 0.25, s * 0.4, s * 0.7);
  ctx.fillStyle = "#c4302b";
  ctx.fillRect(x + s * 0.5, y + s * 0.05, s * 0.25, s * 0.15);
}
function drawFlagBlock(x, y, s) {
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(x + s * 0.45, y + s * 0.1, s * 0.08, s * 0.8);
  ctx.fillStyle = "#ff6a6a";
  ctx.fillRect(x + s * 0.5, y + s * 0.12, s * 0.35, s * 0.18);
  ctx.fillStyle = "#6abfff";
  ctx.fillRect(x + s * 0.5, y + s * 0.3, s * 0.35, s * 0.18);
}
function drawFlowerpotBlock(x, y, s) {
  ctx.fillStyle = "#8a5a34";
  ctx.fillRect(x + s * 0.3, y + s * 0.6, s * 0.4, s * 0.3);
  ctx.fillStyle = "#4caf50";
  ctx.fillRect(x + s * 0.35, y + s * 0.35, s * 0.3, s * 0.3);
  ctx.fillStyle = "#7ed957";
  ctx.fillRect(x + s * 0.42, y + s * 0.25, s * 0.16, s * 0.16);
}

const BUILDING_RENDERERS = {
  furnace: drawFurnaceBlock,
  purifier: drawPurifierBlock,
  autocollector: drawAutocollectorBlock,
  furnace_v2: drawFurnaceV2Block,
  water_tank: drawWaterTankBlock,
  sunshade: drawSunshadeBlock,
  watchtower: drawWatchtowerBlock,
  flag: drawFlagBlock,
  flowerpot: drawFlowerpotBlock,
};
const BUILDING_RENDER_ORDER = ["furnace", "purifier", "autocollector", "furnace_v2", "water_tank", "sunshade", "watchtower", "flag", "flowerpot"];
function isBuiltKey(key) {
  if (key === "furnace" || key === "purifier" || key === "autocollector") return !!state.builds[key];
  return !!state.raftParts[key];
}

// 木筏: 按当前流域面积动态拼成方格网, 已建成的建筑渲染对应像素占位图, 扩建出的空槽位用浅色虚线边框提示
let raftDisplayedSlots = 4;
function drawRaft() {
  const zone = state.zone;
  const targetSlots = zoneTotalSlots(zone);
  raftDisplayedSlots += (targetSlots - raftDisplayedSlots) * 0.08;

  const builtKeys = BUILDING_RENDER_ORDER.filter(isBuiltKey);
  const baseCount = zoneSlotConfig(zone).base;
  // 角色固定站在 row0/col1, 宠物(若存在)站在角色右边一格(row0/col2): 这两格永远空出来,
  // 不放建筑像素图, 否则建筑会被站在格子里的角色/宠物挡住或反过来盖住建筑
  const reservedCellCount = 1 + (state.pet ? 1 : 0);
  const effectiveSlots = Math.max(Math.round(raftDisplayedSlots), builtKeys.length + reservedCellCount, baseCount);
  const cols = Math.ceil(Math.sqrt(effectiveSlots));
  const rows = Math.ceil(effectiveSlots / cols);
  const cellSize = Math.min(34, Math.floor(210 / cols));
  const totalW = cols * cellSize, totalH = rows * cellSize;
  const raftX = Math.round(180 - totalW / 2);
  const raftY = Math.round(250 - totalH / 2 + Math.sin(waveOffset * 0.05) * 4);

  for (let i = 0; i < effectiveSlots; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = raftX + col * cellSize, cy = raftY + row * cellSize;
    const isIron = state.era === "iron" && i % 3 === 1;
    if (isIron) {
      drawPlankBlock(cx, cy, cellSize, cellSize, "#9aa4ab", "#4a5258", "#7c868c");
    } else {
      drawPlankBlock(cx, cy, cellSize, cellSize, "#b07f4a", "#5c3a1e", "#8a5e34");
    }
    if (i >= baseCount) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);
      ctx.setLineDash([]);
    }
  }

  // 角色占 col1, 宠物(若存在)占 col2 (仅当该列确实存在于当前布局时才需要避开)
  const reservedIdx = new Set([1]);
  if (state.pet && 2 < cols) reservedIdx.add(2);

  let placed = 0;
  for (let s = 0; s < effectiveSlots && placed < builtKeys.length; s++) {
    if (reservedIdx.has(s)) continue;
    const key = builtKeys[placed];
    placed++;
    const col = s % cols, row = Math.floor(s / cols);
    const cx = raftX + col * cellSize, cy = raftY + row * cellSize;
    const renderer = BUILDING_RENDERERS[key];
    if (renderer) renderer(cx, cy, cellSize);
  }

  return { raftX, raftY, cols, rows, cellSize, totalW, totalH };
}

// ====== 角色像素数据 (32x32) ======
const FEMALE_GRID = [
  "................................",
  "................................",
  "................................",
  "................................",
  ".............AAAAA..............",
  "...........AABBBBBAA............",
  ".........AABBCCBCCBBAA..........",
  ".......CABBBBBBCBBBBBBA.........",
  ".......ACBBBBBBBBBBBBBBA........",
  ".......BBBBBBBBBBBBBBBBA........",
  "......ABBBBBBBBBBBBBBBBBA.......",
  "......ABBBBBBBBBBBBBBBBBA.......",
  ".....ABBBBBBBBBCBBBBBBBBBA......",
  ".....ABBBBBBCBBDCBBBBBBBBA......",
  ".....ABBBBBBDBBDDBDBBBBBBA......",
  ".....ABBBBCDDDBDDDDDCBBBBC......",
  ".....ABEBBDAAADDDAAADBFEBAC.....",
  ".....ABEFBDEGGDDDGGEDBFEBA......",
  "......BAHBFEIIFFFIIEFBHAB.......",
  "........AAHFDDDDDDDFHAA.........",
  ".........BBBBAEJEABBBB..........",
  ".........BC.AJJKJJA.CB..........",
  "...........ALJJJJJLA............",
  "..........AHDLLLLLDHA...........",
  "...........AADDADDAA............",
  "............AHHAHHA.............",
  ".............AA.AA..............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];
const MALE_GRID = [
  "................................",
  "................................",
  "................................",
  "................................",
  ".............AAAAA..............",
  "...........AABBBBBAA............",
  ".........AABBCCBCCBBAA..........",
  "........ABBBBBBCBBBBBBA.........",
  ".......ACBBBBBBBBBBBBBBA........",
  ".......CBBBBBBBBBBBBBBBA........",
  "......ACBBBBBBBBBBBBBBBBA.......",
  "......BCBBBBBBBBBBBBBBBBB.......",
  ".....ABBBBBBBBBCBBBBBBBBBA......",
  ".....ABBBBBBCBBDCBBBBBBBBA......",
  ".....ABBBBBBDBBDDBDBBBBBBA......",
  "......BBBBCDDDBDDDDDCBBBB.......",
  "......ABCBDAAADDDAAADBCBA.......",
  "......ACEBDFGGDDDGGFDDEBA.......",
  ".......AHDEFIIEEEIIFEDHA........",
  "........AAHEDDDDDDDEHAA.........",
  ".............AFJFA..............",
  "............AFFKFFA.............",
  "...........ALFFFFFLA............",
  "..........AHDLLALLDHA...........",
  "...........AADDADDAA............",
  "............AHHAHHA.............",
  ".............AA.AA..............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

// 固定不可换颜色 + 当前换装颜色拼合
function buildCharColors() {
  const hair = COSTUME_OPTIONS.hairColor[costumeState.hairColor] || COSTUME_OPTIONS.hairColor.pink;
  const eye = COSTUME_OPTIONS.eyeColor[costumeState.eyeColor] || COSTUME_OPTIONS.eyeColor.green;
  const outfit = COSTUME_OPTIONS.outfitColor[costumeState.outfitColor] || COSTUME_OPTIONS.outfitColor.pink;
  return Object.assign({}, CHAR_FIXED_COLORS, {
    B: hair.B, C: hair.C, G: eye.G, I: eye.I, F: outfit.F, H: outfit.H,
  });
}

const RAINBOW_COLORS = ["#ff6b6b", "#ffb347", "#ffe066", "#5bd17a", "#6bc6ff", "#9c6bcc"];

function defaultCharColors() {
  const hair = COSTUME_OPTIONS.hairColor.pink, eye = COSTUME_OPTIONS.eyeColor.green, outfit = COSTUME_OPTIONS.outfitColor.pink;
  return Object.assign({}, CHAR_FIXED_COLORS, { B: hair.B, C: hair.C, G: eye.G, I: eye.I, F: outfit.F, H: outfit.H });
}

// 通用角色网格绘制 (供正式渲染与选角预览复用)
function drawCharGrid(grid, colors, cx, cy, size, rainbow) {
  const ox = cx - size * 16, oy = cy - size * 27;
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    const y0 = Math.round(oy + row * size), y1 = Math.round(oy + (row + 1) * size);
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === "." || ch === " ") continue;
      if (rainbow && (ch === "B" || ch === "C")) {
        ctx.fillStyle = RAINBOW_COLORS[(row + col) % RAINBOW_COLORS.length];
      } else {
        ctx.fillStyle = colors[ch] || "#ff00ff";
      }
      const x0 = Math.round(ox + col * size), x1 = Math.round(ox + (col + 1) * size);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

function drawCharacter(cx, cy) {
  const size = 2.0;
  const grid = state.character === "male" ? MALE_GRID : FEMALE_GRID;
  drawCharGrid(grid, buildCharColors(), cx, cy, size, costumeState.hairColor === "rainbow");
  drawAccessory(cx, cy, costumeState.accessory, size);
}

// 让角色"装在格子里": 以格子中心(cyCenter)为基准, 按给定 size 居中绘制
// (drawCharGrid/drawAccessory 内部用的是"脚底"式锚点 cy - size*27, 这里换算成视觉居中)
function drawCharacterCentered(cx, cyCenter, size) {
  const grid = state.character === "male" ? MALE_GRID : FEMALE_GRID;
  const cy = cyCenter + size * 12;
  drawCharGrid(grid, buildCharColors(), cx, cy, size, costumeState.hairColor === "rainbow");
  drawAccessory(cx, cy, costumeState.accessory, size);
}

// 选角界面预览: 不依赖/不修改全局 state, 始终用默认配色展示
function drawCharacterPreview(cx, cy, gender, size) {
  const grid = gender === "male" ? MALE_GRID : FEMALE_GRID;
  drawCharGrid(grid, defaultCharColors(), cx, cy, size, false);
}

// 配件绘制 (在角色头顶额外画一层像素装饰, 不修改角色 GRID 本身)
function drawAccessory(cx, cy, type, size) {
  if (!type || type === "none") return;
  const topX = cx - size * 16, topY = cy - size * 27 + size * 4; // 大致对齐头顶区域(grid row4起)
  if (type === "hat") {
    ctx.fillStyle = "#2a1f16";
    ctx.fillRect(topX + size * 11, topY - size * 2.4, size * 10, size * 2.4);
    ctx.fillStyle = "#1a120a";
    ctx.fillRect(topX + size * 10, topY - size * 0.6, size * 12, size * 0.8);
  } else if (type === "flower") {
    ctx.fillStyle = "#ff6fa5";
    ctx.fillRect(topX + size * 21, topY - size * 0.6, size * 1.6, size * 1.6);
    ctx.fillStyle = "#ffd86b";
    ctx.fillRect(topX + size * 21.5, topY - size * 0.1, size * 0.6, size * 0.6);
  } else if (type === "star") {
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(topX + size * 14.5, topY - size * 2.4, size * 1.6, size * 1.6);
    ctx.fillRect(topX + size * 13, topY - size * 1, size * 4.6, size * 1);
  } else if (type === "crown") {
    ctx.fillStyle = "#ffd86b";
    ctx.fillRect(topX + size * 10.5, topY - size * 2.2, size * 11, size * 2.2);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(topX + size * 12, topY - size * 3.2, size * 1.4, size * 1.4);
    ctx.fillRect(topX + size * 15.3, topY - size * 3.6, size * 1.4, size * 1.4);
    ctx.fillRect(topX + size * 18.6, topY - size * 3.2, size * 1.4, size * 1.4);
  } else if (type === "bow") {
    ctx.fillStyle = "#ff6fa5";
    ctx.fillRect(topX + size * 19, topY - size * 1.2, size * 2, size * 1.6);
    ctx.fillRect(topX + size * 22, topY - size * 1.2, size * 2, size * 1.6);
    ctx.fillStyle = "#d44d80";
    ctx.fillRect(topX + size * 21, topY - size * 0.8, size * 1, size * 1);
  }
}

// ====== 宠物像素数据 (32x32, 内容集中在中部, 其余为空) ======
const CAT_GRID = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............A....A.............",
  "............ABAAAABA............",
  "............ABBBBBBA............",
  "...........ABBCBBCBBA...........",
  "...........ABDEFFEDBA...........",
  "...........AFFFFFFFFA...........",
  "............AFFFFFFA............",
  ".............AFGGFA.FB..........",
  ".............AFGGFAF............",
  "............AFFFFFFA............",
  "............AFBFFBFA............",
  ".............AAAAAA.............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];
const CAT_COLORS = { A: "#000000", B: "#d4a653", C: "#929e42", D: "#e8cdcc", E: "#b3bf65", F: "#ddbe86", G: "#faefed" };

const DOG_GRID = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............A....A.............",
  "............ABAAAABA............",
  "...........ABBBBBBBBA...........",
  "...........ABBCBBCBBA...........",
  "...........ABDEFFEDBA...........",
  "...........AFFFAAFFFA...........",
  "............AFFFFFFA............",
  ".............AFGGFA.............",
  ".............AFGGFABBB..........",
  "............AFFFFFFABB..........",
  "...........AFFBFFBFFAB..........",
  "............AAAAAAAA............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];
const DOG_COLORS = { A: "#000000", B: "#d4a653", C: "#929e42", D: "#e8cdcc", E: "#b3bf65", F: "#ddbe86", G: "#faefed" };

const BIRD_GRID = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "............AAAA................",
  "...........ABBBBA...............",
  "..........ABBBBBBA..............",
  ".........CCBCBBBBA..............",
  "..........ABCBBBBBA.............",
  "..........ABBBBBBBA.............",
  "..........ABBDBBBBDA............",
  "..........ABBDBBBDEF............",
  "...........ABBDDDEEF............",
  "............ABADDFFF............",
  ".............C.C................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];
const BIRD_COLORS = { A: "#000000", B: "#ddbe86", C: "#a67b68", D: "#d4a653", E: "#b3bf65", F: "#929e42" };

const PET_GRIDS = {
  cat: { grid: CAT_GRID, colors: CAT_COLORS },
  dog: { grid: DOG_GRID, colors: DOG_COLORS },
  bird: { grid: BIRD_GRID, colors: BIRD_COLORS },
};

// 宠物渲染 (像素图 + 轻微跳动动画)
function drawPetBlock(cx, cy, type, mood, size) {
  size = size || 1.3;
  const bounce = (petActionType && Date.now() < petActionUntil) ? Math.abs(Math.sin((petActionUntil - Date.now()) * 0.02) * 4) : 0;
  const y = cy - bounce;
  const def = PET_GRIDS[type] || PET_GRIDS.cat;
  drawPixelGrid(def.grid, def.colors, cx - size * 16, y - size * 16, size);

  if (mood === "sad") {
    ctx.fillStyle = "#6bc6ff";
    ctx.fillRect(cx - size * 4, y + size * 4, size * 1.4, size * 2);
  }

  petLastDrawPos = { x: cx, y, r: size * 16 };
}

// ====== 开局选择: 角色 / 宠物 (绘制在 canvas 上, 无存档时触发) ======
let onboardingStep = null; // null | "character" | "pet"
const ONBOARD_BOXES_2 = [
  { x: 30, y: 90, w: 140, h: 220, key: "female", label: "女生" },
  { x: 190, y: 90, w: 140, h: 220, key: "male", label: "男生" },
];
const ONBOARD_BOXES_3 = [
  { x: 14, y: 110, w: 106, h: 190, key: "cat", label: "🐱 小橘猫" },
  { x: 128, y: 110, w: 106, h: 190, key: "dog", label: "🐶 小狗" },
  { x: 242, y: 110, w: 106, h: 190, key: "bird", label: "🐦 小鸟" },
];

function drawOnboardBox(box, selected) {
  ctx.fillStyle = "#0e2030";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = selected ? "#ffd86b" : "#2a4a64";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
}

function drawCharacterSelectScreen() {
  ctx.fillStyle = "#16324a";
  ctx.fillRect(0, 0, 360, 420);
  ctx.fillStyle = "#ffd86b";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("选择你的角色", 180, 48);
  ONBOARD_BOXES_2.forEach(box => {
    drawOnboardBox(box, false);
    drawCharacterPreview(box.x + box.w / 2, box.y + box.h / 2 + 35, box.key, 3.0);
    ctx.fillStyle = "#eef6ff";
    ctx.font = "14px sans-serif";
    ctx.fillText(box.label, box.x + box.w / 2, box.y + box.h - 14);
  });
  ctx.textAlign = "left";
}

function drawPetSelectScreen() {
  ctx.fillStyle = "#16324a";
  ctx.fillRect(0, 0, 360, 420);
  ctx.fillStyle = "#ffd86b";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("选择你的宠物伙伴", 180, 48);
  ONBOARD_BOXES_3.forEach(box => {
    drawOnboardBox(box, false);
    drawPetBlock(box.x + box.w / 2, box.y + box.h / 2 + 20, box.key, "happy");
    ctx.fillStyle = "#eef6ff";
    ctx.font = "13px sans-serif";
    ctx.fillText(box.label, box.x + box.w / 2, box.y + box.h - 14);
  });
  ctx.textAlign = "left";
}

function pointInBox(px, py, box) {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

function startOnboardingIfNeeded() {
  if (!state.character) onboardingStep = "character";
  else if (!state.pet) onboardingStep = "pet";
  else onboardingStep = null;
}

function handleOnboardingClick(cx, cy) {
  if (onboardingStep === "character") {
    const box = ONBOARD_BOXES_2.find(b => pointInBox(cx, cy, b));
    if (!box) return;
    state.character = box.key;
    costumeState.gender = box.key;
    saveCostume();
    save();
    onboardingStep = state.pet ? null : "pet";
    return;
  }
  if (onboardingStep === "pet") {
    const box = ONBOARD_BOXES_3.find(b => pointInBox(cx, cy, b));
    if (!box) return;
    choosePet(box.key);
    onboardingStep = null;
    updateUI();
  }
}

let lastRippleSpawnAt = 0;

function drawScene() {
  if (onboardingStep === "character") { drawCharacterSelectScreen(); requestAnimationFrame(drawScene); return; }
  if (onboardingStep === "pet") { drawPetSelectScreen(); requestAnimationFrame(drawScene); return; }

  if (fishingState !== "idle") renderFishRow();
  updateBottleDrift();

  ctx.clearRect(0, 0, 360, 420);
  drawWater();
  // 注: 静态石头/荷叶/芦苇/小花已经画进 bg_stream.png 背景图里了, 不再额外叠一层程序绘制的装饰

  debris.forEach(d => {
    d.x -= d.speed;
    if (d.x < -20) d.x = 380;
    drawPixelGrid(d.sprite.grid, d.sprite.colors, d.x, d.y, 4);
  });

  const raftLayout = drawRaft();
  const raftTopY = raftLayout.raftY;
  const raftBottomY = raftLayout.raftY + raftLayout.totalH;

  // 角色站在木筏第一排第二格 (row0, col1), 保持原有大小, 以格子中心为基准居中绘制
  const charSize = 2.0;
  const charX = Math.round(raftLayout.raftX + raftLayout.cellSize * 1.5);
  const cellCenterY = raftTopY + raftLayout.cellSize / 2;
  const bobY = Math.round(cellCenterY + Math.sin(waveOffset * 0.08) * 1.5);
  drawCharacterCentered(charX, bobY, charSize);

  // 钓鱼线 (随抛线/收线动画伸缩, 咬钩时显示"!"提示, 等待时偶尔起波纹)
  if (state.builds.rod) {
    const now = Date.now();
    let lineProgress = 1;
    if (fishingState === "casting") {
      lineProgress = fishingPhaseDur > 0 ? Math.min(1, 1 - (fishingPhaseUntil - now) / fishingPhaseDur) : 1;
    } else if (fishingState === "pulling") {
      lineProgress = fishingPhaseDur > 0 ? Math.max(0, (fishingPhaseUntil - now) / fishingPhaseDur) : 0;
    }
    const handX = charX + 6;
    const hookX = Math.min(360 - 10, raftLayout.raftX + raftLayout.totalW + 6);
    const hookYFull = raftBottomY + 10;
    ctx.fillStyle = "#cccccc";
    for (let t = 0; t < lineProgress; t += 0.08) {
      const lx = Math.round(handX + (hookX - handX) * t);
      const ly = Math.round(bobY + 6 + (hookYFull - bobY - 6) * t);
      ctx.fillRect(lx, ly, 2, 2);
    }
    if (lineProgress > 0.95) {
      ctx.fillStyle = "#999";
      ctx.fillRect(hookX - 2, hookYFull, 4, 4);
    }
    if (fishingState === "biting") {
      ctx.fillStyle = "#ffd86b";
      ctx.font = "bold 16px monospace";
      ctx.fillText("!", hookX - 3, hookYFull - 10);
    }
    if (fishingState === "waiting" && now - lastRippleSpawnAt > 500) {
      lastRippleSpawnAt = now;
      fishRipples.push({ x: hookX + (Math.random() * 16 - 8), y: hookYFull + (Math.random() * 6 - 3), life: 1.0 });
    }
  }
  for (let i = fishRipples.length - 1; i >= 0; i--) {
    const r = fishRipples[i];
    r.life -= 0.04;
    if (r.life <= 0) { fishRipples.splice(i, 1); continue; }
    ctx.globalAlpha = r.life * 0.6;
    ctx.strokeStyle = "#dff3ff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 3 + (1 - r.life) * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 木筏彩旗 (商店购买的装饰, 固定立在木筏左侧)
  if (state.shopOwned.includes("flag")) {
    const poleX = Math.max(8, 180 - raftLayout.totalW / 2 - 10);
    ctx.fillStyle = "#8a5a34";
    ctx.fillRect(poleX, raftTopY - 28, 3, 28);
    const flagFlap = Math.sin(waveOffset * 0.3) * 2;
    ctx.fillStyle = "#ff6a6a";
    ctx.fillRect(poleX + 3, raftTopY - 28, 14 + flagFlap, 8);
    ctx.fillStyle = "#6abfff";
    ctx.fillRect(poleX + 3, raftTopY - 20, 14 + flagFlap, 8);
  }

  if (state.pet) {
    // 宠物站在角色右侧相邻格, 保持原有大小, 与角色同一基线高度
    const petX = Math.min(360 - 16, charX + raftLayout.cellSize);
    drawPetBlock(petX, bobY, state.pet.type, petMood(), 1.3);
  }

  drawDriftBottle();

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.y -= 0.8;
    f.life -= 0.02;
    if (f.life <= 0) { floatTexts.splice(i, 1); continue; }
    ctx.globalAlpha = f.life;
    ctx.fillStyle = "#ffd86b";
    ctx.font = "bold 13px monospace";
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  waveOffset += 0.15;
  requestAnimationFrame(drawScene);
}

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  if (onboardingStep) {
    handleOnboardingClick(cx, cy);
    return;
  }

  if (bottleHit(cx, cy)) {
    openBottleModal();
    return;
  }

  const dx = cx - petLastDrawPos.x, dy = cy - petLastDrawPos.y;
  if (state.pet && Math.sqrt(dx * dx + dy * dy) <= petLastDrawPos.r) {
    doPetInteract();
    return;
  }
  doFishLoot();
});

// ====== 主循环 (挂机 tick) ======
function gameTick() {
  if (onboardingStep) { state.lastTick = Date.now(); return; }
  const now = Date.now();
  const deltaSec = Math.min(60, (now - state.lastTick) / 1000);
  state.lastTick = now;

  // 静置休息回复精力: 30秒不操作回复+2, 有上限(满精力时不再触发)
  if (now - state.lastActionAt >= 30000 && state.energy < 100) {
    state.restAccum += deltaSec;
    while (state.restAccum >= 30) {
      state.restAccum -= 30;
      state.energy = Math.min(100, state.energy + 2);
    }
  } else if (state.energy >= 100) {
    state.restAccum = 0;
  }

  // 精力耗尽后的被动缓慢恢复: 每30秒+5, 不论玩家是否在操作 (反正按钮都禁用了)
  if (state.energy <= 0) {
    state.zeroEnergyRegenAccum += deltaSec;
    while (state.zeroEnergyRegenAccum >= CONFIG.ENERGY_REGEN_INTERVAL) {
      state.zeroEnergyRegenAccum -= CONFIG.ENERGY_REGEN_INTERVAL;
      state.energy = Math.min(100, state.energy + CONFIG.ENERGY_REGEN_AMOUNT);
    }
  } else {
    state.zeroEnergyRegenAccum = 0;
  }

  if (state.builds.autocollector) {
    const eff = efficiency();
    let gain = deltaSec * 0.6 * eff;
    if (state.skills.build.automation_master) gain += deltaSec * 0.3; // 自动化大师占位加成
    state.res.wood += gain;
    state.res.rope += gain * 0.6;
    if (Math.random() < deltaSec * 0.02) state.res.scrap += 1;
  }

  if (state.builds.purifier) {
    state.purifierAccum += deltaSec;
    const interval = 20; // 每20秒尝试产1单位净水
    while (state.purifierAccum >= interval) {
      state.purifierAccum -= interval;
      if (state.res.plastic >= 1) {
        state.res.plastic -= 1;
        state.res.water += 1;
      }
    }
  }

  // 美观度: 每分钟小概率触发"路过的小鱼群/好奇的海鸥"漂流礼物
  state.beautyGiftAccum += deltaSec;
  while (state.beautyGiftAccum >= 60) {
    state.beautyGiftAccum -= 60;
    const giftChance = Math.min(0.10, state.raftStats.beauty * 0.01);
    if (Math.random() < giftChance) {
      if (Math.random() < 0.5) {
        state.res.fish += 2;
        toast(`🐠 路过的小鱼群留下了 🐟+2`);
      } else {
        const gift = pick(LOOT_TABLE_STONE);
        addRes(gift);
        toast(`🦅 好奇的海鸥叼来了: ${resLine(gift)}`);
      }
    }
  }

  // 宠物: 饱食度衰减 + 满饱食偶尔叼礼物
  if (state.pet) {
    state.petDecayAccum += deltaSec;
    while (state.petDecayAccum >= CONFIG.PET_DECAY_INTERVAL) {
      state.petDecayAccum -= CONFIG.PET_DECAY_INTERVAL;
      const before = state.pet.satiety;
      state.pet.satiety = Math.max(0, state.pet.satiety - CONFIG.PET_DECAY_AMOUNT);
      if (before > 0 && state.pet.satiety === 0) unlockAchievement("pet_starve");
    }
    state.petGiftAccum += deltaSec;
    while (state.petGiftAccum >= 60) {
      state.petGiftAccum -= 60;
      if (state.pet.satiety >= 100 && Math.random() < CONFIG.PET_GIFT_CHANCE_PER_MIN) {
        const gift = pick(LOOT_TABLE_STONE);
        addRes(gift);
        toast(`${PET_TYPES[state.pet.type].icon} ${PET_TYPES[state.pet.type].name}叼来了一份小礼物: ${resLine(gift)}`);
      }
    }
  }

  // 暴风雨"赌一把"窗口到期: 强制送回溪流
  if (state.stormForceReturnAt && now >= state.stormForceReturnAt) {
    state.stormForceReturnAt = 0;
    if (state.zone === "river") {
      state.zone = "stream";
      state.currentBuff = null;
      state.castStreak = 0;
      state.stats.forceExitCount.river += 1;
      unlockAchievement("first_force_exit");
      if (state.stats.forceExitCount.river >= 3) unlockAchievement("force_exit_3");
      toast("⛈️ 暴风雨追了上来,木筏被冲回了溪流!");
    }
  }

  // 突发事件随机触发 (溪流/河流各自的事件池, 90~150秒一次)
  if (now >= state.nextEventAt && !isModalOpen()) {
    triggerRandomEvent();
    state.nextEventAt = now + 90000 + Math.random() * 60000;
  }

  // 成就检测 (静置/同流域停留时长), 每30秒检查一次
  state.stats.achievementCheckAccum += deltaSec;
  while (state.stats.achievementCheckAccum >= 30) {
    state.stats.achievementCheckAccum -= 30;
    checkIdleAchievements(now);
  }

  // 漂流瓶引导检测, 每60秒一次
  bottleCheckAccum += deltaSec;
  if (bottleCheckAccum >= 60) {
    bottleCheckAccum = 0;
    checkBottleConditions();
  }

  updateUI();
  save();
}

// ====== 初始化 ======
load();
loadCostume();
document.getElementById("btn-fish-loot").onclick = doFishLoot;
document.getElementById("btn-rummage").onclick = doRummage;
document.getElementById("btn-zone-switch").onclick = doZoneSwitch;
document.getElementById("btn-bestiary").onclick = () => {
  renderBestiary();
  document.getElementById("bestiary-modal").classList.remove("hidden");
};
document.getElementById("bestiary-close").onclick = () => {
  document.getElementById("bestiary-modal").classList.add("hidden");
};
document.getElementById("btn-blueprints").onclick = () => {
  renderBlueprints();
  document.getElementById("blueprint-modal").classList.remove("hidden");
};
document.getElementById("blueprint-close").onclick = () => {
  document.getElementById("blueprint-modal").classList.add("hidden");
};
document.getElementById("btn-skilltree").onclick = () => {
  renderSkillTree();
  document.getElementById("skilltree-modal").classList.remove("hidden");
};
document.getElementById("skilltree-close").onclick = () => {
  document.getElementById("skilltree-modal").classList.add("hidden");
};
document.getElementById("btn-achievements").onclick = () => {
  renderAchievements();
  document.getElementById("achievement-modal").classList.remove("hidden");
};
document.getElementById("achievement-close").onclick = () => {
  document.getElementById("achievement-modal").classList.add("hidden");
};
document.getElementById("btn-costume").onclick = () => {
  if (!state.mirrorUnlocked) return;
  renderCostumeModal();
  document.getElementById("costume-modal").classList.remove("hidden");
};
document.getElementById("costume-close").onclick = () => {
  document.getElementById("costume-modal").classList.add("hidden");
};
document.getElementById("event-close").onclick = () => {
  document.getElementById("event-modal").classList.add("hidden");
};
document.getElementById("btn-shop").onclick = () => {
  renderShopModal();
  document.getElementById("shop-modal").classList.remove("hidden");
};
document.getElementById("shop-close").onclick = () => {
  document.getElementById("shop-modal").classList.add("hidden");
};
document.getElementById("shop-tab-sell").onclick = () => { shopTab = "sell"; renderShopModal(); };
document.getElementById("shop-tab-buy").onclick = () => { shopTab = "buy"; renderShopModal(); };
startOnboardingIfNeeded();

// ====== 核心操作区: 钓鱼/工坊/补充精力 绑定 ======
document.getElementById("btn-fish-cast").onclick = () => doFishing(selectedBait);
document.getElementById("btn-bait-arrow").onclick = () => {
  baitDropdownOpen = !baitDropdownOpen;
  refillDropdownOpen = false;
  syncDropdownVisibility();
};
document.getElementById("btn-refill-toggle").onclick = () => {
  refillDropdownOpen = !refillDropdownOpen;
  baitDropdownOpen = false;
  renderRefillDropdown();
  syncDropdownVisibility();
};
document.getElementById("refill-dropdown-close").onclick = () => { refillDropdownOpen = false; syncDropdownVisibility(); };

document.getElementById("btn-workshop").onclick = () => openWorkshop("build");
document.getElementById("workshop-close").onclick = () => {
  document.getElementById("workshop-modal").classList.add("hidden");
};
document.getElementById("workshop-tab-build").onclick = () => { workshopTab = "build"; renderWorkshopModal(); };
document.getElementById("workshop-tab-craft").onclick = () => { workshopTab = "craft"; renderWorkshopModal(); };

document.getElementById("bottle-close").onclick = () => {
  document.getElementById("bottle-modal").classList.add("hidden");
};
document.getElementById("bottle-claim").onclick = claimBottleReward;

// 点击下拉面板/按钮以外的区域, 自动收起所有下拉
document.addEventListener("click", (e) => {
  if (e.target.closest(".dropdown-root")) return;
  if (baitDropdownOpen || refillDropdownOpen) {
    closeAllDropdowns();
    syncDropdownVisibility();
  }
});
raftDisplayedSlots = zoneTotalSlots(state.zone);
updateUI();
drawScene();
setInterval(gameTick, 1000);
