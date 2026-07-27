import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type {
  CommandResult,
  OrchestrateAction,
  OrchestrateSessionInput,
} from "../types/schemas.js";
import type { ActiveSession } from "../session/manager.js";
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

async function moveCursor(
  page: Page,
  action: OrchestrateAction,
  point: { x: number; y: number }
): Promise<void> {
  await page.mouse.move(point.x, point.y, { steps: stepsFor(action) });
}

async function runOne(page: Page, action: OrchestrateAction): Promise<void> {
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
        await page.mouse.click(pt.x, pt.y);
      } else if (action.selector) {
        await page.locator(action.selector).first().click();
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
    `| # | description | action | startMs | endMs | ok | reason |`,
    `|---|-------------|--------|---------|-------|----|--------|`,
  ];
  for (const r of results) {
    lines.push(
      `| ${r.index} | ${r.description.replace(/\|/g, "\\|")} | ${r.action} | ${r.startMs} | ${r.endMs} | ${r.ok} | ${(r.reason ?? "").replace(/\|/g, "\\|")} |`
    );
  }
  lines.push(``);
  for (const r of results) {
    lines.push(`## ${r.index}. ${r.description}`);
    lines.push(``);
    lines.push(`- action: \`${r.action}\``);
    lines.push(`- window: ${r.startMs}–${r.endMs} ms`);
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
  // Normalize so a batch that continues a prior timeline (e.g. startMs: 12300)
  // plays from 0 without dead air; preserve relative gaps. Log original times.
  const paceOffset = input.commands[0]?.startMs ?? 0;

  for (let i = 0; i < input.commands.length; i++) {
    const cmd = input.commands[i]!;
    const pacedStart = Math.max(0, cmd.startMs - paceOffset);
    const elapsed = Date.now() - t0;
    if (pacedStart > elapsed) {
      await sleep(pacedStart - elapsed);
    }
    const start = Date.now();
    try {
      await runOne(page, cmd);
      const durationMs = Date.now() - start;
      results.push({
        index: i,
        description: cmd.description,
        action: cmd.action,
        startMs: cmd.startMs,
        endMs: cmd.endMs,
        ok: true,
        durationMs,
      });
    } catch (err) {
      results.push({
        index: i,
        description: cmd.description,
        action: cmd.action,
        startMs: cmd.startMs,
        endMs: cmd.endMs,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
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
