// ====== intro.js: 开场剧情 (视觉小说式对话框) ======
// 仅在全新存档(从未见过开场)时由 main.js 触发一次; 也可以从「指引」面板的
// "重看开场"按钮重放(重放不再发放行囊)。只依赖 state.js, 不反向依赖任何业务模块。
import { state, save, addRes, toast } from "./state.js";

const STARTER_PACK = { seaweed: 5, rope: 2, bread: 2 };
const TYPE_SPEED_MS = 30; // 打字机效果: 每字间隔(ms)
const FLASH_DURATION_MS = 500; // 传送白闪持续时间, 需与 style.css 的 introWhiteFlash 动画时长一致

// 剧本: phase 1(湖边, 遮罩变暗) -> 白闪过渡 -> phase 2(木排上, 游戏画布若隐若现)
// speaker: "narration"(旁白, 无头像无名字, 斜体) | "maru"(玛鲁, 左侧头像+名字) | "hero"(你, 仅名字无头像)
// expr: 仅 speaker==="maru" 时使用, 对应 assets/maru_expressions.png 精灵表里的表情序号(1~6)
const SCRIPT = [
  { phase: 1, speaker: "narration", text: "难得的休息日。你坐在湖边,鱼竿稳稳架着——难得不用对着电脑。" },
  { phase: 1, speaker: "narration", text: "手机震动。钉钉。划掉。" },
  { phase: 1, speaker: "narration", text: "又震动。「老板(急)」的来电。划掉。" },
  { phase: 1, speaker: "narration", text: "语音轰炸开始刷屏:「在吗」「方便接个电话吗」「那个文档改一下」" },
  { phase: 1, speaker: "narration", text: "你盯着屏幕看了两秒,深吸一口气——" },
  { phase: 1, speaker: "narration", text: "手一甩,手机划出一道弧线,「咚」地沉进了湖里。" },
  { phase: 1, speaker: "narration", text: "水花还没落下,浮漂猛地沉了下去。" },
  { phase: 1, speaker: "narration", text: "线绷得笔直!水底有什么东西在发光,鳞片的光泽像是从另一个世界透出来的。" },
  { phase: 1, speaker: "hero", text: "难得休息一天……今天必须钓上来!" },
  { phase: 1, speaker: "narration", text: "水面裂开一道光,把你和那条鱼一起吞了进去。", flashAfter: true },

  { phase: 2, speaker: "narration", text: "回过神来,脚下已经是木排的甲板。手里的鱼竿,变成了行囊和绳索。" },
  { phase: 2, speaker: "maru", expr: 2, text: "哟,可算是上船了。再磨蹭,我就把你的份额吃完了。" },
  { phase: 2, speaker: "narration", text: "戴尖顶帽的女巫坐在木排边缘晃着腿,绿眼睛笑成了月牙。" },
  { phase: 2, speaker: "narration", text: "你脑子里还在转——我不是在钓鱼吗?可看着这张莫名熟悉的脸,疑问又散了大半。" },
  { phase: 2, speaker: "hero", text: "……我们,是说好今天出发?" },
  { phase: 2, speaker: "maru", expr: 1, text: "可不是嘛。风向正好,再不走潮水就该变了。" },
  { phase: 2, speaker: "maru", expr: 2, text: "怎么,钓了一晚上鱼,脑子还没转过来?" },
  { phase: 2, speaker: "narration", text: "你低头看看手里的绳索,再看看眼前陌生却莫名\"该往那走\"的水域——有个念头忽然清晰了:" },
  { phase: 2, speaker: "narration", text: "环游这片水世界,钓遍每一处水域的鱼。这件事,你已经准备很久了。" },
  { phase: 2, speaker: "hero", text: "……走吧。风向不等人。" },
  { phase: 2, speaker: "maru", expr: 5, text: "这才对嘛。喏,路上的吃食我都备好了。" },
  { phase: 2, speaker: "maru", expr: 3, text: "剩下的就看你自己的本事了——别怪我没提醒你,这片水域可不是什么善茬。" },
  { phase: 2, speaker: "narration", text: "木排缓缓离岸,朝着陌生又熟悉的远方漂去。" },
];

