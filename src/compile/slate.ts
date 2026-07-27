import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { captureContextOptions, injectCaptureHelpers } from "../browser/context.js";
import { VIEWPORT } from "../paths.js";
import type { DemoSlate } from "../types/schemas.js";
import { convertVideo } from "./convert.js";
import { sleep } from "../util/sleep.js";

export function slateHtml(s: {
  eyebrow?: string;
  heading: string;
  body?: string;
  footer?: string;
}): string {
  const esc = (t: string) =>
    t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      background:radial-gradient(1200px 800px at 20% 10%,#0a3d86 0%,#072a5e 45%,#04173a 100%);color:#fff}
    .wrap{height:100%;display:flex;flex-direction:column;justify-content:center;
      align-items:flex-start;padding:0 12vw;gap:20px;
      animation:fade .5s ease both}
    .eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:18px;font-weight:700;color:#7fb0ff}
    .heading{font-size:58px;line-height:1.08;font-weight:800;max-width:1150px;letter-spacing:-.02em}
    .body{font-size:27px;line-height:1.5;max-width:1050px;color:#dbe7ff}
    .footer{margin-top:6px;font-size:19px;font-weight:600;color:#9ab6e6}
    @keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  </style></head><body><div class="wrap">
    ${s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : ""}
    <div class="heading">${esc(s.heading)}</div>
    ${s.body ? `<div class="body">${esc(s.body)}</div>` : ""}
    ${s.footer ? `<div class="footer">${esc(s.footer)}</div>` : ""}
  </div></body></html>`;
}

export async function recordSlate(
  slate: DemoSlate,
  outMp4: string,
  scratchDir: string,
  fast: boolean
): Promise<void> {
  const webmDir = path.join(scratchDir, "slate-webm");
  fs.mkdirSync(webmDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(
      captureContextOptions({
        recordVideo: {
          dir: webmDir,
          size: { width: VIEWPORT.width, height: VIEWPORT.height },
        },
      })
    );
    await injectCaptureHelpers(context);
    const page = await context.newPage();
    await page.setContent(slateHtml(slate), { waitUntil: "domcontentloaded" });
    await sleep(Math.max(500, slate.durationMs));
    const video = page.video();
    await page.close();
    const raw = video ? await video.path() : null;
    await context.close();
    if (!raw) throw new Error("Slate recording produced no video");
    const webmPath = path.join(scratchDir, "slate-raw.webm");
    fs.renameSync(raw, webmPath);
    convertVideo(webmPath, outMp4, fast);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
