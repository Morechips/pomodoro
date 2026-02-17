/* ============================================================
 * app-init.js (merged entry bootstrap)
 * ------------------------------------------------------------
 * Keep init calls isolated so feature modules stay testable.
 * ============================================================ */
(function () {
  function boot() {
    if (window.initFeelToast) {
      window.initFeelToast();
    }
    if (window.initRestOverlay) {
      window.initRestOverlay();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
