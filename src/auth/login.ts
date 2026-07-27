import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { captureContextOptions, injectCaptureHelpers } from "../browser/context.js";
import {
  ensureDataDirs,
  profileDir,
  storageStatePath,
} from "../paths.js";
import type { LoginInput, LoginResult } from "../types/schemas.js";
import { sleep } from "../util/sleep.js";
import { injectOauthLike } from "./inject.js";

export type LoginStrategy =
  | "reuse_profile"
  | "http_basic"
  | "token_inject"
  | "oauth_tokens"
  | "password"
  | "manual";

const USER_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="user"]',
  'input[id="email"]',
  'input[id="username"]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[type="text"]',
];

const PASS_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[id="password"]',
  'input[autocomplete="current-password"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Continue")',
];

function canAutoLogin(input: LoginInput): boolean {
  if (input.profileId) return true;
  if (input.httpCredentials) return true;
  if (input.username && input.password) return true;
  if (input.tokens?.bearer || input.tokens?.cookies?.length || input.tokens?.localStorage?.length) {
    return true;
  }
  if (
    input.oauth &&
    (input.oauth.accessToken ||
      input.oauth.cookies?.length ||
      input.oauth.localStorage?.length ||
      input.oauth.idToken)
  ) {
    return true;
  }
  return false;
}

function chooseStrategy(input: LoginInput): LoginStrategy {
  if (input.profileId) return "reuse_profile";
  if (input.httpCredentials) return "http_basic";
  if (
    input.oauth &&
    (input.oauth.accessToken ||
      input.oauth.cookies?.length ||
      input.oauth.localStorage?.length ||
      input.oauth.idToken)
  ) {
    return "oauth_tokens";
  }
  if (input.tokens?.bearer || input.tokens?.cookies?.length || input.tokens?.localStorage?.length) {
    return "token_inject";
  }
  if (input.username && input.password) return "password";
  return "manual";
}

async function firstVisible(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      return sel;
    }
  }
  return null;
}

function isAuthPath(pathname: string): boolean {
  return /login|signin|sign-in|sign-up|signup|oauth|authorize|auth/i.test(pathname);
}

async function hasAuthCookies(
  context: BrowserContext,
  siteUrl: string
): Promise<boolean> {
  try {
    const cookies = await context.cookies([siteUrl, new URL(siteUrl).origin]);
    // Definitive session credentials only — Clerk's __client_uat alone is NOT enough
    // (that marker can appear before __session is written; saving then yields a useless profile).
    return cookies.some((c) => {
      if (!c.value) return false;
      return /^(__session|session|sid|access_token|id_token)$/i.test(c.name);
    });
  } catch {
    return false;
  }
}

/** True when the page has left the auth surface for the target app. */
async function landedOnApp(page: Page, authUrl: string, siteUrl: string): Promise<boolean> {
  let url = "";
  try {
    url = page.url();
  } catch {
    return false;
  }
  try {
    const auth = new URL(authUrl);
    const cur = new URL(url);
    if (isAuthPath(cur.pathname)) return false;
    if (cur.href.startsWith(siteUrl)) return true;
    if (cur.origin === auth.origin && cur.pathname !== auth.pathname) return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function looksAuthenticated(
  page: Page,
  authUrl: string,
  siteUrl: string,
  context?: BrowserContext
): Promise<boolean> {
  if (await landedOnApp(page, authUrl, siteUrl)) {
    return true;
  }

  if (context && (await hasAuthCookies(context, siteUrl))) {
    return true;
  }

  // Cookie / storage heuristics — must not throw on OAuth navigations / popups
  try {
    return await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      if (
        keys.some(
          (k) =>
            /^(access_token|id_token|token|session|auth|user)$/i.test(k) &&
            Boolean(window.localStorage.getItem(k))
        )
      ) {
        return true;
      }
      return /(?:^|;\s*)(__session|session|sid|auth|token|access_token)=/i.test(
        document.cookie
      );
    });
  } catch {
    // "Execution context was destroyed" during Google/OAuth redirects
    return false;
  }
}

async function launchBrowser(headed: boolean): Promise<Browser> {
  // Real Chrome is far more likely to complete Google/Discord OAuth than bundled Chromium.
  // Strip automation switches so Google is less likely to reject the OAuth popup.
  const antiDetect = {
    ignoreDefaultArgs: ["--enable-automation"] as string[],
    args: ["--disable-blink-features=AutomationControlled"],
  };
  if (headed) {
    try {
      return await chromium.launch({
        headless: false,
        channel: "chrome",
        ...antiDetect,
      });
    } catch {
      /* fall back to bundled Chromium */
    }
    return await chromium.launch({ headless: false, ...antiDetect });
  }
  return await chromium.launch({ headless: true });
}

