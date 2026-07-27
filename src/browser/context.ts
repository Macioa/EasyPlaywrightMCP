import type { BrowserContext, BrowserContextOptions } from "playwright";
import { cursorInitSource } from "./cursor.js";
import { scrollHelpersSource } from "./scroll.js";
import { DEVICE_SCALE_FACTOR, VIEWPORT } from "../paths.js";

export function captureContextOptions(
  extras: BrowserContextOptions = {}
): BrowserContextOptions {
  return {
    viewport: { ...VIEWPORT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    ...extras,
  };
}

export async function injectCaptureHelpers(context: BrowserContext): Promise<void> {
  await context.addInitScript(cursorInitSource());
  await context.addInitScript(scrollHelpersSource());
}
