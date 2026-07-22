// ====== audio.js: 合成音效系统 (Web Audio API, 无外部音频文件) ======
// 依赖: state.js (读取/持久化静音设置)。本文件保持"纯粹": 只提供 sfx.xxx() 调用接口,
// 所有触发时机由业务代码 (fishing.js/actions.js/systems.js/ui.js/main.js) 自行决定。
// 任何时候音频不可用 (AudioContext 创建失败/浏览器策略限制等), 所有 play 调用都安全地静默跳过,
// 绝不抛出异常影响游戏逻辑。
//
// 音色基调 (playtest反馈后调整): 整体是放松向的漂流生存游戏, 音效应像柔和风铃/木琴,
// 而不是街机蜂鸣。全文件不使用 "square" 波形 —— 旋律音一律 triangle, 呼啸/滑音一律 sine。

import { state, save } from "./state.js";

// ====== 可调数值: 频率(Hz)/时长(秒)/音量(0~1) ======
const VOL = {
  master: 0.35,      // 全局主音量 (原0.5, 调低整体响度)
  cast: 0.21,         // 原0.35的0.6倍
  commonCatch: 0.24,
  biteAlert: 0.22,
  hookHit: 0.28,
  hookMiss: 0.2,
  rareCatch: 0.28,
  legendaryCatch: 0.32,
  escape: 0.24,
  build: 0.24,
  craft: 0.22,
  chestOpen: 0.28,
  error: 0.18,
  achievement: 0.28,
  vibrate: 0.08, // 开场剧情"手机震动"专用, 音量刻意压得很低
};

const NOTE = {
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51,
};

// 每个音符起音的柔和渐入时长(秒), 消除音头突兀的"咔哒"感
const ATTACK_S = 0.02;
// 每个音符在标称时长之后额外延长的自然衰减尾巴(秒), 让声音"淡出"而不是被切断
const RELEASE_TAIL_S = 0.04;

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
// tone: 单个音符/滑音。freq: 起始频率(Hz), delay: 相对当前时刻的延迟(秒), dur: 标称时长(秒),
// waveType: "sine"|"triangle" (本文件不再使用 "square"/"sawtooth"), vol: 音量(0~1),
// slideToFreq: 若提供则频率线性滑到该值(可选)。
// 起音带 ATTACK_S 柔和渐入, 衰减比标称 dur 多拖 RELEASE_TAIL_S 秒, 让每个音符自然淡出。
function tone(freq, delay, dur, waveType, vol, slideToFreq) {
  if (isMuted()) return;
  const c = ensureContext();
  if (!c) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const attack = Math.min(ATTACK_S, dur * 0.4); // 短音符按比例收缩起音, 避免起音比音符本身还长
    const releaseEnd = t0 + dur + RELEASE_TAIL_S;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = waveType || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideToFreq) osc.frequency.linearRampToValueAtTime(slideToFreq, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, releaseEnd);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(releaseEnd + 0.02);
  } catch (e) { /* 静默失败, 不影响游戏逻辑 */ }
}

// noiseBurst: 白噪声短脉冲 (用于水花等轻微打击感音效)
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

// vibrateBuzz: 低沉手机震动感, 120Hz sine + 手写的快速增益颤音(每40ms起伏一次), 全程约0.3s,
// 音量刻意压得很低。不用额外LFO振荡器, 直接在gain上排一串短促ramp, 和其它音效保持同样朴素的实现风格。
function vibrateBuzz(delay, dur, vol) {
  if (isMuted()) return;
  const c = ensureContext();
  if (!c) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t0);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t0);
    const step = 0.04; // 颤音周期(s), 制造"嗡嗡"的断续感
    let t = t0;
    while (t < t0 + dur) {
      gain.gain.linearRampToValueAtTime(vol, t + step * 0.3);
      gain.gain.linearRampToValueAtTime(vol * 0.25, t + step);
      t += step;
    }
    const releaseEnd = t0 + dur + RELEASE_TAIL_S;
    gain.gain.linearRampToValueAtTime(0.001, releaseEnd);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(releaseEnd + 0.02);
  } catch (e) { /* 静默失败 */ }
}

