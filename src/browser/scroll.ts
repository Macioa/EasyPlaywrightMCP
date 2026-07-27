/**
 * Smooth rAF scroll helpers (from demo-videos/overlay.mjs).
 */
export function scrollHelpersSource(): string {
  return `(() => {
  if (window.__epmScroll) return;
  window.__epmScroll = {
    smoothScrollTo(y, ms) {
      return new Promise((resolve) => {
        const startY = window.scrollY;
        const dist = y - startY;
        const dur = ms || 1200;
        let t0 = null;
        const ease = (p) =>
          p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const step = (ts) => {
          if (t0 === null) t0 = ts;
          const p = Math.min(1, (ts - t0) / dur);
          window.scrollTo(0, startY + dist * ease(p));
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    async smoothScrollToSelector(sel, ms, offset) {
      const el = document.querySelector(sel);
      if (!el) return false;
      const y =
        el.getBoundingClientRect().top + window.scrollY - (offset || 120);
      await this.smoothScrollTo(Math.max(0, y), ms);
      return true;
    },
  };
})();`;
}
