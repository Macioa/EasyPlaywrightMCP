/**
 * Synthetic cursor + click ripple (demo-video.md / demo-videos/cursor-init.mjs).
 * Serialized into the page via addInitScript — must be self-contained.
 */
export function cursorInitSource(): string {
  return `(() => {
  const install = () => {
    if (window.__epmCursorInstalled) return;
    window.__epmCursorInstalled = true;
    const root = document.documentElement;

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

    const move = (x, y) => {
      cursor.style.transform = "translate(" + (x - 2) + "px, " + (y - 2) + "px)";
    };
    window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);

    const ripple = (x, y) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed",
        left: x + "px",
        top: y + "px",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        border: "2px solid rgba(0,74,173,.9)",
        background: "rgba(0,74,173,.18)",
        transform: "translate(-50%,-50%) scale(1)",
        zIndex: "2147483645",
        pointerEvents: "none",
        transition: "transform 480ms ease-out, opacity 480ms ease-out",
      });
      root.appendChild(r);
      requestAnimationFrame(() => {
        r.style.transform = "translate(-50%,-50%) scale(6)";
        r.style.opacity = "0";
      });
      setTimeout(() => r.remove(), 520);
    };
    window.addEventListener("mousedown", (e) => ripple(e.clientX, e.clientY), true);
    window.__epmCursorMove = move;
  };

  if (document.documentElement) install();
  else document.addEventListener("DOMContentLoaded", install);
})();`;
}
