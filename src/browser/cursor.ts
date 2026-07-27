/**
 * Synthetic cursor + always-on click highlight (demo-video.md / demo-videos/cursor-init.mjs).
 * Serialized into the page via addInitScript — must be self-contained.
 *
 * Listeners/API live on window across navigations; DOM nodes are remounted
 * whenever the document is replaced (setContent / goto / SPA shell swaps).
 */
export function cursorInitSource(): string {
  return `(() => {
  const mount = () => {
    const root = document.documentElement;
    if (!root) return;
    if (document.querySelector("[data-epm-cursor]")) return;

    const cursor = document.createElement("div");
    cursor.setAttribute("data-epm-cursor", "");
    Object.assign(cursor.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "22px",
      height: "22px",
      zIndex: "2147483646",
      pointerEvents: "none",
      transform: "translate(-2px, -2px)",
      transition: "opacity 120ms ease",
      willChange: "transform",
    });
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg" ' +
      'style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">' +
      '<path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.7 L12 14 L19 14 Z" ' +
      'fill="#ffffff" stroke="#0b0b0b" stroke-width="1.2" ' +
      'stroke-linejoin="round"/></svg>';
    root.appendChild(cursor);
    window.__epmCursorEl = cursor;
  };

  if (!window.__epmCursorApi) {
    let lastHighlightAt = 0;

    const move = (x, y) => {
      mount();
      const cursor = window.__epmCursorEl;
      if (cursor) {
        cursor.style.transform = "translate(" + (x - 2) + "px, " + (y - 2) + "px)";
      }
    };

    const highlight = (x, y) => {
      mount();
      const now = Date.now();
      // Collapse explicit flash + mousedown from the same click.
      if (now - lastHighlightAt < 50) return;
      lastHighlightAt = now;
      const root = document.documentElement;
      if (!root) return;
      const ring = document.createElement("div");
      ring.setAttribute("data-epm-click", "");
      Object.assign(ring.style, {
        position: "fixed",
        left: x + "px",
        top: y + "px",
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        border: "3px solid rgba(255, 80, 0, 0.95)",
        background: "rgba(255, 140, 0, 0.35)",
        boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 0 18px rgba(255,100,0,0.55)",
        transform: "translate(-50%,-50%) scale(0.45)",
        opacity: "1",
        zIndex: "2147483645",
        pointerEvents: "none",
        transition: "transform 520ms ease-out, opacity 520ms ease-out",
        willChange: "transform, opacity",
      });
      root.appendChild(ring);
      // Force layout so the CSS transition always runs (visible in screencast).
      void ring.offsetWidth;
      requestAnimationFrame(() => {
        ring.style.transform = "translate(-50%,-50%) scale(7)";
        ring.style.opacity = "0";
      });
      setTimeout(() => ring.remove(), 560);
    };

    window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
    window.addEventListener("mousedown", (e) => highlight(e.clientX, e.clientY), true);

    window.__epmCursorApi = { mount, move, highlight };
    window.__epmCursorMove = move;
    window.__epmClickHighlight = highlight;
  }

  const boot = () => window.__epmCursorApi.mount();
  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();`;
}
