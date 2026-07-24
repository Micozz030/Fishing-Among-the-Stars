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
  { key: "anchor", icon: "⚓", name: "加固船锚", desc: "加固锚链,才能在核心水域的漩涡中稳住木筏", cost: { iron: 4, wood: 8, rope: 4 }, repeatable: false },
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

// ====== 鱼类图鉴数据 (Step 1: 16个原生种 + 2个漫游稀有种 + 6个北美物种) ======
// 字段说明:
//   nativeZone: 该鱼"原生"于哪个流域 (决定它在哪个流域的图鉴解锁进度里被计入, 也是它开始出现的最早流域)
//   extraZones: 额外可捕获但不算原生的流域 (目前仅胭脂鱼: 原生river_core, 但river_mid也能钓到)
//   zones: 老版本(重构前)的"水域"字段, 只用于没有 nativeZone 的旧遗留鱼种(判定属于溪流/河流哪个水域legacy池)
//   lengthRange: [min,max] 厘米, 优先于旧的 lengthMult 生效
//   protected: 保护动物 —— 钓上后只记录图鉴+放归, 不进背包也不给鱼资源(见 fishing.js grantCatchResource)
//   roaming: { zones:[...], chance } —— 漫游稀有鱼, 不计入任何流域的原生名单/解锁条件, 每次抛竿独立小概率判定
//
// 以下7个key是"合并复用"旧版本已有的鱼(避免和新原生种同名/同身份重复, 同时通过复用key让老玩家的图鉴记录直接延续):
// trout→虹鳟, shrimp→秀丽白虾, loach→泥鳅, koi→锦鲤(名字本就相同), grassfish→草鱼(名字本就相同),
// catfish→鲶鱼(名字本就相同), puffer→暗纹东方鲀。其余旧鱼(stripey/carp/blackfish/jellyfish)没有明显的新原生种
// 与之重复, 原样保留为该水域的"遗留鱼种"(不计入任何流域解锁条件, 但仍可在同水域各流域捕获)。
export const FISH = {
  // ---- stream_clear 原生 (4个普通种, 解锁 stream_source 的条件) ----
  markou: { name: "马口鱼", icon: "🐟", rarity: "common", nativeZone: "stream_clear", lengthRange: [8, 20], desc: "中国山间溪流最常见的小型鱼类之一,雄鱼在繁殖期体侧会出现艳丽的红蓝纵纹。" },
  spottedloach: { name: "中华花鳅", icon: "🐡", rarity: "common", nativeZone: "stream_clear", lengthRange: [6, 14], desc: "体表有醒目深色斑纹,喜欢趴在溪底石缝,受惊时会迅速钻进沙里隐身。" },
  shrimp: { name: "秀丽白虾", icon: "🦐", rarity: "common", nativeZone: "stream_clear", lengthRange: [3, 8], desc: "体型透明,是许多溪流鱼类的天然饵料,顺手钓到一只也是不错的收获。" },
  trout: { name: "虹鳟", icon: "🐟", rarity: "common", nativeZone: "stream_clear", lengthRange: [25, 60], desc: "原产北美的溪流明星,体侧一道彩虹般的粉红纵带,如今已游遍全世界的冷水溪流。" },

  // ---- stream_source 原生 (3个普通种 + 1个传说保护种, 解锁 river_entrance 的条件) ----
  loach: { name: "泥鳅", icon: "🐡", rarity: "common", nativeZone: "stream_source", lengthRange: [10, 25], desc: "皮肤能直接呼吸空气,离水也能存活很久。" },
  kuanqi: { name: "宽鳍鱲", icon: "🐟", rarity: "common", nativeZone: "stream_source", lengthRange: [8, 18], desc: "马口鱼的近亲,雄鱼求偶时同样会变得五彩斑斓。" },
  brooktrout: { name: "溪红点鲑", icon: "🐟", rarity: "common", nativeZone: "stream_source", lengthRange: [15, 35], desc: "北美冷泉溪里的\"宝石\",深色鱼体上散布着红点与大理石纹,对水温极其挑剔。" },
  giantsalamander: { name: "中国大鲵", icon: "🦎", rarity: "legendary", nativeZone: "stream_source", lengthRange: [60, 180], protected: true, desc: "世界现存最大的两栖动物,国家二级保护野生动物,因叫声像婴儿啼哭得名。" },

  // ---- river_entrance 原生 (5个普通种 + 2个稀有种, 解锁 river_mid 的条件) ----
  crucian: { name: "鲫鱼", icon: "🐟", rarity: "common", nativeZone: "river_entrance", lengthRange: [12, 30], desc: "中国分布最广的淡水鱼之一,几乎所有河流湖泊都能见到,生命力极强。" },
  grassfish: { name: "草鱼", icon: "🐟", rarity: "common", nativeZone: "river_entrance", lengthRange: [30, 90], desc: "\"四大家鱼\"之一,主要以水草为食,是重要的养殖食用鱼。" },
  yellowcatfish: { name: "黄颡鱼", icon: "🐟", rarity: "common", nativeZone: "river_entrance", lengthRange: [12, 28], desc: "胸鳍有硬刺且带轻微毒性,被扎到会又痛又肿,渔民处理时格外小心。" },
  silvercarp: { name: "白鲢", icon: "🐟", rarity: "common", nativeZone: "river_entrance", lengthRange: [30, 80], desc: "对声音和震动极其敏感,受惊时会成群跃出水面。" },
  bluegill: { name: "蓝鳃太阳鱼", icon: "🐠", rarity: "common", nativeZone: "river_entrance", lengthRange: [8, 20], desc: "北美孩子钓到的\"人生第一条鱼\"多半是它,鳃盖上一抹深蓝,好奇心旺盛,见饵就咬。" },
  koi: { name: "锦鲤", icon: "✨", rarity: "rare", nativeZone: "river_entrance", pixel: true, lengthRange: [30, 90], desc: "色彩艳丽,常被人为放养在河湾水域,是这片水域的\"颜值担当\"。" },
  bass: { name: "大口黑鲈", icon: "🐟", rarity: "rare", nativeZone: "river_entrance", lengthRange: [30, 75], desc: "北美钓鱼运动的头号明星,伏击猎手,咬钩后会跃出水面疯狂甩头,是无数钓手的心头好。" },

  // ---- river_mid 原生 (4个普通种 + 1个稀有种, 解锁 river_core 的条件) ----
  catfish: { name: "鲶鱼", icon: "🐟", rarity: "common", nativeZone: "river_mid", lengthRange: [30, 100], desc: "昼伏夜出的伏击型猎手,喜欢躲在深水区或障碍物下等待猎物经过。" },
  puffer: { name: "暗纹东方鲀", icon: "🐡", rarity: "common", nativeZone: "river_mid", lengthRange: [15, 35], desc: "少数能洄游进江河的河豚品种,\"正是河豚欲上时\"说的就是它;内脏有毒,需专业处理才能食用。" },
  wuchang: { name: "武昌鱼", icon: "🐟", rarity: "common", nativeZone: "river_mid", lengthRange: [20, 45], desc: "因\"才饮长沙水,又食武昌鱼\"名扬全国,肉质细嫩,是长江中下游的经典鱼种。" },
  channelcatfish: { name: "斑点叉尾鮰", icon: "🐟", rarity: "common", nativeZone: "river_mid", lengthRange: [35, 90], desc: "北美大河底层的\"胡子猎手\",靠敏锐的触须在浑水里找食,与鲶鱼是相隔一个大洋的远亲。" },
  culter: { name: "翘嘴鲌", icon: "🐟", rarity: "rare", nativeZone: "river_mid", lengthRange: [40, 110], desc: "江河湖泊里的顶级掠食者之一,嘴巴上翘方便在水面突袭小鱼,俗称\"大白鱼\"。" },

  // ---- river_core 原生 (无普通种, 2个稀有种 + 1个传说boss, river_core 是终点流域, 不再解锁下一个流域) ----
  rosyfish: { name: "胭脂鱼", icon: "🐠", rarity: "rare", nativeZone: "river_core", extraZones: ["river_mid"], protected: true, lengthRange: [50, 120], desc: "幼鱼和成鱼体色差异极大,成鱼体侧一条胭脂红纵纹十分艳丽,是国家二级保护鱼类。" },
  paddlefish: { name: "密西西比匙吻鲟", icon: "🐟", rarity: "rare", nativeZone: "river_core", lengthRange: [100, 220], desc: "密西西比河的活化石,长桨般的吻部布满感应器官,与中华鲟一样在地球上游过了上亿年。两位古老的旅者,竟在这条河里相遇了。" },
  // TODO-BOSS: 中华鲟是本水域的收官鱼种, 目前复用普通传说鱼的小游戏流程; 专属的"巨物庆典"演出留给后续步骤实现。
  sturgeon: { name: "中华鲟", icon: "🐉", rarity: "legendary", nativeZone: "river_core", protected: true, lengthRange: [150, 400], desc: "长江\"活化石\",已存在超过1.4亿年,国家一级保护动物,这条河流的收官鱼种。" },

  // ---- 漫游稀有鱼 (不计入任何流域的原生名单/解锁条件, 每次抛竿独立小概率判定, 见 fishing.js rollRoamingSpecies) ----
  turtle: { name: "漂流老龟", icon: "🐢", rarity: "legendary", pixel: true, lengthRange: [40, 100], roaming: { zones: ["stream_clear", "stream_source", "river_entrance", "river_mid", "river_core"], chance: 0.004 }, desc: "一只在整条河里漂了不知多少年的老龟,壳上长满了故事。" },
  peachjelly: { name: "桃花水母", icon: "🌸", rarity: "legendary", protected: true, lengthRange: [1.5, 4], roaming: { zones: ["river_mid", "river_core"], chance: 0.004 }, desc: "中国真实存在的淡水水母,对水质要求极高,被称为\"水中大熊猫\"。" },

  // ---- 遗留鱼种 (重构前就有, 没有明显的新原生种与之重复, 原样保留在各自水域的legacy池里) ----
  stripey: { name: "石斑小鱼", icon: "🐠", rarity: "common", zones: ["stream"], lengthMult: 0.9 },
  carp: { name: "河鲤", icon: "🐟", rarity: "common", zones: ["river"], lengthMult: 1.1 },
  blackfish: { name: "巨口黑鱼", icon: "💀", rarity: "rare", zones: ["river"], pixel: true, lengthMult: 1.4 },
  jellyfish: { name: "幽灵水母", icon: "👻", rarity: "legendary", zones: ["stream", "river"], pixel: true, lengthMult: 0.6 },
};
export const RARITY_LABEL = { common: "普通", rare: "稀有", legendary: "传说" };

