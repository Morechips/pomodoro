/*
 * app.js（整合版）
 * ------------------------------------------------------------
 * 本文件整合了项目里多个 JS 功能模块。
 * 当前你要求先完善“点击现在感受 -> 右上角 Toast”这部分注释，
 * 所以下面第一个模块会有最详细的中文讲解。
 */

/* ============================================================
 * 模块：Feel Toast（点击“现在感受”后的右上角弹窗）
 * ------------------------------------------------------------
 * 你可以把它理解成 4 个步骤：
 * 1) 识别用户点了哪个感受按钮（精神不错 / 还行 / 有点累）
 * 2) 根据感受 + 当前专注分钟数，随机选标题/副标题/建议
 * 3) 在右上角展示单例 Toast（永远只有一个，不堆叠）
 * 4) 3~5 秒自动关闭；hover/focus 暂停倒计时；支持“换个建议”
 *
 * 主要技术点：
 * - 原生 DOM 动态创建节点（不依赖框架）
 * - setTimeout 做自动关闭计时，配合“剩余时间”实现暂停/恢复
 * - CSS 过渡做轻量动效（淡入、淡出）
 * - role="status" + aria-live="polite" 做无障碍播报
 * ============================================================ */

/* --- ① 配置层：允许的分钟档位，主要用于根据标题文本识别当前专注时长 --- */
const SUPPORTED_MINUTES = [25, 50, 90];

/* --- ② 文案池：按感受分类，再按分钟细分建议 ---
 * 扩展方法（后续你自己加文案就看这里）：
 * 1. 在对应 feel 的 titles / subtitles 里加字符串
 * 2. 在 tipsByTime 的 "25" / "50" / "90" / default 里加建议
 * 3. 可用 {m} 占位符，渲染时会自动替换成当前分钟数
 */
const FEEL_COPY = {
  good: {
    icon: "✨",
    titles: ["状态真不错", "今天手感在线", "能量满格（先别用光）"],
    subtitles: [
      "{m} 分钟完成得很稳，节奏继续保持。",
      "这轮 {m} 分钟很顺，先轻休息再起步。",
      "{m} 分钟状态在线，记得补水。",
    ],
    tipsByTime: {
      "25": ["站起来走 30 秒", "喝两口水", "把下一步写成一句话", "看远处 20 秒"],
      "50": ["起身活动 1 分钟", "放松肩颈 15 秒", "把任务拆成接下来两步", "闭眼 10 秒再继续"],
      "90": ["先休息 3 分钟", "补水并离屏 1 分钟", "先做最低阻力的一小步", "把下一轮目标缩成一句话"],
      default: ["站起来走两步", "喝一口水", "写一句下一步", "离屏 20 秒"],
    },
  },
  ok: {
    icon: "💛",
    titles: ["还行就很好～", "稳定输出中", "状态：可用"],
    subtitles: [
      "{m} 分钟先稳住，不拼爆发。",
      "这轮 {m} 分钟不错，给自己一点缓冲。",
      "{m} 分钟完成，慢一点也在前进。",
    ],
    tipsByTime: {
      "25": ["伸个懒腰", "放松肩颈 10 秒", "写 3 个关键词总结", "看窗外 20 秒"],
      "50": ["活动肩颈 20 秒", "深呼吸 3 次", "只保留一个最小下一步", "离屏 30 秒"],
      "90": ["先慢走 1 分钟", "补水 + 放松眼睛", "把下一轮目标减半", "先做 2 分钟热身任务"],
      default: ["伸展一下身体", "放松肩颈", "写 3 个关键词", "离屏 20 秒"],
    },
  },
  tired: {
    icon: "🌿",
    titles: ["辛苦啦", "检测到：电量偏低", "今天也很努力了"],
    subtitles: [
      "{m} 分钟已经很不容易，先照顾身体。",
      "{m} 分钟后先充电，再继续会更稳。",
      "这轮 {m} 分钟做得够好了，不用硬撑。",
    ],
    tipsByTime: {
      "25": ["离开椅子走两步", "深呼吸 5 次", "闭眼 15 秒", "补水 + 放松眼睛"],
      "50": ["起身走 1 分钟", "肩颈放松 20 秒", "先停 1 分钟再回来", "只做最小可行动作"],
      "90": ["休息 3-5 分钟", "补水并离屏", "降低下一轮难度", "先做 1 个最简单动作"],
      default: ["离开椅子走两步", "深呼吸几次", "短暂闭眼", "补水放松"],
    },
  },
};

/* --- ③ 常量与映射 ---
 * STYLE_ID：防止重复注入样式
 * FEEL_MAP：当按钮没写 data-feel 时，用中文文本做兜底识别
 */
const STYLE_ID = "feel-toast-style";
const FEEL_MAP = {
  精神不错: "good",
  还行: "ok",
  有点累: "tired",
};

/* --- ④ 工具函数：随机抽取 --- */
function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickTwo(list) {
  if (!list.length) return ["", ""];
  if (list.length === 1) return [list[0], list[0]];
  const copy = [...list];
  const first = copy.splice(Math.floor(Math.random() * copy.length), 1)[0];
  const second = copy[Math.floor(Math.random() * copy.length)];
  return [first, second];
}

/* --- ⑤ 工具函数：把文案中的 {m} 替换成分钟数 --- */
function withMinutes(text, minutes) {
  return text.replaceAll("{m}", String(minutes));
}

/* --- ⑥ 工具函数：识别按钮代表的感受 ---
 * 识别顺序：
 * 1) 优先 data-feel（最稳）
 * 2) 再看按钮文本（兜底）
 */
function normalizeFeel(node) {
  const explicit = node.dataset.feel;
  if (explicit && FEEL_COPY[explicit]) return explicit;
  const text = node.textContent.trim().replace(/^[^\u4e00-\u9fa5]*/, "");
  return FEEL_MAP[text] || null;
}

/* --- ⑦ 工具函数：读取当前页面专注分钟数 ---
 * 实现思路：
 * 从 h1 / 副标题里抓 “xx 分钟”，只接受 25/50/90 三档，异常则回退 25。
 */
function getCurrentMinutes() {
  const titleText = document.querySelector("h1.fadeInAfter")?.textContent || "";
  const subText = document.querySelector("p.encourage")?.textContent || "";
  const match = `${titleText} ${subText}`.match(/(\d+)\s*分钟/);
  const minutes = Number(match?.[1]);
  if (SUPPORTED_MINUTES.includes(minutes)) return minutes;
  return 25;
}

/* --- ⑧ 工具函数：按感受+分钟取建议池，并完成 {m} 替换 --- */
function getTipsFor(feelData, minutes) {
  const bucket = feelData.tipsByTime?.[String(minutes)] || feelData.tipsByTime?.default || [];
  return bucket.map((tip) => withMinutes(tip, minutes));
}

/* --- ⑨ 样式注入：把 Toast 所需 CSS 注入到 head ---
 * 说明：
 * - 只注入一次（通过 STYLE_ID 去重）
 * - 全部复用你页面的主题变量，不新增主色体系
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .feel-toast {
      position: fixed;
      top: 24px;
      right: 24px;
      width: min(92vw, 320px);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--card);
      color: var(--fg);
      box-shadow: 0 12px 28px rgba(0,0,0,.07);
      z-index: 1400;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      padding: 12px;
      opacity: 0;
      transform: translateX(4px);
      transition: opacity 150ms ease, transform 150ms ease;
      user-select: none;
    }
    .feel-toast.is-visible {
      opacity: 1;
      transform: translateX(0);
    }
    .feel-toast.is-leaving {
      opacity: 0;
      transform: translateY(-4px);
    }
    .feel-toast-icon {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-pill);
      background: var(--primarySoft);
      color: var(--primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      margin-top: 1px;
      line-height: 1;
    }
    .feel-toast-body { min-width: 0; }
    .feel-toast-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
      margin: 0;
      color: var(--fg);
    }
    .feel-toast-subtitle {
      margin: 4px 0 0;
      font-size: 13px;
      line-height: 1.4;
      color: var(--muted);
    }
    .feel-toast-close {
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .feel-toast-close:hover,
    .feel-toast-close:focus-visible {
      background: var(--primarySoft);
      color: var(--primary);
      outline: none;
    }
    .feel-toast-expand {
      margin-top: 10px;
      opacity: 1;
      transition: opacity 120ms ease;
    }
    .feel-toast-tip-label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .feel-toast-tips {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .feel-toast-tips li {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      margin: 2px 0;
      position: relative;
      padding-left: 12px;
    }
    .feel-toast-tips li::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: var(--radius-pill);
      background: var(--primary);
      position: absolute;
      left: 0;
      top: 8px;
    }
    .feel-toast-actions {
      margin-top: 10px;
      display: flex;
      justify-content: flex-end;
    }
    .feel-toast-ack {
      border: 0;
      border-radius: var(--radius-md);
      background: var(--primarySoft);
      color: var(--primary);
      font-size: 12px;
      padding: 7px 12px;
      cursor: pointer;
    }
    .feel-toast-ack:hover,
    .feel-toast-ack:focus-visible {
      background: rgba(255,107,74,.22);
      outline: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .feel-toast {
        transition: opacity 120ms ease;
        transform: none;
      }
      .feel-toast.is-visible,
      .feel-toast.is-leaving {
        transform: none;
      }
    }
  `;
  document.head.appendChild(style);
}

/* --- ⑩ 结构创建：生成 Toast DOM 节点 ---
 * 重点：
 * - role="status" + aria-live="polite"：屏幕阅读器会温和播报，不会像 alert 打断用户。
 * - 结构里直接包含“换个建议”按钮，点击后只换内容，不新建第二个 Toast。
 */
