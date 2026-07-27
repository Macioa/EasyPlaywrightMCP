import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type {
  CommandResult,
  OrchestrateAction,
  OrchestrateSessionInput,
} from "../types/schemas.js";
import type { ActiveSession } from "../session/manager.js";
import { buildCuesFile, writeCuesFile } from "../session/cues.js";
import {
  sessionVoDir,
  synthesizeNarration,
  VO_HOLD_PAD_MS,
} from "../compile/tts.js";
import { sleep } from "../util/sleep.js";

/** Cursor move step count. Exported for unit tests. */
export function stepsFor(action: OrchestrateAction): number {
  const speed = action.speed ?? "fast";
  if (speed === "fast") return 8;
  if (speed === "slow") return 40;
  const dur = Math.max(0, action.endMs - action.startMs);
  // Cap ~30 to match demo-video.md mouse.move({ steps: 30 })
  return Math.max(8, Math.min(30, Math.round(dur / 16)));
}

async function resolvePoint(
  page: Page,
  action: OrchestrateAction
): Promise<{ x: number; y: number } | null> {
  if (typeof action.x === "number" && typeof action.y === "number") {
    return { x: action.x, y: action.y };
  }
  if (action.selector) {
    const box = await page.locator(action.selector).first().boundingBox();
    if (!box) return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return null;
}

/** Dwell so the click ring is captured in screencast frames. */
const CLICK_HIGHLIGHT_HOLD_MS = 380;

async function moveCursor(
  page: Page,
  action: OrchestrateAction,
  point: { x: number; y: number }
): Promise<void> {
  await page.mouse.move(point.x, point.y, { steps: stepsFor(action) });
}

async function flashClickHighlight(
  page: Page,
  point: { x: number; y: number }
): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const w = window as Window & {
      __epmClickHighlight?: (x: number, y: number) => void;
    };
    w.__epmClickHighlight?.(x, y);
  }, point);
}

async function runOne(
  page: Page,
  action: OrchestrateAction,
  options: { holdClickHighlight?: boolean } = {}
): Promise<void> {
  switch (action.action) {
    case "move": {
      const pt = await resolvePoint(page, action);
      if (!pt) throw new Error("move requires x/y or selector");
      await moveCursor(page, action, pt);
      break;
    }
    case "click":
    case "tap": {
      const pt = await resolvePoint(page, action);
      if (pt) {
        await moveCursor(page, action, pt);
        await flashClickHighlight(page, pt);
        await page.mouse.click(pt.x, pt.y);
        if (options.holdClickHighlight) await sleep(CLICK_HIGHLIGHT_HOLD_MS);
      } else if (action.selector) {
        const box = await page.locator(action.selector).first().boundingBox();
        if (box) {
          await flashClickHighlight(page, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          });
        }
        await page.locator(action.selector).first().click();
        if (options.holdClickHighlight) await sleep(CLICK_HIGHLIGHT_HOLD_MS);
      } else {
        throw new Error("click/tap requires selector or x/y");
      }
      break;
    }
    case "hover": {
      const pt = await resolvePoint(page, action);
      if (pt) {
        await moveCursor(page, action, pt);
      } else if (action.selector) {
        await page.locator(action.selector).first().hover();
      } else {
        throw new Error("hover requires selector or x/y");
      }
      break;
    }
    case "type": {
      if (!action.text) throw new Error("type requires text");
      if (action.selector) {
        const loc = page.locator(action.selector).first();
        await loc.click({ timeout: 5000 });
        if (action.fill) {
          await loc.fill(action.text);
        } else {
          await loc.pressSequentially(action.text, { delay: 8 });
        }
      } else {
        await page.keyboard.type(action.text, { delay: 8 });
      }
      break;
    }
    case "press": {
      if (!action.key) throw new Error("press requires key");
      await page.keyboard.press(action.key);
      break;
    }
    case "select": {
      if (!action.selector || action.text === undefined) {
        throw new Error("select requires selector and text");
      }
      await page.locator(action.selector).first().selectOption({ label: action.text });
      break;
    }
    case "scroll": {
      const ms =
        action.scrollMs ?? Math.max(200, action.endMs - action.startMs);
      if (action.selector) {
        const ok = await page.evaluate(
          async ({ sel, duration }: { sel: string; duration: number }) => {
            const w = window as unknown as {
              __epmScroll?: {
                smoothScrollToSelector: (
                  s: string,
                  ms: number,
                  offset: number
                ) => Promise<boolean>;
              };
            };
            const api = w.__epmScroll;
            if (!api) return false;
            return api.smoothScrollToSelector(sel, duration, 120);
          },
          { sel: action.selector, duration: ms }
        );
        if (!ok) {
          await page.locator(action.selector).first().scrollIntoViewIfNeeded();
        }
      } else if (typeof action.scrollY === "number") {
        await page.evaluate(
          async ({ y, duration }: { y: number; duration: number }) => {
            const w = window as unknown as {
              __epmScroll?: {
                smoothScrollTo: (yy: number, ms: number) => Promise<void>;
              };
            };
            const api = w.__epmScroll;
            if (api) await api.smoothScrollTo(y, duration);
            else window.scrollTo(0, y);
          },
          { y: action.scrollY, duration: ms }
        );
      } else {
        throw new Error("scroll requires selector or scrollY");
      }
      break;
    }
    case "wait": {
      const ms = Math.max(0, action.endMs - action.startMs);
      await sleep(ms || 200);
      break;
    }
    case "navigate": {
      if (!action.url) throw new Error("navigate requires url");
      await page.goto(action.url, { waitUntil: "domcontentloaded" });
      break;
    }
    default:
      throw new Error(`Unsupported action: ${(action as OrchestrateAction).action}`);
  }
}

