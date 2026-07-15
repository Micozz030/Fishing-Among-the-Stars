// ====== data.js: 静态定义 (鱼类/事件/成就/图纸/商店/文案等), 不依赖 state/actions/ui ======
// 仅 import config.js (用于 RAFT_PART_COST_MULTIPLIER 等常量), 不做任何 DOM/state 操作

import { CONFIG } from "./config.js";

// ====== 打捞表 (基础资源, 拉钩打捞每次从中抽一种) ======
export const LOOT_TABLE_STONE = [
  { wood: 1 }, { wood: 2 }, { rope: 1 }, { scrap: 1 },
  { wood: 1, rope: 1 }, { seaweed: 1 }, { seaweed: 2 }, { plastic: 1 },
  { trash: 1 }, { trash: 2 },
];
export const LOOT_TABLE_IRON = [
  { wood: 2 }, { wood: 3 }, { rope: 2 }, { scrap: 2 }, { iron: 1 },
  { seaweed: 2 }, { plastic: 2 }, { trash: 1 }, { trash: 2 },
];

// 翻垃圾专用掉落表: 废铁/铁块权重明显高于普通打捞
export const RUMMAGE_TABLE_STONE = [
  { scrap: 2 }, { scrap: 1 }, { scrap: 1 }, { scrap: 2 },
  { wood: 1 }, { rope: 1 }, { scrap: 1, wood: 1 },
];
export const RUMMAGE_TABLE_IRON = [
  { scrap: 2 }, { iron: 1 }, { scrap: 1 }, { iron: 1 },
  { scrap: 2 }, { wood: 2 }, { rope: 1 },
];

export const CHEST_LOOT = [
  { label: "一卷结实的麻绳", res: { rope: 3 } },
  { label: "半截浸水的木料", res: { wood: 4 } },
  { label: "一把锈蚀的废铁片", res: { scrap: 3 } },
  { label: "意外完好的铁块", res: { iron: 1 } },
];

export const ANACHRONISMS = [
  { label: "🥫 一罐真空包装的午餐肉（不知为何漂到这里）", res: { spam: 1, wood: 2 } },
  { label: "🔋 一节锈迹斑斑但仍有电的电池", res: { scrap: 4, iron: 1 } },
  { label: "🧮 一个掉了漆的太阳能计算器", res: { iron: 2 } },
];

export const RUMMAGE_JOKES = [
  "翻到了一只臭袜子",
  "一个破瓶子,扔回去了",
  "什么都没有,只有海风",
  "翻到了上一个漂流者的日记,字迹模糊看不清",
  "一团破渔网,没有利用价值",
];

export const FISH_ESCAPE_JOKES = ["跑了!手慢了一步", "差一点……", "这条鱼太狡猾了"];

// ====== 图纸 / 木筏部件 ======
export const BLUEPRINTS = {
  bp_autocollector_v2: { name: "自动收集网升级版", icon: "🔧", category: "basic" },
  bp_furnace_v2: { name: "强化熔炉", icon: "🔧", category: "basic" },
  bp_water_tank: { name: "储水大桶", icon: "🔧", category: "basic" },
  bp_raft_extension: { name: "木筏扩展板", icon: "🪵", category: "structural" },
  bp_watchtower: { name: "瞭望台", icon: "🪵", category: "structural" },
  bp_sunshade: { name: "遮阳篷", icon: "🪵", category: "structural" },
  bp_flag: { name: "彩色旗帜", icon: "✨", category: "decorative" },
  bp_flowerpot: { name: "花盆角落", icon: "✨", category: "decorative" },
};
export const BP_CATEGORY_LABEL = { basic: "基础", structural: "结构", decorative: "装饰" };

