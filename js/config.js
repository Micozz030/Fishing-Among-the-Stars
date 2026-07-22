// ====== config.js: 可调数值配置 (集中管理, 方便后续平衡性调整) ======
// 规则: 本文件不 import 任何其它模块 (纯常量, 无逻辑依赖)

export const SAVE_KEY = "raft_save_v2";
export const COSTUME_SAVE_KEY = "costume_state";

export const ICONS = {
  wood: "🪵", rope: "🧵", scrap: "🔧", iron: "🔩",
  seaweed: "🌿", plastic: "♻️", coconut: "🥥",
  bread: "🍞", spam: "🥫", fish: "🐟", water: "💧", trash: "🗑️", raftkit: "🧰",
  jerky: "🍢",
  coconut_meat: "🍖", coconut_juice: "🥤",
  fossil: "🦴",
};

export const CONFIG = {
  RUMMAGE_CHANCE: { stream: 0.60, river: 0.60 },     // 翻垃圾成功概率
  RUMMAGE_ENERGY_COST: 3,                             // 翻垃圾消耗精力 (固定3点)
  BLUEPRINT_DROP_CHANCE: 0.13,                        // 翻垃圾掉落图纸概率
  RAFT_PART_COST_MULTIPLIER: 2,                       // 图纸建筑材料成本倍数
  EXPAND_COST: { wood: 15, rope: 5 },                  // 每次扩建木筏消耗
  INITIAL_RAFT_SLOTS: 4,                              // 新存档初始木筏格数
  ROPE_CRAFT: { cost: { wood: 5 }, yield: { rope: 2 } },        // 合成绳子
  REPAIR_KIT_CRAFT: { cost: { wood: 8 }, yield: { raftkit: 1 } }, // 合成木筏修复包
  JERKY_CRAFT: { cost: { fish: 3 }, yield: { jerky: 1 } },        // 晒鱼干
  SMELT_CRAFT: { cost: { scrap: 3 }, yield: { iron: 1 } },        // 熔炼铁块
  COCONUT_RAW_RESTORE: 8,           // 生吃椰子回复精力
  COCONUT_CRACK_RESTORE: 8,         // 椰子肉/椰子汁各自食用回复精力
  SEAWEED_BONUS_CHANCE: 0.20,       // 打捞时额外掉落水草的概率 (可调, 叠加在掉落表本身之上)
  AUTO_COLLECTOR_INTERVAL: 30,      // 自动收集网每N秒尝试一次打捞
  AUTO_COLLECTOR_CHANCE: 0.40,      // 自动收集网每次尝试的掉落概率
  AUTO_COLLECTOR_QTY_MULT: 0.5,     // 自动收集网掉落数量相对手动的倍率
  PET_FEED_RESTORE: 40,             // 每次喂食恢复饱食度
  PET_DECAY_INTERVAL: 600,          // 宠物饱食度每10分钟(秒)衰减一次
  PET_DECAY_AMOUNT: 10,
  PET_GIFT_CHANCE_PER_MIN: 0.05,    // 饱食度满时, 每分钟5%概率叼来礼物
  ENERGY_REGEN_INTERVAL: 30,        // 精力耗尽后, 每隔多少秒被动恢复一次
  ENERGY_REGEN_AMOUNT: 5,           // 每次被动恢复的精力值
  AUTO_COLLECTOR_FISH_WEIGHT: 1.5,  // 自动收集网掉落表中"普通鱼"相对其他条目的权重倍数
  FISH_LENGTH_RANGES: {
    common: [8, 35],
    rare: [30, 80],
    legendary: [60, 150],
  },
};

