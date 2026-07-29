// ====== fishcg.js: 鱼类CG立绘 —— 按需懒加载/缓存 + 首次捕获"新收录"弹窗 + 图鉴详情 ======
// 依赖: data.js (鱼类定义/放归文案) + audio.js (开启弹窗时的音效)。
// 本文件不 import fishing.js / ui.js —— 它们单向依赖本文件, 因此不存在循环依赖。
// 「首次捕获」的判定与入队发生在 fishing.js 的 registerCatch() 里, 本文件只负责排队展示。
//
// CG 文件位于 assets/fish/, 文件名 = 鱼的中文名 (如 assets/fish/马口鱼.png)。
// 并非所有鱼都一定有图: 加载失败时静默回退到原有的像素图/emoji 渲染, 不显示裂图, 只在控制台 warn 一次。

import { FISH, FISH_PIXEL_GRIDS, RARITY_LABEL, RELEASE_COPY } from "./data.js";
import { state } from "./state.js";
import { sfx } from "./audio.js";

const CG_DIR = "assets/fish/";
// 素材里绝大多数是 png, 个别是 jpg (如 胭脂鱼.jpg) —— 按顺序尝试, 都失败才算这条鱼没有立绘
const CG_EXTS = ["png", "jpg"];
// 性能护栏: 超过这个长边尺寸的原图, 一次性缩放进离屏canvas缓存, 之后所有渲染都复用缩放后的版本,
// 避免个别超大源文件(如 1254px 的巨口黑鱼)在移动端反复解码/缩放拖慢图鉴滚动。
const MAX_EDGE = 1200;

// key -> { status: "ready"|"failed", drawable, url, w, h }
// drawable: 供 canvas drawImage 使用 (HTMLImageElement 或缩放后的 canvas)
// url:      供 DOM (<img>/background-image) 使用 (原始路径, 或缩放后 canvas 导出的 blob URL)
const cache = new Map();
const pending = new Map(); // key -> Promise, 防止同一条鱼并发重复加载

function tryLoadOne(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// 超大图缩放: 返回 { canvas, url } , 未超限则返回 null (直接用原图)
async function downscaleIfHuge(img) {
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  if (long <= MAX_EDGE) return null;
  const scale = MAX_EDGE / long;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  // 转成 blob URL 供 DOM 侧复用同一张缩放后的位图 (整个会话内长期持有, 不需要 revoke)
  const url = await new Promise(resolve => {
    if (!cv.toBlob) { resolve(null); return; }
    cv.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), "image/png");
  });
  return { canvas: cv, url };
}

// 懒加载某条鱼的CG。返回 cache entry ({status:"ready"|"failed", ...}), 永不 reject。
export function loadFishCG(key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);

  const def = FISH[key];
  const p = (async () => {
    let found = null;
    if (def) {
      for (const ext of CG_EXTS) {
        const url = CG_DIR + encodeURIComponent(def.name) + "." + ext;
        const img = await tryLoadOne(url);
        if (img) { found = { img, url }; break; }
      }
    }

    let entry;
    if (!found) {
      console.warn(`[鱼类CG] 未找到立绘, 已回退到像素图/emoji: ${def ? def.name : key}`);
      entry = { status: "failed", drawable: null, url: null, w: 0, h: 0 };
    } else {
      const shrunk = await downscaleIfHuge(found.img);
      entry = shrunk
        ? { status: "ready", drawable: shrunk.canvas, url: shrunk.url || found.url, w: shrunk.canvas.width, h: shrunk.canvas.height }
        : { status: "ready", drawable: found.img, url: found.url, w: found.img.naturalWidth, h: found.img.naturalHeight };
    }
    cache.set(key, entry);
    pending.delete(key);
    return entry;
  })();

  pending.set(key, p);
  return p;
}

// 同步读取已缓存的CG (没加载过则返回 null, 不触发加载)
export function getCachedFishCG(key) {
  const e = cache.get(key);
  return e && e.status === "ready" ? e : null;
}

// ====== 无立绘时的大图回退: 像素图放大 / 超大emoji ======
function fallbackMarkup(key, sizePx) {
  const def = FISH[key];
  const pg = FISH_PIXEL_GRIDS[key];
  if (def && def.pixel && pg) {
    const cols = pg.grid[0].length, rows = pg.grid.length;
    return `<canvas class="fishcg-fallback-pixel" width="${cols}" height="${rows}" data-fallback-fish="${key}"></canvas>`;
  }
  return `<div class="fishcg-fallback-emoji" style="font-size:${sizePx}px">${def ? def.icon : "🐟"}</div>`;
}

