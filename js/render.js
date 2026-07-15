// ====== render.js: Canvas 场景渲染 (MC 像素方块风) ======
// 依赖: config/data/state (基础三层), 以及 fishing.js/systems.js (用于在 drawScene 中编排调用
// 它们各自的绘制片段 drawMinigame/drawBiteAlert/drawDriftBottle)。
// 这两个依赖都是单向的: fishing.js/systems.js 不会反过来 import render.js
// (它们需要的 ctx 已经从 state.js 拿, 不需要 render.js), 因此不构成循环依赖。

import { CONFIG, MINIGAME_CONFIG } from "./config.js";
import {
  COSTUME_OPTIONS, CHAR_FIXED_COLORS, PET_TYPES,
} from "./data.js";
import {
  state, ctx, canvas, costumeState, zoneTotalSlots,
  BUILDING_RENDER_ORDER, isBuiltKey, save, saveCostume, floatTexts,
} from "./state.js";
import { choosePet, petMood } from "./actions.js";
import {
  fishingState, fishRipples, fishingPhaseUntil, fishingPhaseDur,
  minigame, updateMinigame, drawMinigame, biteAlertStartAt, drawBiteAlert,
} from "./fishing.js";
import { updateBottleDrift, drawDriftBottle } from "./systems.js";
// renderFishRow 必须在 drawScene 里每帧调用一次(而不是靠事件驱动的 updateUI 稀疏调用),
// 否则钓鱼进度条(#fish-progress-fill)只能在阶段切换的瞬间跳变, 观感卡顿。
// ui.js 不会反过来 import render.js, 所以这个单向依赖不会形成循环。
import { renderFishRow } from "./ui.js";

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
// 供 actions.js 的 doFeedPet/doPetInteract 触发宠物跳动动画使用
export function setPetAction(type, untilTs) { petActionType = type; petActionUntil = untilTs; }

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
export function drawPixelGrid(grid, colors, ox, oy, size) {
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

// 木筏: 按当前流域面积动态拼成方格网, 已建成的建筑渲染对应像素占位图, 扩建出的空槽位用浅色虚线边框提示
let raftDisplayedSlots = 4;
export function setRaftDisplayedSlots(n) { raftDisplayedSlots = n; } // 供 main.js 在初始化时设定初始值
function drawRaft() {
  const targetSlots = zoneTotalSlots();
  raftDisplayedSlots += (targetSlots - raftDisplayedSlots) * 0.08;

  const builtKeys = BUILDING_RENDER_ORDER.filter(isBuiltKey);
  // 虚线边框(标记"扩建出的格子")的分界线用初始格数, 与当前流域无关, 否则会造成格子数量随流域忽大忽小的观感
  const baseCount = CONFIG.INITIAL_RAFT_SLOTS;
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
export let onboardingStep = null; // null | "character" | "pet"
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

export function startOnboardingIfNeeded() {
  if (!state.character) onboardingStep = "character";
  else if (!state.pet) onboardingStep = "pet";
  else onboardingStep = null;
}

export function handleOnboardingClick(cx, cy) {
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
  }
}

let lastRippleSpawnAt = 0;

// 供 canvas 点击处理 (main.js) 判定"是否点在宠物身上"
export function getPetLastDrawPos() { return petLastDrawPos; }

// 绘制单帧场景 (main.js 的单一 rAF 循环每帧调用一次; 本函数不再自行调度 requestAnimationFrame,
// 调度权收归 main.js 的单一循环, 见 Stage 2 重构说明)
export function drawScene() {
  if (onboardingStep === "character") { drawCharacterSelectScreen(); return; }
  if (onboardingStep === "pet") { drawPetSelectScreen(); return; }

  if (fishingState !== "idle") renderFishRow();
  updateBottleDrift();

  ctx.clearRect(0, 0, 360, 420);

  // 咬钩预警期间整个画面轻微抖动(随时间衰减), 用 ctx.save/translate 包裹后续所有绘制, 结尾 ctx.restore() 还原
  ctx.save();
  if (fishingState === "bitealert") {
    const alertElapsed = Date.now() - biteAlertStartAt;
    const shakeDecay = Math.max(0, 1 - alertElapsed / MINIGAME_CONFIG.biteAlertDurationMs);
    const shakeAmp = MINIGAME_CONFIG.biteAlertShakeAmp * shakeDecay;
    ctx.translate((Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp);
  }

  drawWater();

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

  // 咬钩预警: 冻结画面显示"❗咬钩了!"跳动大字 (小游戏正式开始前的缓冲提示)
  if (fishingState === "bitealert") {
    drawBiteAlert();
  }

  // 稀有/传说鱼精准小游戏: 逻辑更新 + 绘制 (居中浮层, 详见 startMinigame/updateMinigame/drawMinigame)
  if (fishingState === "minigame" && minigame) {
    updateMinigame();
    drawMinigame();
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
  ctx.restore(); // 与开头 ctx.save()/咬钩预警抖动 配对
}

// canvas 点击: 判定"是否点在宠物身上", 供 main.js 绑定 click 事件时复用
export function isPetHit(cx, cy) {
  if (!state.pet) return false;
  const dx = cx - petLastDrawPos.x, dy = cy - petLastDrawPos.y;
  return Math.sqrt(dx * dx + dy * dy) <= petLastDrawPos.r;
}