function createToast() {
  const el = document.createElement("section");
  el.className = "feel-toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");

  el.innerHTML = `
    <div class="feel-toast-icon" aria-hidden="true"></div>
    <div class="feel-toast-body">
      <h3 class="feel-toast-title"></h3>
      <p class="feel-toast-subtitle"></p>
      <div class="feel-toast-expand" aria-hidden="false">
        <div class="feel-toast-tip-label">建议</div>
        <ul class="feel-toast-tips"></ul>
        <div class="feel-toast-actions">
          <button type="button" class="feel-toast-ack">换个建议</button>
        </div>
      </div>
    </div>
    <button type="button" class="feel-toast-close" aria-label="关闭提示">×</button>
  `;

  return {
    el,
    icon: el.querySelector(".feel-toast-icon"),
    title: el.querySelector(".feel-toast-title"),
    subtitle: el.querySelector(".feel-toast-subtitle"),
    tips: el.querySelector(".feel-toast-tips"),
    close: el.querySelector(".feel-toast-close"),
    ack: el.querySelector(".feel-toast-ack"),
  };
}

/* --- ⑪ 对外入口：初始化 Feel Toast ---
 * 技术实现摘要：
 * - 用闭包保存“当前 toast 引用、计时器、剩余时长、当前感受”状态
 * - 通过 ensureToast 实现“单例 Toast”
 * - 通过 pause/resume 实现 hover/focus 暂停自动消失
 */
function initFeelToast(options = {}) {
  const selector = options.selector || ".mood";
  const minDuration = options.minDurationMs || 3200;
  const maxDuration = options.maxDurationMs || 4800;

  injectStyles();

  let timerId = null;
  let closeAt = 0;
  let remaining = 0;
  let refs = null;
  let activeFeel = null;

  /* --- 清理定时器，避免重复计时 --- */
  const clearTimer = () => {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
  };

  /* --- 每次触发给一个随机展示时长（3.2s~4.8s） --- */
  const randomDuration = () =>
    Math.floor(minDuration + Math.random() * (maxDuration - minDuration + 1));

  /* --- 真正销毁 Toast 节点并重置状态 --- */
  const removeToast = () => {
    clearTimer();
    if (refs?.el?.isConnected) refs.el.remove();
    refs = null;
    remaining = 0;
    closeAt = 0;
    activeFeel = null;
  };

  /* --- 关闭 Toast：先走离场动画，再移除节点 --- */
  const closeToast = () => {
    if (!refs) return;
    clearTimer();
    refs.el.classList.remove("is-visible");
    refs.el.classList.add("is-leaving");

    const done = () => {
      refs?.el?.removeEventListener("transitionend", done);
      removeToast();
    };

    refs.el.addEventListener("transitionend", done);
    setTimeout(done, 200);
  };

  /* --- 启动自动关闭计时 --- */
  const startTimer = (ms) => {
    clearTimer();
    remaining = ms;
    closeAt = Date.now() + remaining;
    timerId = setTimeout(closeToast, remaining);
  };

  /* --- 暂停计时：记录剩余时间 ---
   * 场景：鼠标进入 toast 或 toast 内部元素获得焦点
   */
  const pauseTimer = () => {
    if (!timerId) return;
    remaining = Math.max(0, closeAt - Date.now());
    clearTimer();
  };

  /* --- 恢复计时：从“剩余时间”继续倒计时 --- */
  const resumeTimer = () => {
    if (!refs || timerId || remaining <= 0) return;
    startTimer(remaining);
  };

  /* --- 单例保障：只创建一个 Toast ---
   * 如果已经存在则直接复用，保证“连续点击只替换内容，不堆叠多个 Toast”。
   */
  const ensureToast = () => {
    if (refs) return refs;

    refs = createToast();
    document.body.appendChild(refs.el);

    refs.el.addEventListener("mouseenter", pauseTimer);
    refs.el.addEventListener("mouseleave", resumeTimer);
    refs.el.addEventListener("focusin", pauseTimer);
    refs.el.addEventListener("focusout", () => {
      const next = document.activeElement;
      if (!refs?.el?.contains(next)) resumeTimer();
    });

    refs.close.addEventListener("click", closeToast);
    refs.close.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      closeToast();
    });

    refs.ack.addEventListener("click", (event) => {
      event.preventDefault();
      if (!activeFeel) return;
      renderToast(activeFeel, true);
    });

    return refs;
  };

  /* --- 把随机抽到的文案写入 Toast --- */
  const applyContent = (feelType, minutes) => {
    const feelData = FEEL_COPY[feelType];
    if (!feelData) return;

    const node = ensureToast();
    const [tip1, tip2] = pickTwo(getTipsFor(feelData, minutes));

    node.icon.textContent = feelData.icon;
    node.title.textContent = withMinutes(pickOne(feelData.titles), minutes);
    node.subtitle.textContent = withMinutes(pickOne(feelData.subtitles), minutes);
    node.tips.innerHTML = `<li>${tip1}</li><li>${tip2}</li>`;
  };

  /* --- 对外核心渲染 ---
   * keepVisibleState=true 的场景是“换个建议”：
   * 只换文案，不重复做入场动画；但会重置自动关闭计时。
   */
  const renderToast = (feelType, keepVisibleState = false) => {
    if (!FEEL_COPY[feelType]) return;
    activeFeel = feelType;

    const minutes = getCurrentMinutes();
    applyContent(feelType, minutes);

    const node = ensureToast();
    if (!keepVisibleState) {
      node.el.classList.remove("is-leaving");
      node.el.classList.add("is-visible");
    }
    startTimer(randomDuration());
  };

  /* --- 绑定“现在感受”按钮点击事件 --- */
  /* --- 绑定“现在感受”按钮点击事件 ---
   * 每次点击都执行：识别感受 -> 渲染/替换 Toast -> 重置自动关闭计时。
   */
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      const feelType = normalizeFeel(button);
      if (!feelType) return;
      renderToast(feelType);
    });
  });
}

/* --- 暴露全局初始化函数，供 HTML 入口调用 --- */
/* --- 暴露全局初始化函数，供 HTML 入口脚本调用 --- */
window.initFeelToast = initFeelToast;


/* ============================================================
 * 模块：Rest End Canvas（休息结束时的水波 + 粒子特效）
 * ------------------------------------------------------------
 * 这个模块只负责“视觉特效”，不负责倒计时逻辑。
 * 触发方式：外部在休息倒计时自然结束时调用
 *   playRestEndRippleFx({ anchorEl, primaryColor, primarySoftColor, durationMs })
 *
 * 实现技术：
 * - Canvas 2D API 逐帧绘制
 * - requestAnimationFrame 驱动动画时间轴
 * - createRadialGradient 做水波和粒子的体积感
 * - globalCompositeOperation='lighter' 做柔和叠亮
 * - reduced-motion 下自动降级为更轻的静态过渡
 * ============================================================ */