// ====== 钓鱼小游戏参数 (时机型收杆: 鱼图标不规则游动, 绿色钩取区间规律移动, 点击瞬间鱼在区间内才算命中) ======
export const MINIGAME_CONFIG = {
  barW: 48, barH: 220, pointerH: 10,   // 主条尺寸(略微加高以获得更精细的操作空间) + 鱼图标高度(px)
  timerBarW: 10,                        // 右侧倒计时条宽度(px)

  // --- 绿色钩取区间 (规律的乒乓往返运动) ---
  rareZoneH: 60,                // 稀有鱼钩取区间基础高度(px, 约占barH的27%)
  legendaryZoneH: 34,           // 传说鱼钩取区间基础高度(px, 约占barH的15%)
  zoneBonusPxPerLevel: 4,       // 每级鱼竿额外增加区间高度(px), 鱼竿越好玩家的窗口越大 (满级rare 84px≈38%, legendary 58px≈26%)
  zoneMaxRatio: 0.45,           // 硬上限: 区间高度不论加成如何叠加, 最终不超过barH的45%, 为后续技能/词条留出成长空间
  rareZoneSpeed: 0.8,           // 稀有鱼钩取区间移动速度(px/帧)
  legendaryZoneSpeed: 1.2,      // 传说鱼钩取区间移动速度(px/帧)
  zoneSpeedReductionPerLevel: 0.05, // 每级鱼竿让区间移动再减速5% (更容易跟上)

  // --- 鱼图标 (不规则游动: 随机换向变速, 平滑过渡) ---
  rareFishSpeed: 1.2,           // 稀有鱼基础游动速度(px/帧)
  legendaryFishSpeed: 2.2,      // 传说鱼基础游动速度(px/帧)
  fishBurstMult: 2.0,           // 鱼随机爆发时的最高速度倍率
  fishRedirectMinMs: 300,       // 鱼最短多久重新选择一次目标速度
  fishRedirectMaxMs: 800,       // 鱼最长多久重新选择一次目标速度
  fishLerpRate: 0.12,           // 鱼当前速度向目标速度平滑过渡的插值系数(每帧)
  fishStartledMult: 1.8,        // 玩家点空后, 鱼受惊速度倍率
  fishStartledDurationMs: 1000, // 受惊状态持续时间
  fishHookedSpeedMult: 1.3,     // 传说鱼第一次被钩住后, 剩余时间内速度提升30%

  // --- 命中/尝试次数 ---
  rareHooksNeeded: 1,           // 稀有鱼需要成功钩取次数
  rareAttemptsAllowed: 3,       // 稀有鱼总尝试次数
  legendaryHooksNeeded: 2,      // 传说鱼需要成功钩取次数
  legendaryAttemptsAllowed: 4,  // 传说鱼总尝试次数

  rareDurationMs: 8000,
  legendaryDurationMs: 12000,
  flashDurationMs: 500,         // 结算后的闪光展示时长 (仅在最终成功/失败时使用)
  tapFlashDurationMs: 260,      // 每次点击瞬间的命中/落空反馈闪光时长

  // --- 咬钩预警 (小游戏正式开始前的缓冲提示, 让玩家反应过来, 避免措手不及/误触) ---
  biteAlertDurationMs: 1200,    // 预警冻结时长: 期间不接受点击, 小游戏输入捕获层要等预警结束才创建
  biteAlertBounceAmp: 5,        // "❗咬钩了!"文字的上下跳动振幅(px)
  biteAlertBounceSpeed: 0.02,   // 文字跳动速度(弧度/毫秒)
  biteAlertShakeAmp: 4,         // 屏幕整体抖动振幅(px), 随预警进行逐渐衰减到0
};

// ====== 打捞/翻垃圾/开箱 相关的概率类调优常量 ======
export const CHEST_CHANCE = 0.12;
export const ANACHRONISM_CHANCE = 0.06;
export const FOOD_DROP_CHANCE = 0.07;   // 拉钩打捞捞到面包/午餐肉概率 (原0.10, 降低30%)
export const COCONUT_DROP_CHANCE = 0.10; // 捞到椰子概率 (原0.20, 降低50%, 变稀有)
export const RUMMAGE_JOKE_CHANCE = 0.40; // 失败时有这个概率翻到"破烂垃圾"并触发吐槽

// ====== 商店/漂流瓶等其它零散调优常量 ======
export const FISH_SELL_PRICE = 5; // 鱼出售单价 (金币/条)
export const BOTTLE_REST_X = 280;

// ====== 存档重置涉及的 localStorage key 列表 ======
export const GAME_STORAGE_KEYS = [SAVE_KEY, COSTUME_SAVE_KEY];
