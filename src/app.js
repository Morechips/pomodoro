/* ============================================================
 * app.js (merged runtime)
 * ------------------------------------------------------------
 * This file merges:
 * 1) feel-toast.js (status toast + open sound)
 * 2) rest-overlay.js (rest overlay flow)
 *
 * Split source files are preserved for quick rollback under:
 * src/backup_split_20260217_184535/
 * ============================================================ */
/* ============================================================
 * 模块：Feel Toast（现在状态按钮 -> 右上角提示）
 * ------------------------------------------------------------
 * 技术实现：
 * 1) 事件委托监听 `.mood` 点击，避免按钮重渲染后监听丢失
 * 2) 动态创建单例 Toast，并复用同一节点（不堆叠）
 * 3) setTimeout 自动关闭 + hover/focus 暂停计时
 * 4) 根据当前分钟数和感受类型随机文案
 * ============================================================ */
(function () {
  const STYLE_ID = "feel-toast-style";
  const SUPPORTED_MINUTES = [25, 50, 90];
  const FEEL_MAP = {
    精神不错: "good",
    还行: "ok",
    有点累: "tired",
  };

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
        25: ["站起来走 30 秒", "喝两口水", "把下一步写成一句话", "看远处 20 秒"],
        50: ["起身活动 1 分钟", "放松肩颈 15 秒", "把任务拆成接下来两步", "闭眼 10 秒再继续"],
        90: ["先休息 3 分钟", "补水并离屏 1 分钟", "先做最低阻力的一小步", "把下一轮目标缩成一句话"],
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
        25: ["伸个懒腰", "放松肩颈 10 秒", "写 3 个关键词总结", "看窗外 20 秒"],
        50: ["活动肩颈 20 秒", "深呼吸 3 次", "只保留一个最小下一步", "离屏 30 秒"],
        90: ["先慢走 1 分钟", "补水 + 放松眼睛", "把下一轮目标减半", "先做 2 分钟热身任务"],
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
        25: ["离开椅子走两步", "深呼吸 5 次", "闭眼 15 秒", "补水 + 放松眼睛"],
        50: ["起身走 1 分钟", "肩颈放松 20 秒", "先停 1 分钟再回来", "只做最小可行动作"],
        90: ["休息 3-5 分钟", "补水并离屏", "降低下一轮难度", "先做 1 个最简单动作"],
        default: ["离开椅子走两步", "深呼吸几次", "短暂闭眼", "补水放松"],
      },
    },
  };

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

  function withMinutes(text, minutes) {
    return text.replaceAll("{m}", String(minutes));
  }

  function getCurrentMinutes() {
    const titleText = document.querySelector("h1.fadeInAfter")?.textContent || "";
    const subText = document.querySelector("p.encourage")?.textContent || "";
    const match = `${titleText} ${subText}`.match(/(\d+)\s*分钟/);
    const minutes = Number(match?.[1]);
    if (SUPPORTED_MINUTES.includes(minutes)) return minutes;
    return 25;
  }

  function getTipsFor(feelData, minutes) {
    const bucket = feelData.tipsByTime?.[String(minutes)] || feelData.tipsByTime?.default || [];
    return bucket.map((tip) => withMinutes(tip, minutes));
  }

  function normalizeFeel(node) {
    const explicit = node.dataset.feel;
    if (explicit && FEEL_COPY[explicit]) return explicit;
    const text = node.textContent.trim().replace(/^[^\u4e00-\u9fa5]*/, "");
    return FEEL_MAP[text] || null;
  }

  function injectFeelToastStyles() {
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
      .feel-toast.is-visible { opacity: 1; transform: translateX(0); }
      .feel-toast.is-leaving { opacity: 0; transform: translateY(-4px); }
      .feel-toast-icon {
        width: 28px; height: 28px; border-radius: var(--radius-pill);
        background: var(--primarySoft); color: var(--primary);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 700; margin-top: 1px; line-height: 1;
      }
      .feel-toast-body { min-width: 0; }
      .feel-toast-title { font-size: 14px; font-weight: 700; line-height: 1.3; margin: 0; color: var(--fg); }
      .feel-toast-subtitle { margin: 4px 0 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
      .feel-toast-close {
        width: 24px; height: 24px; border: 0; border-radius: 8px; background: transparent;
        color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .feel-toast-close:hover, .feel-toast-close:focus-visible {
        background: var(--primarySoft); color: var(--primary); outline: none;
      }
      .feel-toast-expand { margin-top: 10px; opacity: 1; transition: opacity 120ms ease; }
      .feel-toast-tip-label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
      .feel-toast-tips { margin: 0; padding: 0; list-style: none; }
      .feel-toast-tips li {
        color: var(--muted); font-size: 13px; line-height: 1.45; margin: 2px 0;
        position: relative; padding-left: 12px;
      }
      .feel-toast-tips li::before {
        content: ""; width: 5px; height: 5px; border-radius: var(--radius-pill);
        background: var(--primary); position: absolute; left: 0; top: 8px;
      }
      .feel-toast-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
      .feel-toast-ack {
        border: 0; border-radius: var(--radius-md); background: var(--primarySoft); color: var(--primary);
        font-size: 12px; padding: 7px 12px; cursor: pointer;
      }
      .feel-toast-ack:hover, .feel-toast-ack:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
      @media (prefers-reduced-motion: reduce) {
        .feel-toast { transition: opacity 120ms ease; transform: none; }
        .feel-toast.is-visible, .feel-toast.is-leaving { transform: none; }
      }
    `;
    document.head.appendChild(style);
  }

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
        <div class="feel-toast-expand">
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

  function initFeelToast(options = {}) {
    if (window.__feelToastInitialized) return;
    window.__feelToastInitialized = true;

    const selector = options.selector || ".mood";
    const minDuration = options.minDurationMs || 3200;
    const maxDuration = options.maxDurationMs || 4800;

    injectFeelToastStyles();

    let timerId = null;
    let closeAt = 0;
    let remaining = 0;
    let refs = null;
    let activeFeel = null;

    const clearTimer = () => {
      if (!timerId) return;
      clearTimeout(timerId);
      timerId = null;
    };

    const randomDuration = () => Math.floor(minDuration + Math.random() * (maxDuration - minDuration + 1));

    const removeToast = () => {
      clearTimer();
      if (refs?.el?.isConnected) refs.el.remove();
      refs = null;
      remaining = 0;
      closeAt = 0;
      activeFeel = null;
    };

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

    const startTimer = (ms) => {
      clearTimer();
      remaining = ms;
      closeAt = Date.now() + remaining;
      timerId = setTimeout(closeToast, remaining);
    };

    const pauseTimer = () => {
      if (!timerId) return;
      remaining = Math.max(0, closeAt - Date.now());
      clearTimer();
    };

    const resumeTimer = () => {
      if (!refs || timerId || remaining <= 0) return;
      startTimer(remaining);
    };

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

    document.addEventListener("click", (event) => {
      const button = event.target.closest(selector);
      if (!button) return;
      const feelType = normalizeFeel(button);
      if (!feelType) return;
      renderToast(feelType);
    });
  }

  window.initFeelToast = initFeelToast;
})();

/* ============================================================
 * 模块：Open Sound（页面打开提示音）
 * ------------------------------------------------------------
 * 技术实现：
 * - WebAudio 实时合成木琴音色（无需外部音频文件）
 * - 自动播放尝试失败时，退化为“首次交互时补播一次”
 * - 通过 meta: pomodoro-open-sound=on/off 控制开关
 * ============================================================ */
(function () {
  const META_NAME = "pomodoro-open-sound";
  const FALLBACK_ENABLED = true;
  const AUTO_CLOSE_DELAY_MS = 2200;

  const state = {
    initialized: false,
    played: false,
    pendingGestureUnlock: false,
    audioCtx: null,
    gestureHandler: null,
  };

  function getSoundEnabled() {
    const meta = document.querySelector(`meta[name="${META_NAME}"]`);
    const raw = (meta?.content || "").trim().toLowerCase();
    if (!raw) return FALLBACK_ENABLED;
    return !["off", "0", "false", "no"].includes(raw);
  }

  function closeAudioContextLater() {
    if (!state.audioCtx) return;
    const ctx = state.audioCtx;
    setTimeout(() => {
      if (state.audioCtx !== ctx) return;
      ctx.close().catch(() => {});
      state.audioCtx = null;
    }, AUTO_CLOSE_DELAY_MS);
  }

  function ensureAudioContext() {
    if (state.audioCtx) return state.audioCtx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    state.audioCtx = new AudioCtx();
    return state.audioCtx;
  }

  function strikeMarimba(ctx, startAt, baseFreq, peakGain) {
    const output = ctx.createGain();
    output.gain.setValueAtTime(0.0001, startAt);
    output.gain.linearRampToValueAtTime(peakGain, startAt + 0.012);
    output.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.05);

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = "sine";
    bodyOsc.frequency.setValueAtTime(baseFreq, startAt);
    bodyOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.985, startAt + 0.22);

    const hitOsc = ctx.createOscillator();
    hitOsc.type = "triangle";
    hitOsc.frequency.setValueAtTime(baseFreq * 2.04, startAt);

    const hitGain = ctx.createGain();
    hitGain.gain.setValueAtTime(peakGain * 0.52, startAt);
    hitGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.23);

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.setValueAtTime(2200, startAt);
    toneFilter.Q.setValueAtTime(0.9, startAt);

    bodyOsc.connect(output);
    hitOsc.connect(hitGain);
    hitGain.connect(output);
    output.connect(toneFilter);
    toneFilter.connect(ctx.destination);

    bodyOsc.start(startAt);
    hitOsc.start(startAt);
    bodyOsc.stop(startAt + 1.2);
    hitOsc.stop(startAt + 0.3);
  }

  function playMarimbaPhrase(ctx) {
    const t0 = ctx.currentTime + 0.03;
    strikeMarimba(ctx, t0, 392.0, 0.115);
    strikeMarimba(ctx, t0 + 0.18, 523.25, 0.095);
    closeAudioContextLater();
  }

  function removeGestureUnlock() {
    if (!state.gestureHandler) return;
    document.removeEventListener("pointerdown", state.gestureHandler, true);
    document.removeEventListener("keydown", state.gestureHandler, true);
    state.gestureHandler = null;
    state.pendingGestureUnlock = false;
  }

  function attachGestureUnlock() {
    if (state.pendingGestureUnlock || state.played) return;
    state.pendingGestureUnlock = true;
    state.gestureHandler = async () => {
      removeGestureUnlock();
      await tryPlayOpenSound(true);
    };
    document.addEventListener("pointerdown", state.gestureHandler, true);
    document.addEventListener("keydown", state.gestureHandler, true);
  }

  async function tryPlayOpenSound(fromGesture = false) {
    if (state.played) return;
    if (!getSoundEnabled()) {
      removeGestureUnlock();
      return;
    }

    const ctx = ensureAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        if (!fromGesture) attachGestureUnlock();
        return;
      }
    }

    if (ctx.state !== "running") {
      if (!fromGesture) attachGestureUnlock();
      return;
    }

    state.played = true;
    removeGestureUnlock();
    playMarimbaPhrase(ctx);
  }

  function initOpenSound() {
    if (state.initialized) return;
    state.initialized = true;
    tryPlayOpenSound(false);
  }

  window.initOpenSound = initOpenSound;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOpenSound, { once: true });
  } else {
    initOpenSound();
  }
})();


/* ============================================================
 * 模块：Rest Overlay（保存并开始休息 -> 全屏休息页）
 * ------------------------------------------------------------
 * 技术实现：
 * 1) 动态创建 Overlay DOM，避免污染主页面结构
 * 2) SVG 圆环通过 strokeDashoffset 展示进度
 * 3) requestAnimationFrame 驱动倒计时（reduce-motion 下改为每秒更新）
 * 4) 焦点圈定 + Esc 关闭 + 关闭后焦点回触发按钮
 * ============================================================ */
(function () {
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

  const REST_MAP = { 25: 5, 50: 10, 90: 20 };

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

    document.querySelectorAll(".mood").forEach((button) => {
      button.addEventListener("click", () => {
        const feel = button.dataset.feel || normalizeFeelFromText(button.textContent);
        window.appState.feel = feel;
      });
    });
  }

  function parseSessionMinutes() {
    if (typeof window.getRestMinutesFromSession === "function") {
      try {
        const directRest = Number(window.getRestMinutesFromSession());
        if (Number.isFinite(directRest) && directRest > 0) {
          if (directRest === 5) return 25;
          if (directRest === 10) return 50;
          if (directRest === 20) return 90;
        }
      } catch {
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
      } catch {
      }
    }
    return REST_MAP[parseSessionMinutes()] || 5;
  }

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

  function setProgress(value) {
    const p = Math.max(0, Math.min(1, value));
    state.progress = p;
    const offset = state.ringLength * (1 - p);
    state.progressEl.style.strokeDashoffset = String(offset);
  }

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

  function scheduleAutoExitAfterRestDone(delayMs) {
    if (state.autoExitTimer) clearTimeout(state.autoExitTimer);
    state.autoExitTimer = setTimeout(() => {
      if (state.finished) closeOverlay();
    }, delayMs);
  }

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
        state.flashTimer = setTimeout(() => state.progressEl.classList.remove("is-flash"), 180);
        state.cleanupWaveTimer = setTimeout(() => state.overlay.classList.remove("is-finished-effect"), 1800);
      }
    };

    state.rafId = requestAnimationFrame(merge);
  }

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
      if (left <= 0) finishNaturally();
    }, 1000);
  }

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