let active = false;
let lineIndex = 0;
let isTypingNow = false;
let typingTimer = null;
let grantOnComplete = true;
let onDone = null;
let wired = false;

function el(id) { return document.getElementById(id); }

function applyPhaseVisuals(phase) {
  const tint = el("intro-scene-tint");
  tint.classList.toggle("intro-tint-dim", phase === 1);
  tint.classList.toggle("intro-tint-normal", phase === 2);
}

function typeLine(fullText) {
  const textEl = el("intro-text");
  textEl.textContent = "";
  let charIndex = 0;
  isTypingNow = true;
  clearTimeout(typingTimer);
  const step = () => {
    charIndex++;
    textEl.textContent = fullText.slice(0, charIndex);
    if (charIndex >= fullText.length) { isTypingNow = false; return; }
    typingTimer = setTimeout(step, TYPE_SPEED_MS);
  };
  step();
}

function completeCurrentLine() {
  clearTimeout(typingTimer);
  const line = SCRIPT[lineIndex];
  if (line) el("intro-text").textContent = line.text;
  isTypingNow = false;
}

function showLine() {
  const line = SCRIPT[lineIndex];
  if (!line) { finishIntro(); return; }

  applyPhaseVisuals(line.phase);

  const nameEl = el("intro-speaker-name");
  const avatarEl = el("intro-avatar");
  const boxEl = el("intro-dialogue-box");

  boxEl.classList.toggle("intro-narration", line.speaker === "narration");

  if (line.speaker === "maru") {
    nameEl.textContent = "玛鲁";
    nameEl.classList.remove("hidden");
    avatarEl.className = "intro-avatar maru-expr-" + line.expr;
  } else if (line.speaker === "hero") {
    nameEl.textContent = "你";
    nameEl.classList.remove("hidden");
    avatarEl.className = "intro-avatar hidden";
  } else {
    nameEl.classList.add("hidden");
    avatarEl.className = "intro-avatar hidden";
  }

  typeLine(line.text);
}

// 传送白闪: 播放动画的同时切到下一行(下一行的 phase2 遮罩会在动画进行中悄悄换好)
function triggerWhiteFlash(next) {
  const flashEl = el("intro-white-flash");
  flashEl.classList.remove("flash");
  void flashEl.offsetWidth; // 强制重排以重新触发动画
  flashEl.classList.add("flash");
  setTimeout(next, FLASH_DURATION_MS);
}

function advance() {
  if (!active) return;
  if (isTypingNow) { completeCurrentLine(); return; }

  const line = SCRIPT[lineIndex];
  if (line && line.flashAfter) {
    triggerWhiteFlash(() => { lineIndex++; showLine(); });
    return;
  }
  lineIndex++;
  showLine();
}

function finishIntro() {
  active = false;
  el("intro-overlay").classList.add("hidden");
  clearTimeout(typingTimer);

  if (grantOnComplete) {
    addRes(STARTER_PACK);
    toast("🎒 获得玛鲁的行囊: 水草饵×5 绳子×2 面包×2");
    state.introSeen = true;
    save();
  }

  const cb = onDone;
  onDone = null;
  if (cb) cb();
}

function wireOnce() {
  if (wired) return;
  wired = true;
  el("intro-dialogue-box").addEventListener("click", advance);
  el("intro-skip-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    skipIntro();
  });
}

// opts.grantOnComplete: 是否在结束时发放玛鲁的行囊 + 标记 introSeen(重放开场时应传 false)
// opts.onComplete: 结束(含跳过)后的回调, 例如首次播放结束后继续走角色/宠物选择流程
export function startIntro(opts = {}) {
  wireOnce();
  grantOnComplete = opts.grantOnComplete !== false;
  onDone = opts.onComplete || null;
  lineIndex = 0;
  active = true;
  el("intro-overlay").classList.remove("hidden");
  showLine();
}

// "跳过 ▸" 按钮: 直接跳到最终的行囊发放/剧情结束步骤(而不是逐字关闭)
export function skipIntro() {
  if (!active) return;
  active = false;
  clearTimeout(typingTimer);
  finishIntro();
}
