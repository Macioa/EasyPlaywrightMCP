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
import type { LoginInput, LoginResult, OAuthCreds } from "../types/schemas.js";
import { sleep } from "../util/sleep.js";

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

async function applyStorageEntries(
  page: Page,
  localEntries?: { name: string; value: string }[],
  sessionEntries?: { name: string; value: string }[]
): Promise<void> {
  await page.evaluate(
    ({ local, session }) => {
      for (const e of local ?? []) window.localStorage.setItem(e.name, e.value);
      for (const e of session ?? []) window.sessionStorage.setItem(e.name, e.value);
    },
    { local: localEntries ?? [], session: sessionEntries ?? [] }
  );
}

async function applyCookies(
  context: BrowserContext,
  cookies: NonNullable<OAuthCreds["cookies"]>,
  fallbackUrl: string
): Promise<void> {
  const origin = new URL(fallbackUrl);
  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? origin.hostname,
      path: c.path ?? "/",
      httpOnly: c.httpOnly,
      secure: c.secure ?? origin.protocol === "https:",
      sameSite: c.sameSite ?? "Lax",
    }))
  );
}

async function injectOauthLike(
  context: BrowserContext,
  page: Page,
  siteUrl: string,
  oauth: OAuthCreds,
  extraTokens?: LoginInput["tokens"]
): Promise<void> {
  const cookies = [
    ...(oauth.cookies ?? []),
    ...(extraTokens?.cookies ?? []),
  ];
  if (oauth.accessToken) {
    cookies.push({
      name: "access_token",
      value: oauth.accessToken,
      path: "/",
    });
  }
  if (oauth.idToken) {
    cookies.push({ name: "id_token", value: oauth.idToken, path: "/" });
  }
  if (cookies.length) {
    await applyCookies(context, cookies, siteUrl);
  }

  await page.goto(siteUrl, { waitUntil: "domcontentloaded" });

  const localEntries = [
    ...(oauth.localStorage ?? []),
    ...(extraTokens?.localStorage ?? []),
  ];
  if (oauth.accessToken) {
    localEntries.push({ name: "access_token", value: oauth.accessToken });
    localEntries.push({ name: "token", value: oauth.accessToken });
  }
  if (extraTokens?.bearer) {
    localEntries.push({ name: "access_token", value: extraTokens.bearer });
    localEntries.push({ name: "token", value: extraTokens.bearer });
  }
  await applyStorageEntries(
    page,
    localEntries,
    [...(oauth.sessionStorage ?? []), ...(extraTokens?.sessionStorage ?? [])]
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function looksAuthenticated(
  page: Page,
  authUrl: string,
  siteUrl: string
): Promise<boolean> {
  const url = page.url();
  try {
    const auth = new URL(authUrl);
    const cur = new URL(url);
    // Left the auth path
    if (cur.origin === auth.origin && cur.pathname !== auth.pathname) {
      if (!/login|signin|sign-in|oauth|authorize|auth/i.test(cur.pathname)) {
        return true;
      }
    }
    if (cur.href.startsWith(siteUrl) && !/login|signin|sign-in/i.test(cur.pathname)) {
      return true;
    }
  } catch {
    /* ignore */
  }

  // Cookie / storage heuristics
  const hasSession = await page.evaluate(() => {
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
    return /(?:^|;\s*)(session|sid|auth|token|access_token)=/i.test(document.cookie);
  });
  return hasSession;
}

async function saveProfile(
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
    browser = await chromium.launch({ headless: !headed });
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
      const ok = await looksAuthenticated(page, input.authUrl, input.siteUrl);
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
      const ok = await looksAuthenticated(page, input.authUrl, input.siteUrl);
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

    // Manual / OAuth interactive
    await page.goto(input.authUrl, { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + timeoutMs;
    let authenticated = false;
    while (Date.now() < deadline) {
      if (await looksAuthenticated(page, input.authUrl, input.siteUrl)) {
        authenticated = true;
        break;
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