function videoOffsetMs(session: ActiveSession): number | undefined {
  if (session.recordingStartedAt === undefined) return undefined;
  return Math.max(0, Date.now() - session.recordingStartedAt);
}

export function formatStepsMarkdown(
  sessionId: string,
  results: CommandResult[]
): string {
  const lines = [
    `# Orchestration log`,
    ``,
    `- sessionId: \`${sessionId}\``,
    `- generated: ${new Date().toISOString()}`,
    ``,
    `| # | description | action | startMs | endMs | videoStartMs | videoEndMs | ok | reason |`,
    `|---|-------------|--------|---------|-------|--------------|------------|----|--------|`,
  ];
  for (const r of results) {
    lines.push(
      `| ${r.index} | ${r.description.replace(/\|/g, "\\|")} | ${r.action} | ${r.startMs} | ${r.endMs} | ${r.videoStartMs ?? ""} | ${r.videoEndMs ?? ""} | ${r.ok} | ${(r.reason ?? "").replace(/\|/g, "\\|")} |`
    );
  }
  lines.push(``);
  for (const r of results) {
    lines.push(`## ${r.index}. ${r.description}`);
    lines.push(``);
    lines.push(`- action: \`${r.action}\``);
    lines.push(`- window: ${r.startMs}–${r.endMs} ms`);
    if (r.videoStartMs !== undefined && r.videoEndMs !== undefined) {
      lines.push(`- video: ${r.videoStartMs}–${r.videoEndMs} ms`);
    }
    if (r.narrationText) lines.push(`- narration: ${r.narrationText}`);
    lines.push(`- result: ${r.ok ? "success" : "failure"}`);
    if (r.reason) lines.push(`- reason: ${r.reason}`);
    if (r.durationMs !== undefined) lines.push(`- durationMs: ${r.durationMs}`);
    lines.push(``);
  }
  return lines.join("\n");
}

export async function orchestrateSession(
  session: ActiveSession,
  input: OrchestrateSessionInput
): Promise<CommandResult[]> {
  const page = session.page;
  const results: CommandResult[] = [];
  const t0 = Date.now();
  const demoMode = session.demoMode;
  // Testing mode: normalize timeline so a batch that continues a prior clock
  // (e.g. startMs: 12300) plays from 0. demoMode ignores startMs/endMs pacing.
  const paceOffset = demoMode ? 0 : (input.commands[0]?.startMs ?? 0);
  const voDir = demoMode ? sessionVoDir(session.sessionId) : undefined;

  for (let i = 0; i < input.commands.length; i++) {
    const cmd = input.commands[i]!;

    if (!demoMode) {
      const pacedStart = Math.max(0, cmd.startMs - paceOffset);
      const elapsed = Date.now() - t0;
      if (pacedStart > elapsed) {
        await sleep(pacedStart - elapsed);
      }
    }

    const narrationText =
      cmd.skipNarration || cmd.action === "wait"
        ? undefined
        : (cmd.narration ?? cmd.description);

    let audioPath: string | undefined;
    let voMs = 0;
    if (demoMode && narrationText && voDir) {
      const syn = await synthesizeNarration({
        text: narrationText,
        voice: session.voice,
        rate: session.rate,
        outDir: voDir,
        index: i,
      });
      audioPath = syn.audioPath;
      voMs = syn.durationMs;
    }

    const videoStartMs = videoOffsetMs(session);
    const beatStart = Date.now();
    let ok = true;
    let reason: string | undefined;
    try {
      // wait actions in demoMode: hold for planned window only (no VO)
      if (demoMode && cmd.action === "wait") {
        const planned = Math.max(0, cmd.endMs - cmd.startMs);
        await sleep(planned || 200);
      } else {
        await runOne(page, cmd, {
          holdClickHighlight: Boolean(session.recordVideoPath),
        });
      }
    } catch (err) {
      ok = false;
      reason = err instanceof Error ? err.message : String(err);
    }

    if (demoMode && voMs > 0) {
      const elapsedBeat = Date.now() - beatStart;
      const hold = voMs + VO_HOLD_PAD_MS - elapsedBeat;
      if (hold > 0) await sleep(hold);
    }

    const durationMs = Date.now() - beatStart;
    const videoEndMs = videoOffsetMs(session);
    const narrationStartMs = videoStartMs;
    const narrationEndMs =
      videoStartMs !== undefined ? videoStartMs + voMs : undefined;

    results.push({
      index: i,
      description: cmd.description,
      action: cmd.action,
      startMs: cmd.startMs,
      endMs: cmd.endMs,
      ok,
      reason,
      durationMs,
      videoStartMs,
      videoEndMs,
      narrationText,
      narrationStartMs,
      narrationEndMs,
      audioPath,
    });
  }

  if (session.recordVideoPath && session.recordingStartedAt !== undefined) {
    const cues = buildCuesFile(
      session.sessionId,
      session.recordVideoPath,
      results,
      session.voice,
      session.rate
    );
    writeCuesFile(cues);
  }

  if (input.recordStepsPath) {
    const md = formatStepsMarkdown(input.sessionId, results);
    fs.mkdirSync(path.dirname(path.resolve(input.recordStepsPath)), {
      recursive: true,
    });
    fs.writeFileSync(input.recordStepsPath, md, "utf8");
  }

  return results;
}