// ====== 音效集合 ======
export const sfx = {
  // 抛竿: 下滑的sine呼啸声(起始频率降低) + 更轻的噪声水花, 约0.3s
  cast() {
    tone(400, 0, 0.3, "sine", VOL.cast, 170);
    noiseBurst(0.15, 0.18, VOL.cast * 0.5);
  },
  // 普通鱼上钩: 短促两音上扬 C5->E5, triangle, 约0.2s
  commonCatch() {
    tone(NOTE.C5, 0, 0.1, "triangle", VOL.commonCatch);
    tone(NOTE.E5, 0.1, 0.12, "triangle", VOL.commonCatch);
  },
  // 咬钩预警: 保留"引起注意"但不刺耳 —— triangle, 第三响降低到~880Hz, 音量收在0.12左右
  biteAlert() {
    tone(700, 0, 0.1, "triangle", VOL.biteAlert);
    tone(700, 0.15, 0.1, "triangle", VOL.biteAlert);
    tone(880, 0.32, 0.13, "triangle", 0.12);
  },
  // 小游戏点击命中: 明亮两音确认, triangle
  hookHit() {
    tone(NOTE.E5, 0, 0.08, "triangle", VOL.hookHit);
    tone(NOTE.A5, 0.06, 0.1, "triangle", VOL.hookHit);
  },
  // 小游戏点击落空: 低沉短促音, triangle (区别于逃脱音效)
  hookMiss() {
    tone(150, 0, 0.12, "triangle", VOL.hookMiss);
  },
  // 稀有鱼上钩: 三音上升琶音, triangle, 约0.4s
  rareCatch() {
    tone(NOTE.C5, 0, 0.12, "triangle", VOL.rareCatch);
    tone(NOTE.E5, 0.12, 0.12, "triangle", VOL.rareCatch);
    tone(NOTE.G5, 0.24, 0.16, "triangle", VOL.rareCatch);
  },
  // 传说鱼上钩: 五音号角 + 结尾和弦, triangle主体 + 一层柔和sine, 所有音符不超过C6(1046.5Hz)
  legendaryCatch() {
    tone(NOTE.C5, 0, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.E5, 0.1, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.G5, 0.2, 0.1, "triangle", VOL.legendaryCatch);
    tone(NOTE.C6, 0.3, 0.12, "triangle", VOL.legendaryCatch);
    tone(NOTE.C6, 0.44, 0.26, "triangle", VOL.legendaryCatch);
    tone(NOTE.G5, 0.44, 0.26, "sine", VOL.legendaryCatch * 0.6);
  },
  // 逃脱: 下滑sine, 泄气感, 约0.4s
  escape() {
    tone(420, 0, 0.4, "sine", VOL.escape, 120);
  },
  // 建造完成: 轻敲击音 + 三音三角波上升
  build() {
    noiseBurst(0, 0.06, VOL.build * 0.6);
    tone(NOTE.C5, 0.08, 0.08, "triangle", VOL.build);
    tone(NOTE.E5, 0.16, 0.08, "triangle", VOL.build);
    tone(NOTE.G5, 0.24, 0.1, "triangle", VOL.build);
  },
  // 打造完成: 柔和双击, triangle
  craft() {
    tone(880, 0, 0.06, "triangle", VOL.craft);
    tone(1046.5, 0.08, 0.07, "triangle", VOL.craft);
  },
  // 开箱/漂流瓶: 高音闪光琶音, sine, 约0.3s
  chestOpen() {
    tone(NOTE.C6, 0, 0.08, "sine", VOL.chestOpen);
    tone(NOTE.D6, 0.06, 0.08, "sine", VOL.chestOpen);
    tone(NOTE.E6, 0.12, 0.14, "sine", VOL.chestOpen);
  },
  // 错误/资源或精力不足: 低沉柔和双击闷响 (sine, 明确的"不行"感但不刺耳)
  error() {
    tone(200, 0, 0.1, "sine", VOL.error);
    tone(190, 0.12, 0.12, "sine", VOL.error);
  },
  // 成就解锁: 骄傲两音钟声, sine, 区别于上钩音效
  achievement() {
    tone(NOTE.G5, 0, 0.14, "sine", VOL.achievement);
    tone(NOTE.C6, 0.1, 0.24, "sine", VOL.achievement);
  },
  // 开场剧情专用: 手机震动感(仅phase1"职场追杀"那几句配合屏幕抖动使用) + 真机haptics(能力检测, 不支持时静默跳过)
  vibrate() {
    vibrateBuzz(0, 0.3, VOL.vibrate);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate([120, 80, 120]); } catch (e) { /* 部分环境策略限制会抛错, 静默忽略 */ }
    }
  },
};