export async function saveProfile(
  context: BrowserContext,
  meta: { siteUrl: string; authUrl: string; strategy: string }
): Promise<string> {
  ensureDataDirs();
  const profileId = `prof_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const dir = profileDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: storageStatePath(profileId) });
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ ...meta, profileId, savedAt: new Date().toISOString() }, null, 2)
  );
  return profileId;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const timeoutMs = input.timeoutMs ?? 120_000;
  const strategy = chooseStrategy(input);
  const auto = canAutoLogin(input);
  const headed = !auto;

  let browser: Browser | undefined;
  try {
    browser = await launchBrowser(headed);
    const context = await browser.newContext(
      captureContextOptions({
        httpCredentials: input.httpCredentials,
        storageState:
          strategy === "reuse_profile" && input.profileId
            ? storageStatePath(input.profileId)
            : undefined,
      })
    );
    await injectCaptureHelpers(context);
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(timeoutMs, 30_000));

    if (strategy === "reuse_profile") {
      if (!input.profileId || !fs.existsSync(storageStatePath(input.profileId))) {
        return { ok: false, reason: `Profile not found: ${input.profileId}`, strategy };
      }
      await page.goto(input.siteUrl, { waitUntil: "domcontentloaded" });
      const ok = await looksAuthenticated(page, input.authUrl, input.siteUrl, context);
      if (!ok) {
        return {
          ok: false,
          reason: "Reused profile did not appear authenticated",
          strategy,
          profileId: input.profileId,
        };
      }
      return { ok: true, profileId: input.profileId, strategy };
    }

    if (strategy === "http_basic") {
      await page.goto(input.siteUrl, { waitUntil: "domcontentloaded" });
      const profileId = await saveProfile(context, {
        siteUrl: input.siteUrl,
        authUrl: input.authUrl,
        strategy,
      });
      return { ok: true, profileId, strategy };
    }

    if (strategy === "oauth_tokens" && input.oauth) {
      await injectOauthLike(context, page, input.siteUrl, input.oauth, input.tokens);
      const profileId = await saveProfile(context, {
        siteUrl: input.siteUrl,
        authUrl: input.authUrl,
        strategy,
      });
      return { ok: true, profileId, strategy };
    }

    if (strategy === "token_inject" && input.tokens) {
      await injectOauthLike(
        context,
        page,
        input.siteUrl,
        {
          cookies: input.tokens.cookies,
          localStorage: input.tokens.localStorage,
          sessionStorage: input.tokens.sessionStorage,
          accessToken: input.tokens.bearer,
        },
        input.tokens
      );
      const profileId = await saveProfile(context, {
        siteUrl: input.siteUrl,
        authUrl: input.authUrl,
        strategy,
      });
      return { ok: true, profileId, strategy };
    }

    if (strategy === "password" && input.username && input.password) {
      await page.goto(input.authUrl, { waitUntil: "domcontentloaded" });
      const userSel = await firstVisible(page, USER_SELECTORS);
      const passSel = await firstVisible(page, PASS_SELECTORS);
      if (!userSel || !passSel) {
        return {
          ok: false,
          reason: "Could not find username/password fields on auth page",
          strategy,
        };
      }
      await page.fill(userSel, input.username);
      await page.fill(passSel, input.password);
      const submit = await firstVisible(page, SUBMIT_SELECTORS);
      if (submit) {
        await Promise.all([
          page.waitForLoadState("domcontentloaded").catch(() => undefined),
          page.click(submit),
        ]);
      } else {
        await page.keyboard.press("Enter");
      }
      await sleep(800);
      // Prefer landing on site
      if (!page.url().startsWith(input.siteUrl)) {
        await page.goto(input.siteUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      }
      const ok = await looksAuthenticated(page, input.authUrl, input.siteUrl, context);
      if (!ok) {
        return { ok: false, reason: "Password login did not establish a session", strategy };
      }
      const profileId = await saveProfile(context, {
        siteUrl: input.siteUrl,
        authUrl: input.authUrl,
        strategy,
      });
      return { ok: true, profileId, strategy };
    }

    // Manual / OAuth interactive — keep browser open through Google/Discord popups.
    // Do not let mid-redirect evaluate errors abort the flow (that closed the window).
    const oauthPages = new Set<Page>([page]);
    context.on("page", (p) => {
      oauthPages.add(p);
      p.once("close", () => oauthPages.delete(p));
    });

    await page.goto(input.authUrl, { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + timeoutMs;
    let authenticated = false;
    while (Date.now() < deadline) {
      for (const p of [...oauthPages]) {
        if (p.isClosed()) {
          oauthPages.delete(p);
          continue;
        }
        try {
          if (await looksAuthenticated(p, input.authUrl, input.siteUrl, context)) {
            authenticated = true;
            break;
          }
        } catch {
          /* popup/main navigations are expected during OAuth */
        }
      }
      if (!authenticated && (await hasAuthCookies(context, input.siteUrl))) {
        authenticated = true;
      }
      if (authenticated) {
        // Prove the session sticks on the target app (Clerk otherwise redirects to sign-in).
        try {
          await page.goto(input.siteUrl, { waitUntil: "domcontentloaded" });
          await sleep(800);
          if (
            (await landedOnApp(page, input.authUrl, input.siteUrl)) &&
            (await hasAuthCookies(context, input.siteUrl))
          ) {
            break;
          }
        } catch {
          /* keep waiting */
        }
        authenticated = false;
      }
      await sleep(500);
    }
    if (!authenticated) {
      return {
        ok: false,
        reason: `Manual login timed out after ${timeoutMs}ms — complete OAuth/password in the window`,
        strategy: "manual",
      };
    }
    // One more settle so late Clerk cookies (__session) are present before save.
    await sleep(500);
    const profileId = await saveProfile(context, {
      siteUrl: input.siteUrl,
      authUrl: input.authUrl,
      strategy: "manual",
    });
    return { ok: true, profileId, strategy: "manual" };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      strategy,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export { canAutoLogin, chooseStrategy };