(function () {
  /* --- 1) 运行态状态容器 ---
   * 把动画相关的数据集中放在一个对象里，便于创建、更新、销毁。
   */
  const fxState = {
    rafId: null,
    container: null,
    canvas: null,
    ctx: null,
    startTs: 0,
    durationMs: 1100,
    rings: [],
    particles: [],
    centerX: 0,
    centerY: 0,
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    primaryColor: "#ff6b4a",
    primarySoftColor: "rgba(255,107,74,.14)",
    rgbPrimary: { r: 255, g: 107, b: 74 },
    rgbSoft: { r: 255, g: 107, b: 74 },
    hostEl: null,
    restoreHostPosition: null,
  };

  /* --- 2) 颜色解析辅助上下文 ---
   * 用 canvas 的 fillStyle 解析 CSS 颜色，统一转成 rgb 数值。
   */
  const colorProbeCtx = document.createElement("canvas").getContext("2d");

  /* --- 3) 基础数学工具：边界、随机、缓动 --- */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function easeOutCubic(t) {
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }

  /* --- 4) 颜色工具：把任意 CSS 颜色转成 RGB，便于拼 rgba --- */
  function parseColorToRgb(color) {
    colorProbeCtx.fillStyle = color;
    const normalized = colorProbeCtx.fillStyle;

    if (normalized.startsWith("#")) {
      let hex = normalized.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map((s) => s + s).join("");
      }
      const int = parseInt(hex, 16);
      return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255,
      };
    }

    const rgb = normalized.match(/\d+(\.\d+)?/g)?.map(Number) || [255, 107, 74];
    return { r: rgb[0] || 255, g: rgb[1] || 107, b: rgb[2] || 74 };
  }

  function rgba({ r, g, b }, alpha) {
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  /* --- 5) 清理函数 ---
   * 负责停止 rAF、移除 canvas 容器、恢复宿主元素样式。
   * 每次新特效开始前也会先调用，避免重复叠加和内存泄漏。
   */
  function clearFxDom() {
    if (fxState.rafId) {
      cancelAnimationFrame(fxState.rafId);
      fxState.rafId = null;
    }
    if (fxState.container && fxState.container.parentNode) {
      fxState.container.parentNode.removeChild(fxState.container);
    }
    if (fxState.hostEl && fxState.restoreHostPosition !== null) {
      if (fxState.restoreHostPosition) {
        fxState.hostEl.style.position = fxState.restoreHostPosition;
      } else {
        fxState.hostEl.style.removeProperty("position");
      }
    }
    fxState.container = null;
    fxState.canvas = null;
    fxState.ctx = null;
    fxState.rings = [];
    fxState.particles = [];
    fxState.hostEl = null;
    fxState.restoreHostPosition = null;
  }

  /* --- 6) 波纹参数构建 ---
   * 返回 3 圈不同节奏的波纹配置：起始时间、持续时间、半径范围、厚度、扰动参数。
   */
  function buildRings(baseRadius) {
    return [
      {
        start: 0,
        duration: 360,
        from: baseRadius,
        to: baseRadius + 55,
        alpha: 0.22,
        thickness: 12,
        wobbleAmp: rand(2, 4),
        k: rand(6, 9),
        omega: rand(0.8, 1.25),
        phase: rand(0, Math.PI * 2),
      },
      {
        start: 120,
        duration: 760,
        from: baseRadius + 8,
        to: baseRadius + 85,
        alpha: 0.16,
        thickness: 14,
        wobbleAmp: rand(2.5, 4.5),
        k: rand(7, 10),
        omega: rand(0.8, 1.3),
        phase: rand(0, Math.PI * 2),
      },
      {
        start: 220,
        duration: 980,
        from: baseRadius + 15,
        to: baseRadius + 105,
        alpha: 0.1,
        thickness: 16,
        wobbleAmp: rand(2, 4),
        k: rand(6, 9),
        omega: rand(0.8, 1.2),
        phase: rand(0, Math.PI * 2),
      },
    ];
  }

  /* --- 7) 粒子参数构建 ---
   * 近景/远景两层粒子：尺寸、亮度、速度、位移、寿命不同，用来制造空间层次。
   */
  function buildParticles(baseRadius) {
    const total = 18;
    const nearCount = Math.round(total * 0.4);
    const list = [];
    for (let i = 0; i < total; i += 1) {
      const near = i < nearCount;
      const depth = near ? "near" : "far";
      const angleBase = (Math.PI * 2 * i) / total;
      const angle = angleBase + rand((-12 * Math.PI) / 180, (12 * Math.PI) / 180);
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const tangentDir = Math.random() > 0.5 ? 1 : -1;
      const tangentX = -radialY * tangentDir;
      const tangentY = radialX * tangentDir;
      const radialWeight = rand(0.8, 1.0);
      const tangentialWeight = rand(0.15, 0.35);

      const life = near ? rand(450, 700) : rand(650, 1100);
      const travel = near ? rand(18, 36) : rand(36, 70);
      const startRadius = near ? rand(baseRadius * 0.1, baseRadius * 0.2) : rand(baseRadius * 0.22, baseRadius * 0.36);

      list.push({
        depth,
        angle,
        startRadius,
        life,
        delay: rand(0, 160),
        size: near ? rand(6, 10) : rand(3, 6),
        alpha: near ? rand(0.18, 0.28) : rand(0.08, 0.16),
        travel,
        vx: radialX * radialWeight + tangentX * tangentialWeight,
        vy: radialY * radialWeight + tangentY * tangentialWeight,
      });
    }
    return list;
  }

  /* --- 8) 绘制单圈“带扰动”的水波 ---
   * 用正弦扰动让圆边缘稍微起伏，避免机械圆形。
   */
  function drawWavyRing(ctx, elapsed, ring) {
    const local = (elapsed - ring.start) / ring.duration;
    if (local < 0 || local > 1) return;
    const p = easeOutCubic(local);
    const baseRadius = ring.from + (ring.to - ring.from) * p;
    const alpha = ring.alpha * (1 - local);

    const gradient = ctx.createRadialGradient(
      fxState.centerX,
      fxState.centerY,
      Math.max(0, baseRadius - ring.thickness * 0.7),
      fxState.centerX,
      fxState.centerY,
      baseRadius + ring.thickness * 1.1
    );
    gradient.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, 0.26));
    gradient.addColorStop(0.45, rgba(fxState.rgbPrimary, 0.22));
    gradient.addColorStop(1, rgba(fxState.rgbSoft, 0));

    const steps = 72;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const theta = (Math.PI * 2 * i) / steps;
      const wobble = ring.wobbleAmp * Math.sin(ring.k * theta + ring.omega * elapsed * 0.01 + ring.phase);
      const radius = baseRadius + wobble;
      const x = fxState.centerX + Math.cos(theta) * radius;
      const y = fxState.centerY + Math.sin(theta) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = ring.thickness;
    ctx.strokeStyle = gradient;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* --- 9) 绘制粒子 ---
   * 使用 lighter 叠亮让发光点更柔和；每帧按寿命与位移重算位置和透明度。
   */
  function drawParticles(ctx, elapsed) {
    ctx.globalCompositeOperation = "lighter";
    for (const p of fxState.particles) {
      const t = (elapsed - p.delay) / p.life;
      if (t < 0 || t > 1) continue;
      const eased = easeOutCubic(t);
      const fade = Math.pow(1 - t, p.depth === "near" ? 1.4 : 1.1);
      const x = fxState.centerX + Math.cos(p.angle) * p.startRadius + p.vx * p.travel * eased;
      const y = fxState.centerY + Math.sin(p.angle) * p.startRadius + p.vy * p.travel * eased;
      const radius = p.size * (1 + (p.depth === "near" ? 0.12 : 0.06) * eased);
      const alpha = p.alpha * fade;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
      grad.addColorStop(0, `rgba(255,255,255,${clamp(alpha * 1.5, 0, 1)})`);
      grad.addColorStop(0.5, rgba(fxState.rgbPrimary, alpha));
      grad.addColorStop(1, rgba(fxState.rgbPrimary, 0));

      ctx.beginPath();
      ctx.fillStyle = grad;
      ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* --- 10) reduced-motion 降级绘制 ---
   * 只画轻量柔光，不做大量粒子与扩散运动。
   */
  function drawReduced(ctx, elapsed, total) {
    const t = clamp(elapsed / total, 0, 1);
    const alpha = 0.18 * (1 - t);
    const radius = 48 + 16 * t;
    const grad = ctx.createRadialGradient(fxState.centerX, fxState.centerY, 0, fxState.centerX, fxState.centerY, radius);
    grad.addColorStop(0, rgba(fxState.rgbPrimary, alpha));
    grad.addColorStop(1, rgba(fxState.rgbPrimary, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fxState.centerX, fxState.centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- 11) 主动画帧 ---
   * 统一调度：清屏 -> 绘制波纹/粒子 -> 判断是否结束 -> 淡出并销毁。
   */
  function frame(ts) {
    if (!fxState.ctx || !fxState.canvas) return;
    const elapsed = ts - fxState.startTs;
    const total = fxState.durationMs;
    const ctx = fxState.ctx;

    ctx.clearRect(0, 0, fxState.canvas.width, fxState.canvas.height);

    if (fxState.reduceMotion) {
      drawReduced(ctx, elapsed, total);
    } else {
      for (const ring of fxState.rings) {
        drawWavyRing(ctx, elapsed, ring);
      }
      drawParticles(ctx, elapsed);
    }

    if (elapsed < total) {
      fxState.rafId = requestAnimationFrame(frame);
    } else {
      fxState.rafId = requestAnimationFrame((fadeTs) => {
        const fadeStart = fadeTs;
        const fadeLoop = (now) => {
          if (!fxState.ctx || !fxState.canvas) return;
          const fadeP = clamp((now - fadeStart) / 160, 0, 1);
          fxState.container.style.opacity = String(1 - fadeP);
          if (fadeP < 1) {
            fxState.rafId = requestAnimationFrame(fadeLoop);
          } else {
            clearFxDom();
          }
        };
        fadeLoop(fadeStart);
      });
    }
  }

  /* --- 12) 对外 API：播放特效 ---
   * anchorEl 是特效锚点（通常是休息圆环容器），特效会围绕它的中心展开。
   */
  function playRestEndRippleFx({ anchorEl, primaryColor, primarySoftColor, durationMs = 1100 }) {
    if (!anchorEl || !anchorEl.isConnected) return;
    clearFxDom();

    fxState.durationMs = durationMs;
    fxState.primaryColor = primaryColor || "#ff6b4a";
    fxState.primarySoftColor = primarySoftColor || "rgba(255,107,74,.14)";
    fxState.rgbPrimary = parseColorToRgb(fxState.primaryColor);
    fxState.rgbSoft = parseColorToRgb(fxState.primarySoftColor);

    const host = anchorEl;
    const computed = getComputedStyle(host);
    fxState.hostEl = host;
    fxState.restoreHostPosition = host.style.position || "";
    if (computed.position === "static") {
      host.style.position = "relative";
    }

    const rect = host.getBoundingClientRect();
    const bleed = 120;
    const width = rect.width + bleed * 2;
    const height = rect.height + bleed * 2;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = `${-bleed}px`;
    container.style.top = `${-bleed}px`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.pointerEvents = "none";
    container.style.zIndex = "1";
    container.style.opacity = "1";

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.pointerEvents = "none";
    container.appendChild(canvas);

    host.insertBefore(container, host.firstChild);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fxState.container = container;
    fxState.canvas = canvas;
    fxState.ctx = ctx;
    fxState.startTs = performance.now();
    fxState.centerX = width / 2;
    fxState.centerY = height / 2;
    fxState.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const baseRadius = Math.max(56, Math.min(rect.width, rect.height) * 0.42);
    fxState.rings = buildRings(baseRadius);
    fxState.particles = fxState.reduceMotion ? [] : buildParticles(baseRadius);

    fxState.rafId = requestAnimationFrame(frame);
  }

  /* --- 13) 对外 API：提前停止特效 --- */
  function stopRestEndRippleFx() {
    clearFxDom();
  }

  window.playRestEndRippleFx = playRestEndRippleFx;
  window.stopRestEndRippleFx = stopRestEndRippleFx;
})();


/* ============================================================
 * 模块：Rest Overlay（当前主休息界面）
 * ------------------------------------------------------------
 * 职责：
 * - 点击“保存并开始休息”后打开全屏休息 Overlay
 * - 运行休息倒计时（rAF 或 reduced-motion 降级）
 * - 在休息结束时切换“完成状态”、触发结束特效、60 秒后自动退出
 * - 管理键盘无障碍：Esc 关闭、Tab 焦点圈定、关闭后焦点回触发按钮
 *
 * 依赖关系：
 * - 会调用上面的 Canvas 特效模块（window.playRestEndRippleFx）
 * - 会读取页面里的复盘输入框和感受按钮状态
 * ============================================================ */

(function () {
  /* --- 1) 模块状态：集中存储 DOM 引用、计时器、动画状态 --- */
  const state = {
    initialized: false,
    overlay: null,
    trigger: null,
    dialog: null,
    closeBtn: null,
    statusEl: null,
    timeEl: null,
    progressEl: null,
    ringWrap: null,
    doneTextEl: null,
    nextTextEl: null,
    suggestListEl: null,
    primaryBtn: null,
    secondaryBtn: null,
    lastFocused: null,
    rafId: null,
    intervalId: null,
    cleanupWaveTimer: null,
    flashTimer: null,
    autoExitTimer: null,
    ringLength: 0,
    running: false,
    finished: false,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    startTs: 0,
    durationMs: 0,
    remainingMs: 0,
    progress: 0,
    currentFeel: "ok",
    currentSuggestions: [],
    focusHandler: null,
  };

  /* --- 2) 专注时长 -> 休息时长映射（兜底规则） --- */
  const REST_MAP = { 25: 5, 50: 10, 90: 20 };

  /* --- 3) 建议池：按感受和休息时长组合内容 --- */
  const SUGGESTIONS = {
    good: {
      base: ["走两步就好", "喝两口水", "写一句下一步", "看远处 20 秒"],
      byRest: {
        5: ["轻松活动肩颈", "补水后站一会"],
        10: ["整理本轮关键点", "慢走 1 分钟"],
        20: ["离屏放松眼睛", "把下一轮拆成两步"],
      },
    },
    ok: {
      base: ["伸个懒腰", "放松肩颈", "记 3 个关键词", "离屏 30 秒"],
      byRest: {
        5: ["深呼吸三次", "活动一下手腕"],
        10: ["起身走一圈", "补水并远眺"],
        20: ["先放空一分钟", "把节奏慢下来"],
      },
    },
    tired: {
      base: ["闭眼 15 秒", "深呼吸 5 次", "起身走一圈", "补水 + 远眺"],
      byRest: {
        5: ["先离屏一下", "放松下颌和肩膀"],
        10: ["慢走并调整呼吸", "轻微拉伸背部"],
        20: ["完整休息几分钟", "先不看屏幕"],
      },
    },
  };

  /* --- 4) 工具函数：抽样、时间格式、CSS变量读取 --- */
  function pickN(list, count) {
    const pool = [...list];
    const out = [];
    while (pool.length && out.length < count) {
      const index = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(index, 1)[0]);
    }
    return out;
  }

  function formatTime(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* --- 5) 感受状态解析与同步 ---
   * 优先读 window.appState.feel，其次读当前 active 感受按钮。
   */
  function normalizeFeelFromText(text) {
    if (!text) return "ok";
    if (text.includes("精神不错")) return "good";
    if (text.includes("有点累")) return "tired";
    if (text.includes("还行")) return "ok";
    return "ok";
  }

  function detectCurrentFeel() {
    if (window.appState?.feel) return window.appState.feel;
    const active = document.querySelector(".mood.active");
    if (active?.dataset?.feel) return active.dataset.feel;
    if (active) return normalizeFeelFromText(active.textContent);
    return "ok";
  }

  function bindFeelState() {
    window.appState = window.appState || {};
    if (!window.appState.feel) window.appState.feel = detectCurrentFeel();

    document.querySelectorAll(".mood").forEach((btn) => {
      btn.addEventListener("click", () => {
        const feel = btn.dataset.feel || normalizeFeelFromText(btn.textContent);
        window.appState.feel = feel;
      });
    });
  }

  /* --- 6) 休息时长解析 ---
   * 优先复用全局函数 getRestMinutesFromSession；没有就从页面文案解析并兜底映射。
   */
  function parseSessionMinutes() {
    if (typeof window.getRestMinutesFromSession === "function") {
      try {
        const directRest = Number(window.getRestMinutesFromSession());
        if (Number.isFinite(directRest) && directRest > 0) {
          if (directRest === 5) return 25;
          if (directRest === 10) return 50;
          if (directRest === 20) return 90;
        }
      } catch (error) {
        console.warn("Failed to reuse getRestMinutesFromSession", error);
      }
    }

    const titleText = document.querySelector("h1.fadeInAfter")?.textContent || "";
    const subtitleText = document.querySelector("p.encourage")?.textContent || "";
    const match = `${titleText} ${subtitleText}`.match(/(\d+)\s*分钟/);
    const minutes = Number(match?.[1]);
    return Number.isFinite(minutes) ? minutes : 25;
  }

  function resolveRestMinutes() {
    if (typeof window.getRestMinutesFromSession === "function") {
      try {
        const restMin = Number(window.getRestMinutesFromSession());
        if (Number.isFinite(restMin) && restMin > 0) return restMin;
      } catch (error) {
        console.warn("getRestMinutesFromSession fallback", error);
      }
    }
    return REST_MAP[parseSessionMinutes()] || 5;
  }

  /* --- 7) 读取复盘文本与渲染建议列表 --- */
  function getReviewText() {
    const doneEl = document.getElementById("done");
    const nextEl = document.getElementById("next");
    const done = doneEl?.value?.trim() || "（这轮还没写复盘）";
    const next = nextEl?.value?.trim() || "（下一步还没写，等会补一句）";
    window.appState = window.appState || {};
    window.appState.lastDone = done;
    window.appState.lastNext = next;
    return { done, next };
  }

  function renderSuggestions(feel, restMin) {
    const group = SUGGESTIONS[feel] || SUGGESTIONS.ok;
    const extra = group.byRest?.[restMin] || [];
    const merged = [...group.base, ...extra];
    const picked = pickN(merged, 3);
    state.currentSuggestions = picked;
    state.suggestListEl.innerHTML = picked.map((item) => `<li>${item}</li>`).join("");
  }

  /* --- 8) 进度环控制 ---
   * SVG 圆环通过 strokeDashoffset 显示进度。
   */
  function setProgress(value) {
    const p = Math.max(0, Math.min(1, value));
    state.progress = p;
    const offset = state.ringLength * (1 - p);
    state.progressEl.style.strokeDashoffset = String(offset);
  }

  /* --- 9) 统一清理动画和定时器 ---
   * 关闭、重启、切状态前都调用，避免 timer/rAF 泄漏。
   */
  function clearMotion() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    if (state.cleanupWaveTimer) {
      clearTimeout(state.cleanupWaveTimer);
      state.cleanupWaveTimer = null;
    }
    if (state.flashTimer) {
      clearTimeout(state.flashTimer);
      state.flashTimer = null;
    }
    if (state.autoExitTimer) {
      clearTimeout(state.autoExitTimer);
      state.autoExitTimer = null;
    }
  }

  /* --- 10) 休息完成后自动退出调度（本项目设为 60 秒） --- */
  function scheduleAutoExitAfterRestDone(delayMs) {
    if (state.autoExitTimer) {
      clearTimeout(state.autoExitTimer);
    }
    state.autoExitTimer = setTimeout(() => {
      if (state.finished) closeOverlay();
    }, delayMs);
  }

  /* --- 11) 完成态 UI 与完成动效 ---
   * 完成态分两层：
   * - 页面自身的环形合拢与波纹 class 动效
   * - 可选调用 Canvas 水波粒子特效
   */
  function setFinishedUI() {
    state.finished = true;
    state.running = false;
    state.statusEl.textContent = "休息完成";
    state.primaryBtn.textContent = "开始下一轮";
    state.primaryBtn.dataset.mode = "next";
    state.secondaryBtn.textContent = "再休息 2 分钟";
    state.secondaryBtn.dataset.mode = "plus2";
    state.timeEl.textContent = "00:00";
  }

  function playFinishEffects() {
    if (state.reducedMotion) {
      setProgress(1);
      setFinishedUI();
      return;
    }

    const startProgress = state.progress;
    const mergeDuration = 200;
    const mergeStart = performance.now();

    state.progressEl.classList.add("is-flash");
    const merge = (ts) => {
      const t = Math.min(1, (ts - mergeStart) / mergeDuration);
      const eased = 1 - (1 - t) * (1 - t);
      setProgress(startProgress + (1 - startProgress) * eased);
      if (t < 1) {
        state.rafId = requestAnimationFrame(merge);
      } else {
        state.rafId = null;
        state.overlay.classList.add("is-finished-effect");
        setFinishedUI();
        state.flashTimer = setTimeout(() => {
          state.progressEl.classList.remove("is-flash");
        }, 180);
        state.cleanupWaveTimer = setTimeout(() => {
          state.overlay.classList.remove("is-finished-effect");
        }, 1800);
      }
    };

    state.rafId = requestAnimationFrame(merge);
  }

  /* --- 12) 倒计时归零：只触发一次完成流程 --- */
  function finishNaturally() {
    if (state.finished) return;
    clearMotion();
    state.remainingMs = 0;
    state.timeEl.textContent = "00:00";
    if (typeof window.playRestEndRippleFx === "function") {
      window.playRestEndRippleFx({
        anchorEl: state.ringWrap,
        primaryColor: getCSSVar("--primary"),
        primarySoftColor: getCSSVar("--primarySoft"),
        durationMs: 1600,
      });
    }
    playFinishEffects();
    scheduleAutoExitAfterRestDone(60000);
  }

  /* --- 13) 倒计时循环 ---
   * 正常模式：requestAnimationFrame（更平滑）
   * 减少动效模式：setInterval 每秒更新
   */
  function tickRAF() {
    const loop = (ts) => {
      if (!state.running) return;
      const elapsed = ts - state.startTs;
      const left = Math.max(0, state.durationMs - elapsed);
      state.remainingMs = left;
      setProgress((state.durationMs - left) / state.durationMs);
      state.timeEl.textContent = formatTime(left);
      if (left <= 0) {
        finishNaturally();
        return;
      }
      state.rafId = requestAnimationFrame(loop);
    };
    state.rafId = requestAnimationFrame(loop);
  }

  function tickReduced() {
    const start = Date.now();
    state.timeEl.textContent = formatTime(state.remainingMs);
    state.intervalId = setInterval(() => {
      if (!state.running) return;
      const elapsed = Date.now() - start;
      const left = Math.max(0, state.durationMs - elapsed);
      state.remainingMs = left;
      setProgress((state.durationMs - left) / state.durationMs);
      state.timeEl.textContent = formatTime(left);
      if (left <= 0) {
        finishNaturally();
      }
    }, 1000);
  }

  /* --- 14) 启动一次休息流程 --- */
  function startRest(minutes) {
    clearMotion();
    state.overlay.classList.remove("is-finished-effect");
    state.progressEl.classList.remove("is-flash");
    state.running = true;
    state.finished = false;
    state.durationMs = minutes * 60 * 1000;
    state.remainingMs = state.durationMs;
    state.startTs = performance.now();
    state.statusEl.textContent = "休息中";
    state.primaryBtn.textContent = "结束休息";
    state.primaryBtn.dataset.mode = "stop";
    state.secondaryBtn.textContent = "再休息 2 分钟";
    state.secondaryBtn.dataset.mode = "plus2";
    setProgress(0);
    state.timeEl.textContent = formatTime(state.durationMs);
    if (state.reducedMotion) tickReduced();
    else tickRAF();
  }

  /* --- 15) 焦点控制：Tab 限制在弹层内，Esc 快捷关闭 --- */
  function getFocusableEls() {
    return [...state.dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute("disabled"));
  }

  function trapKeydown(event) {
    if (!state.overlay.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }

    if (event.key !== "Tab") return;
    const nodes = getFocusableEls();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* --- 16) 关闭 Overlay：清理状态 + 回焦点 --- */
  function closeOverlay() {
    clearMotion();
    if (typeof window.stopRestEndRippleFx === "function") {
      window.stopRestEndRippleFx();
    }
    state.running = false;
    state.finished = false;
    state.overlay.classList.remove("is-open", "is-finished-effect");
    state.progressEl.classList.remove("is-flash");
    document.removeEventListener("keydown", state.focusHandler, true);
    if (state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }

  /* --- 17) 主次按钮行为 ---
   * 主按钮：运行中=结束休息；完成后=开始下一轮
   * 次按钮：再休息 2 分钟
   */
  function onPrimary() {
    const mode = state.primaryBtn.dataset.mode;
    if (mode === "stop") {
      closeOverlay();
      return;
    }
    if (mode === "next") {
      closeOverlay();
      const nextBtn = document.getElementById("btnNext");
      if (nextBtn) nextBtn.click();
    }
  }

  function onSecondary() {
    const mode = state.secondaryBtn.dataset.mode;
    if (mode === "plus2") {
      startRest(2);
      renderSuggestions(state.currentFeel, 2);
      return;
    }
    closeOverlay();
  }

  /* --- 18) 动态创建 Overlay DOM，并缓存关键节点引用 --- */
  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "rest-overlay";
    overlay.innerHTML = `
      <div class="rest-overlay-bg" aria-hidden="true">
        <div class="rest-aurora">
          <div class="rest-aurora-blob b1"></div>
          <div class="rest-aurora-blob b2"></div>
          <div class="rest-aurora-blob b3"></div>
          <div class="rest-aurora-blob b4"></div>
          <div class="rest-light-sweep"></div>
          <div class="rest-noise"></div>
        </div>
      </div>
      <div class="rest-overlay-stage">
        <section class="rest-panel rest-reflection">
          <h4>我刚刚推进了什么？</h4>
          <p data-role="done-text"></p>
          <h4>下一轮最重要的一步是？</h4>
          <p data-role="next-text"></p>
        </section>

        <section class="rest-center" role="dialog" aria-modal="true" aria-labelledby="restOverlayStatus">
          <button type="button" class="rest-close" aria-label="关闭休息页面">×</button>
          <div class="rest-ring-wrap">
            <span class="rest-ripple r1" aria-hidden="true"></span>
            <span class="rest-ripple r2" aria-hidden="true"></span>
            <svg class="rest-ring-svg" viewBox="0 0 320 320" aria-hidden="true">
              <circle class="rest-ring-track" cx="160" cy="160" r="146"></circle>
              <circle class="rest-ring-progress" cx="160" cy="160" r="146"></circle>
            </svg>
            <div class="rest-ring-core">
              <div class="rest-status" id="restOverlayStatus">休息中</div>
              <div class="rest-time">00:00</div>
            </div>
          </div>
          <div class="rest-actions">
            <button type="button" class="rest-btn secondary" data-mode="plus2">再休息 2 分钟</button>
            <button type="button" class="rest-btn primary" data-mode="stop">结束休息</button>
          </div>
        </section>

        <section class="rest-panel rest-suggest">
          <h4>现在适合做：</h4>
          <ul data-role="suggest-list"></ul>
        </section>
      </div>
    `;

    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.dialog = overlay.querySelector(".rest-center");
    state.closeBtn = overlay.querySelector(".rest-close");
    state.statusEl = overlay.querySelector(".rest-status");
    state.timeEl = overlay.querySelector(".rest-time");
    state.progressEl = overlay.querySelector(".rest-ring-progress");
    state.ringWrap = overlay.querySelector(".rest-ring-wrap");
    state.doneTextEl = overlay.querySelector('[data-role="done-text"]');
    state.nextTextEl = overlay.querySelector('[data-role="next-text"]');
    state.suggestListEl = overlay.querySelector('[data-role="suggest-list"]');
    state.primaryBtn = overlay.querySelector(".rest-btn.primary");
    state.secondaryBtn = overlay.querySelector(".rest-btn.secondary");

    const radius = 146;
    state.ringLength = 2 * Math.PI * radius;
    state.progressEl.style.strokeDasharray = String(state.ringLength);
    state.progressEl.style.strokeDashoffset = String(state.ringLength);

    state.closeBtn.addEventListener("click", closeOverlay);
    state.primaryBtn.addEventListener("click", onPrimary);
    state.secondaryBtn.addEventListener("click", onSecondary);
  }

  /* --- 19) 打开流程：读取上下文 -> 渲染 -> 启动倒计时 --- */
  function openOverlay(triggerEl) {
    state.lastFocused = triggerEl;
    state.currentFeel = detectCurrentFeel();
    const restMinutes = resolveRestMinutes();
    const review = getReviewText();
    renderSuggestions(state.currentFeel, restMinutes);
    state.doneTextEl.textContent = review.done;
    state.nextTextEl.textContent = review.next;
    state.overlay.classList.add("is-open");
    startRest(restMinutes);
    document.addEventListener("keydown", state.focusHandler, true);
    setTimeout(() => state.primaryBtn.focus(), 0);
  }

  /* --- 20) 对外入口：初始化并绑定触发按钮 --- */
  function initRestOverlay(options = {}) {
    if (state.initialized) return;
    bindFeelState();

    const triggerSelector = options.triggerSelector || '[data-action="start-rest"], #btnSave';
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) return;
    state.trigger = trigger;
    state.focusHandler = trapKeydown;
    buildOverlay();

    trigger.addEventListener("click", (event) => {
      openOverlay(event.currentTarget);
    });

    state.initialized = true;
  }

  window.initRestOverlay = initRestOverlay;
})();