export const RAFT_PARTS = [
  { key: "autocollector_v2", bp: "bp_autocollector_v2", name: "自动收集网升级版", desc: "提升木筏速度值,缩短流域切换冷却时间", cost: { iron: 6, rope: 4 }, stats: { speed: 2, sturdy: 0, beauty: 0 } },
  { key: "furnace_v2", bp: "bp_furnace_v2", name: "强化熔炉", desc: "提升木筏牢固度,降低突发事件的负面影响", cost: { iron: 4, scrap: 6 }, stats: { speed: 0, sturdy: 2, beauty: 0 } },
  { key: "water_tank", bp: "bp_water_tank", name: "储水大桶", desc: "同时提升速度和牢固度,木筏更经得起折腾", cost: { plastic: 6, wood: 6 }, stats: { speed: 1, sturdy: 1, beauty: 0 } },
  { key: "raft_extension", bp: "bp_raft_extension", name: "木筏扩展板", desc: "大幅提升牢固度,加固船身结构", cost: { wood: 14, rope: 6 }, stats: { speed: 0, sturdy: 3, beauty: 0 } },
  { key: "watchtower", bp: "bp_watchtower", name: "瞭望台", desc: "提升速度值,站得高看得远", cost: { wood: 10, iron: 2 }, stats: { speed: 2, sturdy: 0, beauty: 0 } },
  { key: "sunshade", bp: "bp_sunshade", name: "遮阳篷", desc: "略微提升牢固度和美观度", cost: { wood: 8, rope: 3 }, stats: { speed: 0, sturdy: 1, beauty: 1 } },
  { key: "flag", bp: "bp_flag", name: "彩色旗帜", desc: "纯装饰,提升美观度,有机会引来漂流礼物", cost: { rope: 5, plastic: 3 }, stats: { speed: 0, sturdy: 0, beauty: 3 } },
  { key: "flowerpot", bp: "bp_flowerpot", name: "花盆角落", desc: "纯装饰,提升美观度,有机会引来漂流礼物", cost: { wood: 4, seaweed: 4 }, stats: { speed: 0, sturdy: 0, beauty: 3 } },
];
// 图纸建筑材料成本统一翻倍 (调整 CONFIG.RAFT_PART_COST_MULTIPLIER 即可整体平衡)
RAFT_PARTS.forEach(p => {
  for (const k in p.cost) p.cost[k] *= CONFIG.RAFT_PART_COST_MULTIPLIER;
});

// ====== 建筑/科技树 ======
// repeatable: false 表示一次性建成后不可重复建造 (用于建造面板"已建造"折叠隐藏)
export const BUILDS = [
  { key: "net", icon: "🪝", name: "绳网", desc: "升级打捞工具,手动捞取产出 +50%", cost: { wood: 6, rope: 4 }, repeatable: false },
  { key: "furnace", icon: "🔥", name: "简易熔炉", desc: "解锁熔炼铁块功能,消耗废铁炼出铁块", cost: { wood: 10, scrap: 6 }, repeatable: false },
  { key: "autocollector", icon: "⚙️", name: "自动收集网", desc: "解锁挂机自动打捞!跃升进入铁器时代", cost: { iron: 3, rope: 6, wood: 8 }, requireBuild: "furnace", repeatable: false },
  { key: "rod", icon: "🎣", name: "简易鱼竿", desc: "解锁钓鱼,用水草当鱼饵,初始命中率60%", cost: { wood: 10, iron: 3 }, repeatable: false },
  { key: "hammer", icon: "🔨", name: "锤子", desc: "解锁敲开椰子,直接回复精力", cost: { wood: 3, iron: 3 }, repeatable: false },
  { key: "purifier", icon: "🚰", name: "净水过滤器", desc: "被动缓慢产出净水 (每次消耗1塑料存储)", cost: { plastic: 5, wood: 5 }, repeatable: false },
  { key: "dryer", icon: "🍢", name: "晒鱼架", desc: "解锁晒鱼干,鱼x3 → 鱼干x1 (宠物食物)", cost: { wood: 8, rope: 3 }, repeatable: false },
];

// ====== 宠物系统 ======
export const PET_TYPES = {
  cat: { name: "小橘猫", icon: "🐱" },
  dog: { name: "小狗", icon: "🐶" },
  bird: { name: "小鸟", icon: "🐦" },
};

