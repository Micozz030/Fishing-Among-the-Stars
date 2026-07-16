// ====== audio.js: 合成音效系统 (Web Audio API, 无外部音频文件) ======
// 依赖: state.js (读取/持久化静音设置)。本文件保持"纯粹": 只提供 sfx.xxx() 调用接口,
// 所有触发时机由业务代码 (fishing.js/actions.js/systems.js/ui.js/main.js) 自行决定。
// 任何时候音频不可用 (AudioContext 创建失败/浏览器策略限制等), 所有 play 调用都安全地静默跳过,
// 绝不抛出异常影响游戏逻辑。

import { state, save } from "./state.js";

// ====== 可调数值: 频率(Hz)/时长(秒)/音量(0~1) ======
const VOL = {
  master: 0.5,       // 全局主音量
  cast: 0.35,
  commonCatch: 0.3,
  biteAlert: 0.4,
  hookHit: 0.35,
  hookMiss: 0.25,
  rareCatch: 0.35,
  legendaryCatch: 0.4,
  escape: 0.3,
  build: 0.3,
  craft: 0.3,
  chestOpen: 0.35,
  uiClick: 0.15,
  error: 0.25,
  achievement: 0.35,
};

const NOTE = {
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51,
};

// ====== 懒加载 AudioContext (移动端自动播放策略要求在用户手势内创建/恢复) ======
let ctx = null;
let masterGain = null;

function ensureContext() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = VOL.master;
    masterGain.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

// 在首次用户手势时创建/恢复 AudioContext。main.js 在启动时调用一次即可。
export function initAudioOnGesture() {
  const resume = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") {
      c.resume().catch(() => {});
    }
  };
  ["pointerdown", "keydown", "touchstart"].forEach(evt => {
    document.addEventListener(evt, resume, { passive: true });
  });
}

// ====== 静音开关 (持久化在 state.settings.muted) ======
export function isMuted() { return !!(state.settings && state.settings.muted); }
export function setMuted(muted) {
  if (!state.settings) state.settings = { muted: false };
  state.settings.muted = !!muted;
  save();
}
export function toggleMute() {
  setMuted(!isMuted());
  return isMuted();
}

// ====== 基础发声原语 ======
// tone: 单个音符/滑音。freq: 起始频率(Hz), delay: 相对当前时刻的延迟(秒), dur: 时长(秒),
// waveType: "sine"|"square"|"triangle"|"sawtooth", vol: 音量(0~1), slideToFreq: 若提供则频率线性滑到该值(可选)
function tone(freq, delay, dur, waveType, vol, slideToFreq) {
  if (isMuted()) return;
  const c = ensureContext();
  if (!c) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = waveType || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideToFreq) osc.frequency.linearRampToValueAtTime(slideToFreq, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.015, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* 静默失败, 不影响游戏逻辑 */ }
}

// noiseBurst: 白噪声短脉冲 (用于水花/敲击等打击感音效)
function noiseBurst(delay, dur, vol) {
  if (isMuted()) return;
  const c = ensureContext();
  if (!c) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain);
    gain.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch (e) { /* 静默失败 */ }
}

// ====== 音效集合 ======
export const sfx = {
  // 抛竿: 下滑的sine呼啸声 + 一点噪声水花, 约0.35s
  cast() {
    tone(520, 0, 0.3, "sine", VOL.cast, 220);
    noiseBurst(0.15, 0.18, VOL.cast * 0.6);
  },
  // 普通鱼上钩: 短促两音上扬 C5->E5, 约0.2s
  commonCatch() {
    tone(NOTE.C5, 0, 0.1, "square", VOL.commonCatch);
    tone(NOTE.E5, 0.1, 0.12, "square", VOL.commonCatch);
  },
  // 咬钩预警: 急促双响 + 更高的第三响, 约0.45s
  biteAlert() {
    tone(700, 0, 0.1, "square", VOL.biteAlert);
    tone(700, 0.15, 0.1, "square", VOL.biteAlert);
    tone(920, 0.32, 0.13, "square", VOL.biteAlert);
  },
  // 小游戏点击命中: 明亮两音确认
  hookHit() {
    tone(NOTE.E5, 0, 0.08, "triangle", VOL.hookHit);
    tone(NOTE.A5, 0.06, 0.1, "triangle", VOL.hookHit);
  },
  // 小游戏点击落空: 低沉短促蜂鸣 (区别于逃脱音效)
  hookMiss() {
    tone(150, 0, 0.12, "square", VOL.hookMiss);
  },
  // 稀有鱼上钩: 三音上升琶音, 约0.4s
  rareCatch() {
    tone(NOTE.C5, 0, 0.12, "triangle", VOL.rareCatch);
    tone(NOTE.E5, 0.12, 0.12, "triangle", VOL.rareCatch);
    tone(NOTE.G5, 0.24, 0.16, "triangle", VOL.rareCatch);
  },
  // 传说鱼上钩: 五音号角 + 结尾和弦, 约0.7s
  legendaryCatch() {
    tone(NOTE.C5, 0, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.E5, 0.1, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.G5, 0.2, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.C6, 0.3, 0.12, "triangle", VOL.legendaryCatch);
    tone(NOTE.C6, 0.44, 0.26, "triangle", VOL.legendaryCatch);
    tone(NOTE.E6, 0.44, 0.26, "sine", VOL.legendaryCatch * 0.7);
  },
  // 逃脱: 下滑音, 泄气感, 约0.4s
  escape() {
    tone(500, 0, 0.4, "sawtooth", VOL.escape, 120);
  },
  // 建造完成: 敲击音 + 三音三角波上升
  build() {
    noiseBurst(0, 0.06, VOL.build * 0.8);
    tone(NOTE.C5, 0.08, 0.08, "triangle", VOL.build);
    tone(NOTE.E5, 0.16, 0.08, "triangle", VOL.build);
    tone(NOTE.G5, 0.24, 0.1, "triangle", VOL.build);
  },
  // 打造完成: 金属感双击
  craft() {
    tone(1200, 0, 0.05, "square", VOL.craft);
    tone(1500, 0.07, 0.05, "square", VOL.craft);
  },
  // 开箱/漂流瓶: 高音闪光琶音, 约0.3s
  chestOpen() {
    tone(NOTE.C6, 0, 0.08, "sine", VOL.chestOpen);
    tone(NOTE.D6, 0.06, 0.08, "sine", VOL.chestOpen);
    tone(NOTE.E6, 0.12, 0.14, "sine", VOL.chestOpen);
  },
  // UI点击: 单一1200Hz短促蜂鸣, 音量很低
  uiClick() {
    tone(1200, 0, 0.04, "square", VOL.uiClick);
  },
  // 错误/资源或精力不足: 低沉方波蜂鸣
  error() {
    tone(180, 0, 0.15, "square", VOL.error);
  },
  // 成就解锁: 骄傲两音钟声, 区别于上钩音效
  achievement() {
    tone(NOTE.G5, 0, 0.14, "sine", VOL.achievement);
    tone(NOTE.C6, 0.1, 0.24, "sine", VOL.achievement);
  },
};
