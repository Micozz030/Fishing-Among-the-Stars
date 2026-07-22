// ====== main.js: 启动引导 + 单一游戏循环 + 输入绑定 ======
// 这是唯一允许 import 全部其它模块的文件。

import { GAME_STORAGE_KEYS } from "./config.js";
import { PET_TYPES } from "./data.js";
import {
  state, load, loadCostume, canvas, zoneTotalSlots,
  exportSaveString, importSaveString, toast,
} from "./state.js";
import {
  doFishLoot, doRummage, doPetInteract, wirePetAnimation,
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
import { initAudioOnGesture, isMuted, toggleMute } from "./audio.js";
import { startIntro } from "./intro.js";

// ====== 初始化 ======
load(PET_TYPES);
auditBagItemCoverage();
loadCostume();
wirePetAnimation(setPetAction);
initAudioOnGesture();

document.getElementById("btn-fish-loot").onclick = doFishLoot;
document.getElementById("btn-rummage").onclick = doRummage;
document.getElementById("btn-map").onclick = () => openPanel("map");
document.getElementById("map-close").onclick = () => document.getElementById("map-modal").classList.add("hidden");

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

document.getElementById("btn-save-io").onclick = () => openPanel("saveio");
document.getElementById("save-io-close").onclick = () => document.getElementById("save-io-modal").classList.add("hidden");

// ====== 音效静音开关 ======
function refreshMuteIcon() {
  document.getElementById("mute-icon").textContent = isMuted() ? "🔇" : "🔊";
}
document.getElementById("btn-mute").onclick = () => {
  toggleMute();
  refreshMuteIcon();
};
refreshMuteIcon();

// ====== 存档管理: 导出 (复制到剪贴板 + 下载文件) / 导入 (粘贴文字 + 选择文件, 二次确认后覆盖并刷新) ======
document.getElementById("save-export-btn").onclick = async () => {
  const str = exportSaveString();
  const output = document.getElementById("save-export-output");
  output.value = str;
  try {
    await navigator.clipboard.writeText(str);
    toast("存档已复制,请粘贴保存到备忘录等安全的地方");
  } catch (e) {
    // 剪贴板API不可用时退化为可选中的文本框, 玩家手动全选复制
    output.select();
    toast("已生成存档文字,请手动复制保存");
  }
};

document.getElementById("save-download-btn").onclick = () => {
  const str = exportSaveString();
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob([str], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raft_save_${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

document.getElementById("save-import-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("save-import-input").value = String(reader.result || "");
  };
  reader.readAsText(file);
});

let pendingImportString = null;
document.getElementById("save-import-btn").onclick = () => {
  const str = document.getElementById("save-import-input").value;
  if (!str || !str.trim()) { toast("请先粘贴存档文字或选择存档文件"); return; }
  pendingImportString = str;
  document.getElementById("save-import-confirm-modal").classList.remove("hidden");
};
document.getElementById("save-import-cancel").onclick = () => {
  pendingImportString = null;
  document.getElementById("save-import-confirm-modal").classList.add("hidden");
};
document.getElementById("save-import-confirm").onclick = () => {
  const str = pendingImportString;
  pendingImportString = null;
  document.getElementById("save-import-confirm-modal").classList.add("hidden");
  if (!str) return;
  const ok = importSaveString(str, PET_TYPES);
  if (!ok) {
    toast("存档格式不正确");
    return;
  }
  location.reload();
};

document.getElementById("event-close").onclick = () => {
  document.getElementById("event-modal").classList.add("hidden");
};

// 开场剧情: 只有"从未见过"(真正的全新存档)才会自动播放一次, 播完/跳过后再走原有的角色/宠物选择;
// 老存档(state.introSeen 在迁移时已被视为true, 见 state.js migrate())直接进入原有流程。
if (!state.introSeen) {
  startIntro({ grantOnComplete: true, onComplete: startOnboardingIfNeeded });
} else {
  startOnboardingIfNeeded();
}

// 「指引」面板里的"重看开场": 重放剧情但不再重复发放行囊, 播完/跳过后只是关掉浮层, 不影响当前游戏状态
document.getElementById("btn-replay-intro").onclick = () => {
  document.getElementById("guide-modal").classList.add("hidden");
  startIntro({ grantOnComplete: false });
};

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