/* ============================================================
 * 模块：Rest Modal（历史兼容方案，矩形弹窗版）
 * ------------------------------------------------------------
 * 说明：
 * - 这是旧的休息界面实现，保留用于兼容或回退。
 * - 只有显式调用 window.initRestModal() 才会启用。
 * - 与 Rest Overlay 并存，但默认不冲突。
 *
 * 功能概览：
 * - 居中 modal + 外圈 SVG 轨迹 + 点位绕行
 * - 休息倒计时、结束状态切换、再休息 2 分钟
 * - Focus Trap、Esc 关闭、关闭回焦点
 * ============================================================ */

/* --- 1) 模块常量与文案配置 --- */
const REST_STYLE_ID = "rest-modal-style";
const REST_MAP = { 25: 5, 50: 10, 90: 20 };
const QUICK_REST_MINUTES = 2;

const REST_COPY = {
  5: {
    line: "短休一下，回来更稳。",
    tips: ["喝两口水", "离开屏幕看远处 20 秒", "放松肩颈 10 秒", "闭眼深呼吸 3 次"],
  },
  10: {
    line: "先把紧绷卸下来，再继续冲刺。",
    tips: ["起身走 1 分钟", "喝水并活动肩颈", "看窗外放松眼睛", "把下一步写成一句话"],
  },
  20: {
    line: "这轮很扎实，给大脑完整恢复窗口。",
    tips: ["离开座位慢走两分钟", "补水并远眺", "做几次深呼吸", "想一件下一轮最小可行动作"],
  },
  2: {
    line: "再小歇一下，马上回到节奏。",
    tips: ["喝一口水", "站起伸展 15 秒", "闭眼深呼吸 2 次", "看远处 10 秒"],
  },
};

