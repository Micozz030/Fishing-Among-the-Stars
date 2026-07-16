// ====== systems.js: 突发事件 + 漂流瓶 + 成就系统 + 挂机 tick (自动收集网/净水器/宠物/美观度礼物) ======
// 依赖: config/data/state (基础三层) + ui.js (updateUI) + fishing.js (registerCatch, 仅河流事件用到)
//
// 关于 systems.js ⇄ fishing.js 的循环依赖 (有意为之, 已评估安全, 与 ui.js⇄actions.js 同理):
// fishing.js 的收线结算需要调用本文件的 checkFishAchievements; 本文件的河流事件"悄悄跟上"选项
// 需要调用 fishing.js 的 registerCatch 来记录钓到的鱼。两处调用都只发生在玩家实际触发对应操作时
// (事件选项被点击 / 钓鱼收线结算), 不会在模块顶层求值阶段执行, 因此这个循环在 ES 模块下是安全的。

import { CONFIG, BOTTLE_REST_X, ICONS } from "./config.js";
import {
  BLUEPRINTS, PET_TYPES, LOOT_TABLE_STONE, LOOT_TABLE_IRON, FISH,
} from "./data.js";
import {
  state, ctx, toast, addRes, resLine, pick, pickWeighted, save,
  spendEnergy, restoreEnergy, grantBlueprint, grantRandomBlueprint,
  isBuiltKey, BUILDING_RENDER_ORDER, zoneTotalSlots, sturdyMitigation, flashLegendary,
} from "./state.js";
import { updateUI } from "./ui.js";
import { registerCatch } from "./fishing.js";
import { sfx } from "./audio.js";