// 保护动物钓获后的放归文案 (不进背包/不给鱼资源, 只记录图鉴+念一段这个)
export const RELEASE_COPY = {
  giantsalamander: "已记录图鉴。你轻轻将它放归山涧——它摆了摆尾,消失在清冷的水底。",
  rosyfish: "已记录图鉴。胭脂红的身影缓缓沉回深水,像一抹游动的晚霞。",
  peachjelly: "已记录图鉴。它太脆弱了,你捧着水把它送回河里——能遇见它,说明这片水很干净。",
  sturgeon: "已记录图鉴。你注视着这位1.4亿岁的旅者缓缓离去,河水似乎安静了一瞬。",
};

// ====== 流域系统: 5个有序流域, 数据驱动 (取代原来硬编码的"溪流/河流"二选一) ======
// basin: "stream" | "river" —— 决定背景色/事件表/遗留鱼种走哪一套; 每条鱼的实际可捕获流域由 FISH[].nativeZone
// (+可选的 extraZones) 决定, 见下方 zonePool()/fishWeightInZone(), 不再依赖这里的 basin 做鱼池过滤。
// raftCap: 该流域允许把木筏建造到的上限格数; raftStep: 每次点击"扩建木筏"增加的格数
export const ZONES = [
  { key: "stream_clear", name: "初语浅溪", basin: "stream", raftCap: 6, raftStep: 1, unlock: { type: "always" } },
  { key: "stream_source", name: "雾隐溪源", basin: "stream", raftCap: 9, raftStep: 1, unlock: { type: "bestiary_commons", ofZone: "stream_clear" } },
  { key: "river_entrance", name: "苇声河湾", basin: "river", raftCap: 16, raftStep: 2, unlock: { type: "iron_autonet", collections: 5 } },
  { key: "river_mid", name: "沉锚深澜", basin: "river", raftCap: 20, raftStep: 2, unlock: { type: "bestiary_commons", ofZone: "river_entrance" } },
  { key: "river_core", name: "河神旧座", basin: "river", raftCap: 25, raftStep: 3, unlock: { type: "bestiary_commons_and_build", ofZone: "river_mid", buildKey: "anchor" } },
];
// 每个流域的背景图路径, 由 key 统一派生 (assets/bg_{key}.png), 不写任何逐流域的硬编码分支。
ZONES.forEach(z => { z.bg = `assets/bg_${z.key}.png`; });
export function zoneDef(zoneKey) {
  // 兼容极旧存档里 bestiary[].firstZone 仍是重构前的 "stream"/"river" 字面量(未随 migrate() 一起改写)
  if (zoneKey === "stream") zoneKey = "stream_clear";
  if (zoneKey === "river") zoneKey = "river_entrance";
  return ZONES.find(z => z.key === zoneKey) || ZONES[0];
}
export function zoneBasin(zoneKey) { return zoneDef(zoneKey).basin; }
// 某流域"原生"的普通稀有度鱼种 key 列表 (Step1: 解锁条件只看原生种, 遗留鱼/漫游稀有鱼永不参与解锁判定)
export function zoneCommonSpecies(zoneKey) {
  return Object.keys(FISH).filter(k => FISH[k].rarity === "common" && FISH[k].nativeZone === zoneKey);
}
// 木筏格数配置: {max, step}。纯函数(不读 state), 供 actions.js 的 canExpandZone/doExpandRaft 使用。
export function zoneSlotConfig(zoneKey) {
  const z = zoneDef(zoneKey);
  return { max: z.raftCap, step: z.raftStep };
}