function paintFallbackPixels(root) {
  root.querySelectorAll("canvas[data-fallback-fish]").forEach(cv => {
    const pg = FISH_PIXEL_GRIDS[cv.getAttribute("data-fallback-fish")];
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

// ====== CG 弹窗 (首次收录 / 图鉴详情 共用同一套布局) ======
let modalOpen = false;
const revealQueue = [];
let flushScheduled = false;
let queueDrainedCb = null;

// 供 fishing.js 注册: 一批"新收录"弹窗全部关闭后的回调 (用于把分享按钮的倒计时重新计满)
export function onFishCGQueueDrained(cb) { queueDrainedCb = cb; }

function el(id) { return document.getElementById(id); }

// 首次收录时的抬头文案, 按稀有度递进 (图鉴详情不用这套, 见下方 else 分支)
const NEW_ENTRY_TITLE = {
  common: "初次捕获",
  rare: "✦ 稀有发现!",
  legendary: "★ 传说现身!!",
};

// isNewEntry=true 时显示按稀有度递进的揭晓抬头 + 左上角"新收录"角标; 图鉴详情复用同一弹窗, 只是换个抬头
async function openFishCGModal(key, isNewEntry) {
  const def = FISH[key];
  if (!def) return;
  modalOpen = true;

  const modal = el("fishcg-modal");
  const stage = el("fishcg-stage");

  // 弹窗整体配色(边框/光晕/徽章/强调线)全部由这个 data-rarity 驱动, 见 style.css 的 .fishcg-box[data-rarity]
  el("fishcg-box").dataset.rarity = def.rarity;

  el("fishcg-header").textContent = isNewEntry
    ? (NEW_ENTRY_TITLE[def.rarity] || NEW_ENTRY_TITLE.common)
    : "📖 图鉴详情";
  el("fishcg-new-badge").classList.toggle("hidden", !isNewEntry);
  el("fishcg-name").textContent = def.name;

  const rarityEl = el("fishcg-rarity");
  rarityEl.className = `rarity-tag rarity-${def.rarity}`;
  rarityEl.textContent = RARITY_LABEL[def.rarity];

  el("fishcg-protected").classList.toggle("hidden", !def.protected);
  el("fishcg-desc").textContent = def.desc || "";
  el("fishcg-desc").classList.toggle("hidden", !def.desc);

  // 保护动物的放归文案并入本弹窗一起显示, 不再单独弹一次
  const releaseEl = el("fishcg-release");
  const releaseText = def.protected ? (RELEASE_COPY[key] || "已记录图鉴,随后被放归。") : "";
  releaseEl.textContent = releaseText;
  releaseEl.classList.toggle("hidden", !releaseText);

  // 体长纪录 (图鉴详情用; 首次收录时纪录刚写入, 一并显示也合理)
  const recEl = el("fishcg-record");
  const bEntry = state.bestiary[key];
  const rec = bEntry && bEntry.record;
  if (rec) {
    const dateTag = def.rarity !== "common" ? ` · ${new Date(rec.caughtAt).toISOString().slice(0, 10)}` : "";
    recEl.textContent = `📏 最长纪录 ${rec.length.toFixed(1)}cm${dateTag}`;
    recEl.classList.remove("hidden");
  } else {
    recEl.classList.add("hidden");
  }

  // 先放回退图, CG 加载完再替换 —— 保证弹窗立刻可见, 不会卡在空白等图
  stage.innerHTML = fallbackMarkup(key, 110);
  paintFallbackPixels(stage);
  modal.classList.remove("hidden");
  if (isNewEntry) sfx.achievement();

  // 传说鱼入场: 额外来一下全屏金光 (先移除再强制重排, 保证连续弹多条传说鱼时每次都能重新播放)
  const flashEl = el("fishcg-flash");
  flashEl.classList.remove("flash");
  if (def.rarity === "legendary") {
    void flashEl.offsetWidth;
    flashEl.classList.add("flash");
  }

  const entry = await loadFishCG(key);
  // 加载期间玩家可能已经关掉弹窗/又打开了别的鱼, 这时不要把图塞进去
  if (!modalOpen || el("fishcg-name").textContent !== def.name) return;
  if (entry.status === "ready") {
    stage.innerHTML = "";
    const img = document.createElement("img");
    img.className = "fishcg-img";
    img.alt = def.name;
    img.src = entry.url;
    stage.appendChild(img);
  }
}

function closeFishCGModal() {
  if (!modalOpen) return;
  modalOpen = false;
  el("fishcg-modal").classList.add("hidden");
  el("fishcg-stage").innerHTML = "";
  // 队列里还有别的"新收录"就继续弹下一条, 否则通知调用方队列已排空
  if (revealQueue.length) {
    const next = revealQueue.shift();
    openFishCGModal(next, true);
  } else if (queueDrainedCb) {
    const cb = queueDrainedCb;
    setTimeout(cb, 0);
  }
}

// 首次捕获入队。同一次抛竿可能一口气解锁多条(磁力鱼钩/精准直觉), 因此排队逐条展示。
// 用 setTimeout(0) 延后到本次结算的同步流程(含 updateUI/save)全部跑完之后再弹, 调用方无需额外配合。
export function enqueueFirstCatchReveal(key) {
  revealQueue.push(key);
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    if (modalOpen || !revealQueue.length) return;
    openFishCGModal(revealQueue.shift(), true);
  }, 0);
}

// 图鉴里点开某条已发现的鱼 -> 详情弹窗
export function openFishDetail(key) {
  if (modalOpen) return;
  openFishCGModal(key, false);
}

// ====== 图鉴缩略图: 懒加载 (滚动进视口才真正请求图片) ======
let thumbObserver = null;

// 给图鉴卡片里的缩略图占位元素挂上懒加载。root: 图鉴滚动容器
export function observeBestiaryThumbs(root) {
  if (thumbObserver) thumbObserver.disconnect();
  const targets = root.querySelectorAll("[data-cg-thumb]");
  if (!targets.length) return;

  const reveal = (elm) => {
    const key = elm.getAttribute("data-cg-thumb");
    const cached = getCachedFishCG(key);
    if (cached) { applyThumb(elm, cached); return; }
    loadFishCG(key).then(entry => {
      if (entry.status === "ready") applyThumb(elm, entry);
    });
  };

  if (!("IntersectionObserver" in window)) {
    targets.forEach(reveal);
    return;
  }

  // 首屏那批缩略图同步判定并立即加载, 不等 IntersectionObserver 的首次回调:
  // 一来避免面板刚打开时先闪一下空缩略图, 二来当页面处于不渲染状态(后台标签页/未合成)时
  // IO 回调可能迟迟不派发, 有了这一步"已经在视口内"的兜底就不会出现缩略图永远不加载的情况。
  const rootRect = root.getBoundingClientRect();
  const MARGIN = 120;
  const rest = [];
  targets.forEach(t => {
    const r = t.getBoundingClientRect();
    const inView = r.bottom >= rootRect.top - MARGIN && r.top <= rootRect.bottom + MARGIN;
    if (inView) reveal(t); else rest.push(t);
  });
  if (!rest.length) return;

  thumbObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      reveal(e.target);
    });
  }, { root, rootMargin: `${MARGIN}px` });
  rest.forEach(t => thumbObserver.observe(t));
}