// ====== 自动收集网专用掉落表: 在基础打捞表之上额外加入"普通鱼", 权重为其他条目的1.5倍 ======
function autoCollectorLootTable() {
  const base = state.era === "iron" ? LOOT_TABLE_IRON : LOOT_TABLE_STONE;
  const entries = base.map(res => ({ weight: 1, res }));
  entries.push({ weight: CONFIG.AUTO_COLLECTOR_FISH_WEIGHT, res: { fish: 1 } });
  return entries;
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

function fishPool(zone, rarity) {
  return Object.keys(FISH).filter(k => FISH[k].rarity === rarity && FISH[k].zones.includes(zone));
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

export function isModalOpen() {
  return !document.getElementById("chest-modal").classList.contains("hidden")
    || !document.getElementById("event-modal").classList.contains("hidden")
    || !document.getElementById("buff-modal").classList.contains("hidden")
    || !document.getElementById("bestiary-modal").classList.contains("hidden")
    || !document.getElementById("blueprint-modal").classList.contains("hidden")
    || !document.getElementById("skilltree-modal").classList.contains("hidden")
    || !document.getElementById("achievement-modal").classList.contains("hidden")
    || !document.getElementById("costume-modal").classList.contains("hidden")
    || !document.getElementById("shop-modal").classList.contains("hidden")
    || !document.getElementById("build-modal").classList.contains("hidden")
    || !document.getElementById("craft-modal").classList.contains("hidden")
    || !document.getElementById("bag-modal").classList.contains("hidden")
    || !document.getElementById("bottle-modal").classList.contains("hidden");
}

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

// ====== 漂流瓶引导系统 ======
// 后台每60秒检测一次玩家状态, 满足条件且未领取过时漂来一个发光漂流瓶
const BOTTLE_DEFS = [
  {
    id: "fisherman_letter",
    title: "来自远方的渔夫信",
    quote: "好的工具才能钓到好的鱼……",
    instruction: "在工坊中消耗铁块×3升级鱼竿,提升普通鱼命中率,还能扩大稀有/传说钓鱼小游戏的钩取区间!",
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

export function updateBottleDrift() {
  if (!activeBottle) return;
  if (activeBottle.x > BOTTLE_REST_X) activeBottle.x -= 0.6;
}

export function drawDriftBottle() {
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

export function bottleHit(px, py) {
  if (!activeBottle) return false;
  const dx = px - activeBottle.x, dy = py - activeBottle.y;
  return Math.sqrt(dx * dx + dy * dy) <= 24;
}

export function openBottleModal() {
  if (!activeBottle) return;
  const def = BOTTLE_DEFS.find(d => d.id === activeBottle.id);
  if (!def) return;
  sfx.chestOpen();
  document.getElementById("bottle-title").textContent = `🍾「${def.title}」`;
  document.getElementById("bottle-quote").textContent = def.quote;
  document.getElementById("bottle-instruction").textContent = `👉 ${def.instruction}`;
  document.getElementById("bottle-reward").textContent = `完成奖励: ${def.rewardText}`;
  document.getElementById("bottle-modal").classList.remove("hidden");
}

export function claimBottleReward() {
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

// ====== 成就系统 (AchievementManager) ======
export const ACHIEVEMENTS = [
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
  { id: "mirror_unlock", cat: "hidden", name: "大自然的馈赠", desc: "鱼竿升级后,第一次钓到鱼", hidden: true, reward: () => { state.mirrorUnlocked = true; } },
];
export const ACHV_CATEGORY_LABEL = { fish: "🎣 钓鱼类", build: "🪵 建造类", zone: "🌊 流域类", hidden: "😴 玄学/隐藏类", pet: "🐾 宠物类" };

function grantBlueprintByCategory(category) {
  const unowned = Object.keys(BLUEPRINTS).filter(k => !state.blueprints[k] && BLUEPRINTS[k].category === category);
  if (unowned.length) return grantBlueprint(pick(unowned), BLUEPRINTS);
  return grantRandomBlueprint(BLUEPRINTS);
}

function showAchievementToast(def) {
  const layer = document.getElementById("achievement-toast-layer");
  const el = document.createElement("div");
  el.className = "achievement-toast";
  el.innerHTML = `🏆 <b>${def.name}</b><br>${def.desc}${def.hidden ? '<br><span class="hidden-tag">隐藏成就解锁!</span>' : ""}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function unlockAchievement(id) {
  if (state.achievements[id]) return;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  sfx.achievement();
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

// ====== 成就检测钩子 ======
export function checkBuildAchievements() {
  if (state.stats.buildFailCount >= 3) unlockAchievement("build_fail_3");
  const ownedBp = Object.keys(state.blueprints).length;
  if (ownedBp > Object.keys(BLUEPRINTS).length / 2) unlockAchievement("half_blueprints");
  const builtKeys = BUILDING_RENDER_ORDER.filter(isBuiltKey);
  if (builtKeys.length >= zoneTotalSlots(state.zone)) unlockAchievement("all_slots_full");
}

export function checkFishAchievements(speciesKey, hit) {
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
    if (state.rodLevel >= 1 && !state.mirrorUnlocked) unlockAchievement("mirror_unlock");
  } else {
    state.stats.consecutiveMisses += 1;
    state.stats.consecutiveHits = 0;
    if (state.stats.consecutiveMisses >= 10) unlockAchievement("lose_streak10");
  }
  if (state.stats.totalCasts > 100) unlockAchievement("total_casts100");
}

export function checkIdleAchievements(now) {
  const idleMs = now - state.lastActionAt;
  if (idleMs >= 5 * 60000) unlockAchievement("idle_5min");
  if (idleMs >= 20 * 60000) unlockAchievement("idle_20min");
  if (idleMs >= 60 * 60000) unlockAchievement("idle_1h");
  if (now - state.stats.zoneEnterAt >= 30 * 60000) unlockAchievement("same_zone_30min");
}

// ====== 主循环 (挂机 tick): 由 main.js 的单一 rAF 循环, 用 ~1000ms 的累加器节流调用 ======
export function gameTick(onboardingActive) {
  if (onboardingActive) { state.lastTick = Date.now(); return; }
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
    state.autocollectorAccum = (state.autocollectorAccum || 0) + deltaSec;
    while (state.autocollectorAccum >= CONFIG.AUTO_COLLECTOR_INTERVAL) {
      state.autocollectorAccum -= CONFIG.AUTO_COLLECTOR_INTERVAL;
      if (Math.random() < CONFIG.AUTO_COLLECTOR_CHANCE) {
        const loot = pickWeighted(autoCollectorLootTable());
        const scaledLoot = {};
        for (const k in loot) {
          scaledLoot[k] = Math.max(1, Math.round(loot[k] * CONFIG.AUTO_COLLECTOR_QTY_MULT));
        }
        if (state.skills.build.automation_master) {
          for (const k in scaledLoot) scaledLoot[k] += 1; // 自动化大师: 额外+1
        }
        addRes(scaledLoot);
        toast(`⚙️ 自动收集网捞到 ${resLine(scaledLoot)}`);
      }
    }
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