// ====== 鱼池权重 (Step1: 原生种/遗留种累积共存 + 漫游稀有鱼) ======
// 返回某条鱼在"目标流域"应有的出现权重: 2=目标流域自己的原生种(或extraZones里额外声明可捕获的), 1=更早流域带过来的原生种
// 或同水域的遗留鱼种, 0=还不可在这里捕获(包括所有漫游稀有鱼——它们完全不进常规池, 只走独立小概率判定)。
function fishWeightInZone(fishKey, targetZoneKey) {
  const def = FISH[fishKey];
  if (def.roaming) return 0;
  if (def.nativeZone) {
    if (def.nativeZone === targetZoneKey) return 2;
    if (def.extraZones && def.extraZones.includes(targetZoneKey)) return 2;
    const targetIdx = ZONES.findIndex(z => z.key === targetZoneKey);
    const nativeIdx = ZONES.findIndex(z => z.key === def.nativeZone);
    return (nativeIdx >= 0 && targetIdx >= 0 && nativeIdx < targetIdx) ? 1 : 0;
  }
  // 没有 nativeZone 的遗留鱼: 只要和目标流域同水域(basin)就能捕获, 权重1(不享受"当前流域×2"加成)
  return (def.zones && def.zones.includes(zoneBasin(targetZoneKey))) ? 1 : 0;
}

// 某流域+某稀有度的可捕获鱼池, 附带上面算出的权重, 供 pickWeighted() 使用
export function zonePool(zoneKey, rarity) {
  return Object.keys(FISH)
    .filter(k => FISH[k].rarity === rarity)
    .map(k => ({ key: k, weight: fishWeightInZone(k, zoneKey) }))
    .filter(e => e.weight > 0);
}

// 漫游稀有鱼: 在给定流域可能出现的候选列表(不含权重, 每条各自独立小概率判定, 见 fishing.js)
export function roamingCandidates(zoneKey) {
  return Object.keys(FISH).filter(k => FISH[k].roaming && FISH[k].roaming.zones.includes(zoneKey));
}

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
  raftkit: "修复包", jerky: "鱼干", fossil: "化石碎片",
};

// ====== 背包分类标签 ======
export const BAG_CATEGORY_LABEL = { material: "材料", food: "食物", item: "道具" };
export const BAG_CATEGORY_ORDER = ["material", "food", "item"];