/* --- 2) 工具函数：随机取两条建议 + 时间格式化 --- */
function pickTwo(items) {
  if (!items || items.length === 0) return ["", ""];
  if (items.length === 1) return [items[0], items[0]];
  const copy = [...items];
  const first = copy.splice(Math.floor(Math.random() * copy.length), 1)[0];
  const second = copy[Math.floor(Math.random() * copy.length)];
  return [first, second];
}

function formatMMSS(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minute = Math.floor(totalSeconds / 60);
  const second = totalSeconds % 60;
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

/* --- 3) 样式注入 ---
 * 历史模块采用“JS 注入 style”的方式，避免额外依赖独立 CSS 文件。
 */
function injectStyles() {
  if (document.getElementById(REST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = REST_STYLE_ID;
  style.textContent = `
    .rest-modal-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.11);
      z-index: 1600;
    }
    .rest-modal-overlay.is-open { display: flex; }

    .rest-wrap {
      position: relative;
      display: inline-block;
    }

    .rest-ring {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
      opacity: .8;
      z-index: 1;
      overflow: visible;
    }
    .rest-ring-track {
      fill: none;
      stroke: rgba(28,27,25,.08);
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .rest-ring-trail {
      fill: none;
      stroke: rgba(255,107,74,.22);
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .rest-ring-dot {
      fill: rgba(255,107,74,.65);
    }
    .rest-ring-dot-glow {
      fill: rgba(255,107,74,.14);
      filter: blur(7px);
    }
    .rest-ring.is-done {
      opacity: .35;
      transition: opacity 220ms ease;
    }

    .rest-ripple {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%) scale(1);
      border-radius: var(--radius-pill);
      background: radial-gradient(circle, rgba(255,107,74,.18) 0%, rgba(255,107,74,.10) 55%, rgba(255,107,74,0) 100%);
      opacity: 0;
      z-index: 1;
      pointer-events: none;
    }
    .rest-ripple.play {
      animation: restRipple 700ms ease-out forwards;
    }
    @keyframes restRipple {
      0% {
        opacity: .18;
        transform: translate(-50%, -50%) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.3);
      }
    }

    .rest-modal {
      position: relative;
      z-index: 2;
      width: 760px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--card);
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .rest-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .rest-title {
      margin: 0;
      color: var(--fg);
      font-size: 26px;
      line-height: 1.2;
      font-weight: 700;
    }
    .rest-close {
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }
    .rest-close:hover,
    .rest-close:focus-visible {
      background: var(--primarySoft);
      color: var(--primary);
      outline: none;
    }
    .rest-line {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.5;
    }
    .rest-tips {
      margin: 0 0 10px;
      padding: 0;
      list-style: none;
    }
    .rest-tips li {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
      margin: 4px 0;
      padding-left: 12px;
      position: relative;
    }
    .rest-tips li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 10px;
      width: 5px;
      height: 5px;
      border-radius: var(--radius-pill);
      background: var(--primary);
    }
    .rest-time {
      margin: 10px 0 12px;
      font-size: 34px;
      font-weight: 700;
      color: var(--fg);
      letter-spacing: .5px;
    }
    .rest-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .rest-btn {
      height: 42px;
      border: 0;
      border-radius: var(--radius-md);
      padding: 0 16px;
      cursor: pointer;
      font-size: 15px;
    }
    .rest-btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .rest-btn-secondary {
      background: rgba(28,27,25,.1);
      color: var(--fg);
    }
    .rest-btn-primary:hover,
    .rest-btn-primary:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--focus);
    }
    .rest-btn-secondary:hover,
    .rest-btn-secondary:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(28,27,25,.12);
    }

    @media (prefers-reduced-motion: reduce) {
      .rest-ripple.play { animation: none; opacity: 0; }
      .rest-ring-dot,
      .rest-ring-dot-glow { opacity: .35; }
    }
  `;
  document.head.appendChild(style);
}

/* --- 4) 业务工具：读取专注分钟并映射休息分钟 --- */
function getSessionMinutes() {
  const title = document.querySelector("h1.fadeInAfter")?.textContent || "";
  const line = document.querySelector("p.encourage")?.textContent || "";
  const match = `${title} ${line}`.match(/(\d+)\s*分钟/);
  const value = Number(match?.[1]);
  return Number.isFinite(value) ? value : 25;
}

function getRestMinutesFromSession() {
  return REST_MAP[getSessionMinutes()] || 5;
}

/* --- 5) 无障碍工具：获取可聚焦元素 --- */
function getFocusable(container) {
  return [...container.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((item) => !item.hasAttribute("disabled"));
}

/* --- 6) SVG 路径工具：生成圆角矩形轨道 --- */
function roundedRectPath(w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    `M ${radius} 0`,
    `H ${w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w} ${radius}`,
    `V ${h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w - radius} ${h}`,
    `H ${radius}`,
    `A ${radius} ${radius} 0 0 1 0 ${h - radius}`,
    `V ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
    "Z",
  ].join(" ");
}

/* --- 7) 构建 Modal DOM --- */
function createDOM() {
  const overlay = document.createElement("div");
  overlay.className = "rest-modal-overlay";
  overlay.innerHTML = `
    <div class="rest-wrap">
      <svg class="rest-ring" aria-hidden="true">
        <path class="rest-ring-track"></path>
        <path class="rest-ring-trail"></path>
        <circle class="rest-ring-dot-glow" r="8"></circle>
        <circle class="rest-ring-dot" r="4"></circle>
      </svg>
      <div class="rest-ripple" aria-hidden="true"></div>
      <section class="rest-modal" role="dialog" aria-modal="true" aria-labelledby="restModalTitle">
        <div class="rest-head">
          <h3 class="rest-title" id="restModalTitle"></h3>
          <button type="button" class="rest-close" aria-label="关闭休息窗口">×</button>
        </div>
        <p class="rest-line"></p>
        <ul class="rest-tips"></ul>
        <div class="rest-time" aria-live="polite"></div>
        <div class="rest-actions">
          <button type="button" class="rest-btn rest-btn-secondary" data-role="secondary"></button>
          <button type="button" class="rest-btn rest-btn-primary" data-role="primary"></button>
        </div>
      </section>
    </div>
  `;
  document.body.appendChild(overlay);
  return {
    overlay,
    wrap: overlay.querySelector(".rest-wrap"),
    ring: overlay.querySelector(".rest-ring"),
    track: overlay.querySelector(".rest-ring-track"),
    trail: overlay.querySelector(".rest-ring-trail"),
    dot: overlay.querySelector(".rest-ring-dot"),
    dotGlow: overlay.querySelector(".rest-ring-dot-glow"),
    ripple: overlay.querySelector(".rest-ripple"),
    dialog: overlay.querySelector(".rest-modal"),
    title: overlay.querySelector(".rest-title"),
    line: overlay.querySelector(".rest-line"),
    tips: overlay.querySelector(".rest-tips"),
    time: overlay.querySelector(".rest-time"),
    close: overlay.querySelector(".rest-close"),
    btnPrimary: overlay.querySelector('[data-role="primary"]'),
    btnSecondary: overlay.querySelector('[data-role="secondary"]'),
  };
}

/* --- 8) 对外入口：初始化 rest modal ---
 * 这里包含完整生命周期：打开、倒计时、完成、关闭、清理。
 */
function initRestModal(options = {}) {
  injectStyles();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const triggerSelector = options.triggerSelector || '[data-action="start-rest"], #btnSave';
  const trigger = document.querySelector(triggerSelector);
  if (!trigger) return;

  const dom = createDOM();
  let lastFocused = null;
  let running = false;
  let finished = false;
  let restMinutes = getRestMinutesFromSession();
  let durationMs = restMinutes * 60 * 1000;
  let startTime = 0;
  let rafId = null;
  let intervalId = null;
  let totalLength = 0;
  let startOffset = 0;
  let ringPadding = 30;

  /* --- 核心生命周期工具：停止循环 / 复位视觉 / 写入建议 --- */
  const stopLoop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const resetVisual = () => {
    dom.ring.classList.remove("is-done");
    dom.ripple.classList.remove("play");
    dom.time.textContent = `${restMinutes}:00`;
  };

  const writeTips = (minutes) => {
    const pack = REST_COPY[minutes] || REST_COPY[5];
    const [a, b] = pickTwo(pack.tips);
    dom.line.textContent = pack.line;
    dom.tips.innerHTML = `<li>${a}</li><li>${b}</li>`;
  };

  /* --- 状态切换：准备态、完成态 --- */
  const setStateReady = () => {
    running = false;
    finished = false;
    restMinutes = getRestMinutesFromSession();
    durationMs = restMinutes * 60 * 1000;
    dom.title.textContent = `休息 ${restMinutes} 分钟`;
    writeTips(restMinutes);
    dom.time.textContent = `${String(restMinutes).padStart(2, "0")}:00`;
    dom.btnPrimary.textContent = "开始休息";
    dom.btnSecondary.textContent = "直接开始下一轮";
    resetVisual();
  };

  const setStateFinished = () => {
    running = false;
    finished = true;
    dom.title.textContent = "休息完成";
    dom.line.textContent = "休息完成，回来继续吧。";
    dom.tips.innerHTML = "<li>状态回来了就开下一轮</li><li>先做最小一步，快速进入专注</li>";
    dom.time.textContent = "00:00";
    dom.btnPrimary.textContent = "开始下一轮";
    dom.btnSecondary.textContent = "再休息 2 分钟";
    dom.ring.classList.add("is-done");
  };

  /* --- 几何计算：根据弹窗尺寸动态计算外圈路径与起点 --- */
  const updateRingGeometry = () => {
    const rect = dom.dialog.getBoundingClientRect();
    const width = rect.width + ringPadding * 2;
    const height = rect.height + ringPadding * 2;
    dom.ring.setAttribute("width", String(width));
    dom.ring.setAttribute("height", String(height));
    dom.ring.setAttribute("viewBox", `0 0 ${width} ${height}`);
    dom.ring.style.left = `${-ringPadding}px`;
    dom.ring.style.top = `${-ringPadding}px`;

    const radius = 26;
    const pathData = roundedRectPath(width, height, radius);
    dom.track.setAttribute("d", pathData);
    dom.trail.setAttribute("d", pathData);

    totalLength = dom.track.getTotalLength();
    const topX = width / 2;
    const topY = 0;
    let nearestDist = Infinity;
    let nearestOffset = 0;
    const samples = 240;
    for (let i = 0; i <= samples; i += 1) {
      const offset = (totalLength * i) / samples;
      const point = dom.track.getPointAtLength(offset);
      const dist = (point.x - topX) ** 2 + (point.y - topY) ** 2;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestOffset = offset;
      }
    }
    startOffset = nearestOffset;

    dom.track.style.strokeDasharray = `${totalLength}`;
    dom.trail.style.strokeDasharray = `0 ${totalLength}`;
    dom.trail.style.strokeDashoffset = `${-startOffset}`;
    const startPoint = dom.track.getPointAtLength(startOffset);
    dom.dot.setAttribute("cx", String(startPoint.x));
    dom.dot.setAttribute("cy", String(startPoint.y));
    dom.dotGlow.setAttribute("cx", String(startPoint.x));
    dom.dotGlow.setAttribute("cy", String(startPoint.y));

    dom.ripple.style.width = `${width + 24}px`;
    dom.ripple.style.height = `${height + 24}px`;
  };

  /* --- 进度渲染：根据 progress 推进轨迹和小点位置 --- */
  const updateRingProgress = (progress) => {
    const p = Math.min(1, Math.max(0, progress));
    const traveled = totalLength * p;
    dom.trail.style.strokeDasharray = `${Math.max(1, traveled)} ${totalLength}`;
    dom.trail.style.strokeDashoffset = `${-startOffset}`;
    const point = dom.track.getPointAtLength((startOffset + traveled) % totalLength);
    dom.dot.setAttribute("cx", String(point.x));
    dom.dot.setAttribute("cy", String(point.y));
    dom.dotGlow.setAttribute("cx", String(point.x));
    dom.dotGlow.setAttribute("cy", String(point.y));
  };

  const playFinishRipple = () => {
    if (reducedMotion) return;
    dom.ripple.classList.remove("play");
    void dom.ripple.offsetWidth;
    dom.ripple.classList.add("play");
  };

  /* --- 完成流程：结束波纹 + UI 切换 --- */
  const finishNaturally = () => {
    stopLoop();
    updateRingProgress(1);
    playFinishRipple();
    setStateFinished();
  };

  /* --- 倒计时驱动：正常模式 / reduced-motion 模式 --- */
  const runTimerWithRAF = () => {
    const tick = (now) => {
      if (!running) return;
      const elapsed = now - startTime;
      const left = Math.max(0, durationMs - elapsed);
      const progress = elapsed / durationMs;
      dom.time.textContent = formatMMSS(left);
      updateRingProgress(progress);
      if (left <= 0) {
        finishNaturally();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };

  const runTimerReduced = () => {
    const end = Date.now() + durationMs;
    updateRingProgress(0);
    intervalId = setInterval(() => {
      if (!running) return;
      const left = Math.max(0, end - Date.now());
      dom.time.textContent = formatMMSS(left);
      if (left <= 0) {
        finishNaturally();
      }
    }, 1000);
  };

  /* --- 启动休息、关闭弹窗、键盘焦点限制 --- */
  const startRest = (minutes = restMinutes) => {
    running = true;
    finished = false;
    restMinutes = minutes;
    durationMs = restMinutes * 60 * 1000;
    dom.title.textContent = `休息 ${restMinutes} 分钟`;
    writeTips(restMinutes);
    dom.btnPrimary.textContent = "结束休息";
    dom.btnSecondary.textContent = "直接开始下一轮";
    dom.time.textContent = formatMMSS(durationMs);
    updateRingGeometry();
    updateRingProgress(0);
    startTime = performance.now();
    stopLoop();
    if (reducedMotion) runTimerReduced();
    else runTimerWithRAF();
  };

  const closeModal = () => {
    stopLoop();
    running = false;
    finished = false;
    dom.overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKeydown);
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  };

  const onKeydown = (event) => {
    if (!dom.overlay.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === "Tab") {
      const focusables = getFocusable(dom.dialog);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const openModal = (sourceButton) => {
    lastFocused = sourceButton || trigger;
    setStateReady();
    dom.overlay.classList.add("is-open");
    updateRingGeometry();
    document.addEventListener("keydown", onKeydown);
    setTimeout(() => dom.btnPrimary.focus(), 0);
  };

  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeModal();
  });
  dom.close.addEventListener("click", closeModal);

  dom.btnPrimary.addEventListener("click", () => {
    if (finished) {
      closeModal();
      return;
    }
    if (running) {
      closeModal();
      return;
    }
    startRest(restMinutes);
  });

  dom.btnSecondary.addEventListener("click", () => {
    if (finished) {
      startRest(QUICK_REST_MINUTES);
      return;
    }
    closeModal();
  });

  trigger.addEventListener("click", (event) => {
    openModal(event.currentTarget);
  });

  const ro = new ResizeObserver(() => {
    if (dom.overlay.classList.contains("is-open")) {
      updateRingGeometry();
    }
  });
  ro.observe(dom.dialog);
}

window.initRestModal = initRestModal;


/* ============================================================
 * 模块：Rest Circle（历史兼容方案，圆形弹窗版）
 * ------------------------------------------------------------
 * 说明：
 * - 这是另一套旧实现：圆形休息面板 + 环形进度 + Aurora 背景。
 * - 仅在调用 window.initRestCircle() 时启用。
 * - 当前主流程使用 Rest Overlay，本模块主要用于保留备选方案。
 *
 * 功能概览：
 * - 休息倒计时（rAF / reduced-motion 降级）
 * - 完成态“合拢+波纹”动效
 * - 主次按钮状态机（结束休息 / 开始下一轮 / 再休息2分钟）
 * - 键盘可访问性（Esc、Tab 焦点圈定、回焦点）
 * ============================================================ */

(function () {
  /* --- 1) 模块常量与运行状态 --- */
  const REST_FALLBACK_MAP = { 25: 5, 50: 10, 90: 20 };
  const SHORT_REST_MINUTES = 2;

  const state = {
    initialized: false,
    overlay: null,
    dialog: null,
    trigger: null,
    closeBtn: null,
    title: null,
    subtitle: null,
    timeEl: null,
    primaryBtn: null,
    secondaryBtn: null,
    progressEl: null,
    rippleWrap: null,
    rafId: null,
    timerId: null,
    focusHandler: null,
    lastFocused: null,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    durationMs: 0,
    startedAt: 0,
    remainingMs: 0,
    progress: 0,
    running: false,
    finished: false,
    ringLength: 0,
    flashTimeout: null,
    rippleTimeout: null,
  };

  /* --- 2) 文案配置（运行态提示 / 完成提示） --- */
  const COPY = {
    running: [
      "把呼吸放慢一点，眼睛也休息一下。",
      "短暂停一下，回来会更稳。",
      "你已经做得很好，先恢复一下节奏。",
    ],
    finished: "休息完成，回来继续吧。",
  };

  /* --- 3) 基础工具：随机文案、分钟解析、时间格式化 --- */
  function pickOne(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function parseSessionMinutesFromPage() {
    const titleText = document.querySelector("h1.fadeInAfter")?.textContent || "";
    const subtitleText = document.querySelector("p.encourage")?.textContent || "";
    const match = `${titleText} ${subtitleText}`.match(/(\d+)\s*分钟/);
    const minutes = Number(match?.[1]);
    return Number.isFinite(minutes) ? minutes : 25;
  }

  function resolveRestMinutes() {
    if (typeof window.getRestMinutesFromSession === "function") {
      try {
        const value = Number(window.getRestMinutesFromSession());
        if (Number.isFinite(value) && value > 0) return value;
      } catch (error) {
        console.warn("getRestMinutesFromSession failed, fallback mapping will be used.", error);
      }
    }
    const sessionMinutes = parseSessionMinutesFromPage();
    return REST_FALLBACK_MAP[sessionMinutes] || 5;
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  /* --- 4) 焦点与进度工具 --- */
  function getFocusableElements() {
    return [...state.dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute("disabled"));
  }

  function applyProgress(progressValue) {
    const clamped = Math.max(0, Math.min(1, progressValue));
    state.progress = clamped;
    const dashOffset = state.ringLength * (1 - clamped);
    state.progressEl.style.strokeDashoffset = `${dashOffset}`;
  }

  /* --- 5) 清理与状态切换 ---
   * clearTimers：防止 rAF / timer 泄漏
   * updateRunningUI / updateFinishedUI：切换按钮文案和说明
   */
  function clearTimers() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    if (state.flashTimeout) {
      clearTimeout(state.flashTimeout);
      state.flashTimeout = null;
    }
    if (state.rippleTimeout) {
      clearTimeout(state.rippleTimeout);
      state.rippleTimeout = null;
    }
  }

  function updateRunningUI() {
    state.title.textContent = "休息中";
    state.subtitle.textContent = pickOne(COPY.running);
    state.primaryBtn.textContent = "结束休息";
    state.primaryBtn.dataset.mode = "stop";
    state.secondaryBtn.classList.add("is-hidden");
    state.secondaryBtn.textContent = "再休息 2 分钟";
    state.secondaryBtn.dataset.mode = "plus2";
  }

  function updateFinishedUI() {
    state.title.textContent = "休息完成";
    state.subtitle.textContent = COPY.finished;
    state.primaryBtn.textContent = "开始下一轮";
    state.primaryBtn.dataset.mode = "next";
    state.secondaryBtn.classList.remove("is-hidden");
    state.secondaryBtn.textContent = "再休息 2 分钟";
    state.secondaryBtn.dataset.mode = "plus2";
  }

  /* --- 6) 完成动效：进度合拢 + 波纹 class 动画 --- */
  function runFinishVisual() {
    if (state.reducedMotion) {
      applyProgress(1);
      updateFinishedUI();
      state.finished = true;
      state.running = false;
      return;
    }

    const startProgress = state.progress;
    const mergeDuration = 200;
    const started = performance.now();

    state.progressEl.classList.add("flash");

    const merge = (now) => {
      const t = Math.min(1, (now - started) / mergeDuration);
      const eased = 1 - (1 - t) * (1 - t);
      applyProgress(startProgress + (1 - startProgress) * eased);
      if (t < 1) {
        state.rafId = requestAnimationFrame(merge);
      } else {
        state.rafId = null;
        state.overlay.classList.add("finish-effect");
        state.flashTimeout = setTimeout(() => {
          state.progressEl.classList.remove("flash");
        }, 160);
        state.rippleTimeout = setTimeout(() => {
          state.overlay.classList.remove("finish-effect");
        }, 1050);
        updateFinishedUI();
        state.finished = true;
        state.running = false;
      }
    };

    state.rafId = requestAnimationFrame(merge);
  }

  /* --- 7) 倒计时与启动流程 --- */
  function finishNaturally() {
    clearTimers();
    state.remainingMs = 0;
    state.timeEl.textContent = "00:00";
    runFinishVisual();
  }

  function tickReduced(startRemaining, totalDuration) {
    const startedAt = Date.now();
    state.timeEl.textContent = formatTime(startRemaining);
    state.timerId = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, startRemaining - elapsed);
      state.remainingMs = left;
      state.timeEl.textContent = formatTime(left);
      applyProgress((totalDuration - left) / totalDuration);
      if (left <= 0) {
        finishNaturally();
      }
    }, 1000);
  }

  function tickRAF(totalDuration) {
    const loop = (now) => {
      if (!state.running) return;
      const elapsed = now - state.startedAt;
      const left = Math.max(0, totalDuration - elapsed);
      state.remainingMs = left;
      state.timeEl.textContent = formatTime(left);
      applyProgress((totalDuration - left) / totalDuration);
      if (left <= 0) {
        finishNaturally();
        return;
      }
      state.rafId = requestAnimationFrame(loop);
    };
    state.rafId = requestAnimationFrame(loop);
  }

  function startRest(minutes) {
    clearTimers();
    state.overlay.classList.remove("finish-effect");
    state.progressEl.classList.remove("flash");

    state.durationMs = minutes * 60 * 1000;
    state.remainingMs = state.durationMs;
    state.startedAt = performance.now();
    state.running = true;
    state.finished = false;

    updateRunningUI();
    applyProgress(0);
    state.timeEl.textContent = formatTime(state.remainingMs);

    if (state.reducedMotion) {
      tickReduced(state.remainingMs, state.durationMs);
    } else {
      tickRAF(state.durationMs);
    }
  }

  /* --- 8) 弹窗打开/关闭与焦点圈定 --- */
  function restoreFocus() {
    if (state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }

  function closeModal() {
    clearTimers();
    state.overlay.classList.remove("is-open", "finish-effect");
    state.running = false;
    state.finished = false;
    state.progressEl.classList.remove("flash");
    document.removeEventListener("keydown", state.focusHandler, true);
    restoreFocus();
  }

  /* --- 9) 主次按钮行为 --- */
  function onPrimaryAction() {
    const mode = state.primaryBtn.dataset.mode;
    if (mode === "stop") {
      closeModal();
      return;
    }
    if (mode === "next") {
      closeModal();
      const nextBtn = document.getElementById("btnNext");
      if (nextBtn) nextBtn.click();
    }
  }

  function onSecondaryAction() {
    const mode = state.secondaryBtn.dataset.mode;
    if (mode === "plus2") {
      startRest(SHORT_REST_MINUTES);
      state.secondaryBtn.classList.add("is-hidden");
      return;
    }
    closeModal();
  }

  function trapFocus(event) {
    if (!state.overlay.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = getFocusableElements();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openModal(triggerEl) {
    state.lastFocused = triggerEl;
    state.overlay.classList.add("is-open");
    state.title.textContent = `休息 ${resolveRestMinutes()} 分钟`;
    state.subtitle.textContent = "先放松一下，马上回来继续。";
    state.primaryBtn.textContent = "结束休息";
    state.primaryBtn.dataset.mode = "stop";
    state.secondaryBtn.classList.add("is-hidden");
    state.secondaryBtn.dataset.mode = "plus2";
    state.overlay.classList.remove("finish-effect");
    state.progressEl.classList.remove("flash");
    applyProgress(0);
    startRest(resolveRestMinutes());
    document.addEventListener("keydown", state.focusHandler, true);
    setTimeout(() => state.primaryBtn.focus(), 0);
  }

  /* --- 10) 构建 Overlay DOM 并绑定事件 --- */
  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "rest-circle-overlay";
    overlay.innerHTML = `
      <div class="rest-aurora" aria-hidden="true">
        <div class="rest-aurora-blob b1"></div>
        <div class="rest-aurora-blob b2"></div>
        <div class="rest-aurora-blob b3"></div>
      </div>
      <section class="rest-circle-modal" role="dialog" aria-modal="true" aria-labelledby="restCircleTitle">
        <button type="button" class="rest-circle-close" aria-label="关闭休息界面">×</button>
        <div class="rest-circle-panel-wrap">
          <span class="rest-finish-ripple r1" aria-hidden="true"></span>
          <span class="rest-finish-ripple r2" aria-hidden="true"></span>
          <div class="rest-circle-panel">
            <svg class="rest-ring-svg" viewBox="0 0 224 224" aria-hidden="true">
              <circle class="rest-ring-track" cx="112" cy="112" r="102"></circle>
              <circle class="rest-ring-progress" cx="112" cy="112" r="102"></circle>
            </svg>
            <div class="rest-time" aria-live="polite">00:00</div>
          </div>
        </div>
        <h3 class="rest-circle-title" id="restCircleTitle">休息中</h3>
        <p class="rest-circle-subtitle">先放松一下，马上回来继续。</p>
        <div class="rest-circle-actions">
          <button type="button" class="rest-circle-btn secondary is-hidden" data-mode="plus2">再休息 2 分钟</button>
          <button type="button" class="rest-circle-btn primary" data-mode="stop">结束休息</button>
        </div>
      </section>
    `;

    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.dialog = overlay.querySelector(".rest-circle-modal");
    state.closeBtn = overlay.querySelector(".rest-circle-close");
    state.title = overlay.querySelector(".rest-circle-title");
    state.subtitle = overlay.querySelector(".rest-circle-subtitle");
    state.timeEl = overlay.querySelector(".rest-time");
    state.primaryBtn = overlay.querySelector(".rest-circle-btn.primary");
    state.secondaryBtn = overlay.querySelector(".rest-circle-btn.secondary");
    state.progressEl = overlay.querySelector(".rest-ring-progress");
    state.rippleWrap = overlay.querySelector(".rest-circle-panel-wrap");

    const radius = 102;
    state.ringLength = 2 * Math.PI * radius;
    state.progressEl.style.strokeDasharray = `${state.ringLength}`;
    state.progressEl.style.strokeDashoffset = `${state.ringLength}`;

    state.overlay.addEventListener("click", (event) => {
      if (event.target === state.overlay) closeModal();
    });
    state.closeBtn.addEventListener("click", closeModal);
    state.primaryBtn.addEventListener("click", onPrimaryAction);
    state.secondaryBtn.addEventListener("click", onSecondaryAction);
  }

  /* --- 11) 对外入口：初始化并绑定触发按钮 --- */
  function initRestCircle(options = {}) {
    if (state.initialized) return;
    const triggerSelector = options.triggerSelector || '[data-action="start-rest"], #btnSave';
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) return;

    state.trigger = trigger;
    state.focusHandler = trapFocus;
    createOverlay();

    trigger.addEventListener("click", (event) => {
      openModal(event.currentTarget);
    });

    state.initialized = true;
  }

  window.initRestCircle = initRestCircle;
})();