// ====== 鱼类图鉴数据 ======
export const FISH_PIXEL_GRIDS = {
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

export const FISH = {
  trout: { name: "小溪鳟鱼", icon: "🐟", rarity: "common", zones: ["stream"], lengthMult: 1.0 },
  stripey: { name: "石斑小鱼", icon: "🐠", rarity: "common", zones: ["stream"], lengthMult: 0.9 },
  shrimp: { name: "透明虾虎", icon: "🦐", rarity: "common", zones: ["stream"], lengthMult: 0.5 },
  loach: { name: "溪流泥鳅", icon: "🐡", rarity: "common", zones: ["stream"], lengthMult: 0.8 },
  carp: { name: "河鲤", icon: "🐟", rarity: "common", zones: ["river"], lengthMult: 1.1 },
  grassfish: { name: "草鱼", icon: "🐟", rarity: "common", zones: ["river"], lengthMult: 1.2 },
  catfish: { name: "鲶鱼", icon: "🐟", rarity: "common", zones: ["river"], lengthMult: 1.3 },
  puffer: { name: "河豚", icon: "🐡", rarity: "common", zones: ["river"], lengthMult: 0.7 },
  koi: { name: "锦鲤", icon: "✨", rarity: "rare", zones: ["river"], pixel: true, lengthMult: 1.0 },
  blackfish: { name: "巨口黑鱼", icon: "💀", rarity: "rare", zones: ["river"], pixel: true, lengthMult: 1.4 },
  turtle: { name: "漂流老龟", icon: "🐢", rarity: "legendary", zones: ["stream", "river"], pixel: true, lengthMult: 1.8 },
  jellyfish: { name: "幽灵水母", icon: "👻", rarity: "legendary", zones: ["stream", "river"], pixel: true, lengthMult: 0.6 },
};
export const RARITY_LABEL = { common: "普通", rare: "稀有", legendary: "传说" };

// ====== 技能树 ======
export const SKILL_DEFS = {
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

// ====== 进场词条 (Roguelite buff) ======
export const BUFFS = {
  luck: { icon: "🍀", name: "幸运之手", desc: "稀有鱼出现概率 +20%" },
  speed: { icon: "⚡", name: "手速加持", desc: "钓鱼冷却时间 -25%" },
  magnet: { icon: "🧲", name: "磁力鱼钩", desc: "每次额外多钓1条普通鱼" },
  shield: { icon: "🛡️", name: "风浪免疫", desc: "本次进场免疫第一次负面突发事件" },
  bounty: { icon: "💰", name: "丰收时节", desc: "所有物资掉落数量 +50%" },
  precision: { icon: "🎯", name: "精准直觉", desc: "连续钓鱼第3次必定命中稀有鱼" },
};

// ====== 角色换装系统 (奇幻镜) ======
// 颜色 key 含义 (男女通用同一套): B/C=头发主/暗部, F/H=衣服主色/腮红, G/I=眼睛暗/亮部
export const COSTUME_OPTIONS = {
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
export const SHOP_HAIR_EXTRA = {
  rainbow: { icon: "🌈", label: "彩虹" },
};

// 角色固定 (不可换) 颜色: A轮廓 D肤色 E高光 J下身 K腰带 L鞋子
export const CHAR_FIXED_COLORS = { A: "#000000", D: "#faefed", E: "#ffffff", J: "#a5b8cf", K: "#ddbe86", L: "#38577c" };

// 配件定义: none + 基础3款(商店50金币) + 特殊2款(商店100金币, 王冠/蝴蝶结)
export const ACCESSORY_DEFS = {
  none: { icon: "🚫", label: "无" },
  hat: { icon: "🎩", label: "小帽子" },
  flower: { icon: "🌸", label: "发花" },
  star: { icon: "⭐", label: "星星" },
  crown: { icon: "👑", label: "皇冠" },
  bow: { icon: "🎀", label: "蝴蝶结" },
};

// ====== 商店系统 ======
export const SHOP_ITEMS = [
  { id: "hat", name: "小帽子", icon: "🎩", price: 50, type: "accessory", key: "hat" },
  { id: "flower", name: "发花", icon: "🌸", price: 50, type: "accessory", key: "flower" },
  { id: "star", name: "头顶星星", icon: "⭐", price: 50, type: "accessory", key: "star" },
  { id: "flag", name: "木筏彩旗", icon: "🎌", price: 50, type: "raftDecor" },
  { id: "crown", name: "皇冠", icon: "👑", price: 100, type: "accessory", key: "crown" },
  { id: "rainbow_hair", name: "彩虹发色", icon: "🌈", price: 100, type: "hairColor", key: "rainbow" },
  { id: "bow", name: "蝴蝶结", icon: "🎀", price: 100, type: "accessory", key: "bow" },
];

// ====== 吃喝 (恢复精力) ======
export const FOOD_DEFS = {
  bread: { restore: 15, label: "面包" },
  spam: { restore: 18, label: "午餐肉" },
  fish: { restore: 12, label: "鱼" }, // 注: 鱼目前不分稀有度库存, 统一按普通鱼回复值计算
  coconut_meat: { restore: CONFIG.COCONUT_CRACK_RESTORE, label: "椰子肉" },
  coconut_juice: { restore: CONFIG.COCONUT_CRACK_RESTORE, label: "椰子汁" },
};

// ====== 任务指引/建造/打造面板共用的资源中文名 ======
// 与 index.html #resources 面板的名称完全一致, 避免建造/打造面板出现命名不一致 (如"木材" vs "木头")
export const RES_LABEL = {
  wood: "木头", rope: "绳子", scrap: "废铁", iron: "铁块", seaweed: "水草", plastic: "塑料",
  coconut: "椰子", coconut_meat: "椰子肉", coconut_juice: "椰子汁",
  bread: "面包", spam: "午餐肉", fish: "鱼", water: "净水", trash: "垃圾",
  raftkit: "修复包", jerky: "鱼干",
};

// ====== 背包分类标签 ======
export const BAG_CATEGORY_LABEL = { material: "材料", food: "食物", item: "道具" };
export const BAG_CATEGORY_ORDER = ["material", "food", "item"];
