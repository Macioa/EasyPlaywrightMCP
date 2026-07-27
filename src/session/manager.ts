import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { captureContextOptions, injectCaptureHelpers } from "../browser/context.js";
import { ensureDataDirs, storageStatePath, VIEWPORT } from "../paths.js";
import type { StartSessionInput, StartSessionResult } from "../types/schemas.js";

export interface ActiveSession {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: string;
  headed: boolean;
  recordDir?: string;
  recordVideoPath?: string;
  videoPath?: string;
  startUrl?: string;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  list(): Array<{
    sessionId: string;
    url: string;
    title: string;
    recording: boolean;
    createdAt: string;
    headed: boolean;
  }> {
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      url: s.page.url(),
      title: "",
      recording: Boolean(s.recordDir),
      createdAt: s.createdAt,
      headed: s.headed,
    }));
  }

  async listDetailed(): Promise<
    Array<{
      sessionId: string;
      url: string;
      title: string;
      recording: boolean;
      createdAt: string;
      headed: boolean;
    }>
  > {
    const out = [];
    for (const s of this.sessions.values()) {
      let title = "";
      try {
        title = await s.page.title();
      } catch {
        title = "";
      }
      out.push({
        sessionId: s.sessionId,
        url: s.page.url(),
        title,
        recording: Boolean(s.recordDir),
        createdAt: s.createdAt,
        headed: s.headed,
      });
    }
    return out;
  }

  get(sessionId: string): ActiveSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown session: ${sessionId}`);
    return s;
  }

  async start(input: StartSessionInput): Promise<StartSessionResult> {
    ensureDataDirs();
    const sessionId = `sess_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const headed = input.headed ?? false;

    let storageState: string | undefined;
    if (input.storageStatePath) {
      storageState = input.storageStatePath;
    } else if (input.profileId) {
      const p = storageStatePath(input.profileId);
      if (!fs.existsSync(p)) {
        throw new Error(`Auth profile not found: ${input.profileId}`);
      }
      storageState = p;
    }

    let recordDir: string | undefined;
    let recordVideoPath: string | undefined;
    if (input.recordVideoPath) {
      recordVideoPath = path.resolve(input.recordVideoPath);
      recordDir = path.join(
        path.dirname(recordVideoPath),
        `.epm-record-${sessionId}`
      );
      fs.mkdirSync(recordDir, { recursive: true });
    }

    const browser = await chromium.launch({
      headless: !headed,
    });

    const context = await browser.newContext(
      captureContextOptions({
        storageState,
        recordVideo: recordDir
          ? { dir: recordDir, size: { width: VIEWPORT.width, height: VIEWPORT.height } }
          : undefined,
      })
    );
    await injectCaptureHelpers(context);
    const page = await context.newPage();

    if (input.startUrl) {
      await page.goto(input.startUrl, { waitUntil: "domcontentloaded" });
    }

    const session: ActiveSession = {
      sessionId,
      browser,
      context,
      page,
      createdAt: new Date().toISOString(),
      headed,
      recordDir,
      recordVideoPath,
      startUrl: input.startUrl,
    };
    this.sessions.set(sessionId, session);

    return {
      sessionId,
      headed,
      recording: Boolean(recordDir),
      startUrl: input.startUrl,
    };
  }

  async end(sessionId: string): Promise<{ ok: boolean; reason?: string; videoPath?: string }> {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return { ok: false, reason: `Unknown session: ${sessionId}` };
    }

    let videoPath: string | undefined;
    try {
      if (s.recordDir) {
        const video = s.page.video();
        await s.page.close();
        if (video) {
          const raw = await video.path();
          if (s.recordVideoPath) {
            fs.mkdirSync(path.dirname(s.recordVideoPath), { recursive: true });
            fs.renameSync(raw, s.recordVideoPath);
            videoPath = s.recordVideoPath;
          } else {
            videoPath = raw;
          }
        }
        await s.context.close();
        await s.browser.close();
        try {
          fs.rmSync(s.recordDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      } else {
        await s.context.close();
        await s.browser.close();
      }
      this.sessions.delete(sessionId);
      return { ok: true, videoPath };
    } catch (err) {
      this.sessions.delete(sessionId);
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
        videoPath,
      };
    }
  }

  async endAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.end(id);
    }
  }
}

export const sessionManager = new SessionManager();