function applyThumb(elm, entry) {
  elm.style.backgroundImage = `url("${entry.url}")`;
  elm.classList.add("has-cg"); // 有图时隐藏内部的 emoji/像素回退
}

// ====== 分享卡片: contain-fit 把CG画进一块正方形区域 (不裁剪不拉伸) ======
// c: CanvasRenderingContext2D; region: {x,y,w,h}
export function drawFishCGContain(c, key, region) {
  const entry = getCachedFishCG(key);
  if (!entry) return false;
  const scale = Math.min(region.w / entry.w, region.h / entry.h);
  const dw = entry.w * scale, dh = entry.h * scale;
  const dx = region.x + (region.w - dw) / 2;
  const dy = region.y + (region.h - dh) / 2;
  c.drawImage(entry.drawable, dx, dy, dw, dh);
  return true;
}

// 供 UI 侧在生成分享卡前确保CG已就绪 (没有立绘时返回 false, 调用方回退到像素图/emoji)
export async function ensureFishCG(key) {
  const entry = await loadFishCG(key);
  return entry.status === "ready";
}

// ====== 事件绑定 (整个弹窗任意处点击即关闭; ✕ 按钮同理) ======
export function wireFishCGModal() {
  const modal = el("fishcg-modal");
  if (!modal) return;
  modal.addEventListener("click", closeFishCGModal);
}
