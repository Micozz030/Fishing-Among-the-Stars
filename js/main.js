// ====== main.js: 启动引导 + 单一游戏循环 + 输入绑定 ======
// 这是唯一允许 import 全部其它模块的文件。

import { GAME_STORAGE_KEYS } from "./config.js";
import { PET_TYPES } from "./data.js";
import { state, load, loadCostume, canvas, zoneTotalSlots } from "./state.js";
import {
  doFishLoot, doRummage, doZoneSwitch, doPetInteract, wirePetAnimation,
} from "./actions.js";
import { doFishing } from "./fishing.js";
import { gameTick, bottleHit, openBottleModal, claimBottleReward } from "./systems.js";
import {
  updateUI, openPanel, auditBagItemCoverage, selectedBait, toggleBaitDropdown,
  closeAllDropdowns, syncDropdownVisibility,
} from "./ui.js";
import {
  drawScene, setRaftDisplayedSlots, setPetAction, startOnboardingIfNeeded,
  handleOnboardingClick, onboardingStep, isPetHit,
} from "./render.js";

// ====== 初始化 ======
load(PET_TYPES);
auditBagItemCoverage();
loadCostume();
wirePetAnimation(setPetAction);

document.getElementById("btn-fish-loot").onclick = doFishLoot;
document.getElementById("btn-rummage").onclick = doRummage;
document.getElementById("btn-zone-switch").onclick = doZoneSwitch;

document.getElementById("btn-guide").onclick = () => openPanel("guide");
document.getElementById("guide-close").onclick = () => document.getElementById("guide-modal").classList.add("hidden");

document.getElementById("btn-bag").onclick = () => openPanel("bag");
document.getElementById("bag-close").onclick = () => document.getElementById("bag-modal").classList.add("hidden");
// 资源速览条: 点击整条(任意资源图标)打开背包查看完整库存
document.getElementById("resource-strip").onclick = () => openPanel("bag");

document.getElementById("btn-bestiary").onclick = () => openPanel("bestiary");
document.getElementById("bestiary-close").onclick = () => document.getElementById("bestiary-modal").classList.add("hidden");

document.getElementById("btn-blueprints").onclick = () => openPanel("blueprint");
document.getElementById("blueprint-close").onclick = () => document.getElementById("blueprint-modal").classList.add("hidden");

document.getElementById("btn-skilltree").onclick = () => openPanel("skilltree");
document.getElementById("skilltree-close").onclick = () => document.getElementById("skilltree-modal").classList.add("hidden");

document.getElementById("btn-achievements").onclick = () => openPanel("achievement");
document.getElementById("achievement-close").onclick = () => document.getElementById("achievement-modal").classList.add("hidden");

document.getElementById("btn-costume").onclick = () => openPanel("costume");
document.getElementById("costume-close").onclick = () => document.getElementById("costume-modal").classList.add("hidden");

document.getElementById("btn-shop").onclick = () => openPanel("shop");
document.getElementById("shop-close").onclick = () => document.getElementById("shop-modal").classList.add("hidden");
// 注: shop-tab-sell/shop-tab-buy 的点击绑定就近定义在 ui.js (紧邻 shopTab 私有状态和 renderShopModal),
// 与 openChest 旁边直接绑定 chest-close 是同一种"就近绑定"风格, 与原始单文件版本的写法保持一致。

document.getElementById("btn-build").onclick = () => openPanel("build");
document.getElementById("build-close").onclick = () => document.getElementById("build-modal").classList.add("hidden");

document.getElementById("btn-craft").onclick = () => openPanel("craft");
document.getElementById("craft-close").onclick = () => document.getElementById("craft-modal").classList.add("hidden");

document.getElementById("event-close").onclick = () => {
  document.getElementById("event-modal").classList.add("hidden");
};
startOnboardingIfNeeded();

// ====== 核心操作区: 钓鱼/工坊 绑定 ======
document.getElementById("btn-fish-cast").onclick = () => doFishing(selectedBait);
document.getElementById("btn-bait-arrow").onclick = () => {
  toggleBaitDropdown();
};

document.getElementById("bottle-close").onclick = () => {
  document.getElementById("bottle-modal").classList.add("hidden");
};
document.getElementById("bottle-claim").onclick = claimBottleReward;

// 点击下拉面板/按钮以外的区域, 自动收起所有下拉
document.addEventListener("click", (e) => {
  if (e.target.closest(".dropdown-root")) return;
  closeAllDropdowns();
  syncDropdownVisibility();
});

setRaftDisplayedSlots(zoneTotalSlots(state.zone));
updateUI();

// ====== canvas 点击: 打捞 / 宠物互动 / 漂流瓶 / 开局引导 ======
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

  if (isPetHit(cx, cy)) {
    doPetInteract();
    return;
  }
  doFishLoot();
});

// ====== 单一游戏循环 (Stage 2): 一个 requestAnimationFrame 驱动一切 ======
// - drawScene(): 每帧调用一次 (画面动画/小游戏更新)
// - gameTick(): 用累加器节流到约每1000ms一次, 和原来 setInterval(gameTick, 1000) 的节奏保持一致;
//   deltaSec 的精确计算仍由 gameTick 内部依据真实时间戳完成, 这里只负责"多久调用一次"。
// - 用 rAF 时间戳做节流判断(而非另开 setInterval), 页面切到后台时 rAF 会自动暂停, 不会空转,
//   回到前台后 gameTick 内部的 Math.min(60, ...) 早已对单次 deltaSec 做了封顶, 不会"瞬间暴走"补偿。
let lastTickAt = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  drawScene();
  if (ts - lastTickAt >= 1000) {
    lastTickAt = ts;
    gameTick(!!onboardingStep);
  }
}
requestAnimationFrame(loop);

// ====== 重置存档 ======
document.getElementById("btn-reset-save").onclick = () => {
  document.getElementById("reset-confirm-modal").classList.remove("hidden");
};
document.getElementById("btn-reset-cancel").onclick = () => {
  document.getElementById("reset-confirm-modal").classList.add("hidden");
};
document.getElementById("btn-reset-confirm").onclick = () => {
  GAME_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
};
