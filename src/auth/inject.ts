import type { BrowserContext, Page } from "playwright";
import type { CookieInput, LoginInput, OAuthCreds, StorageEntry } from "../types/schemas.js";

export async function applyStorageEntries(
  page: Page,
  localEntries?: StorageEntry[],
  sessionEntries?: StorageEntry[]
): Promise<void> {
  await page.evaluate(
    ({ local, session }) => {
      for (const e of local ?? []) window.localStorage.setItem(e.name, e.value);
      for (const e of session ?? []) window.sessionStorage.setItem(e.name, e.value);
    },
    { local: localEntries ?? [], session: sessionEntries ?? [] }
  );
}

export async function applyCookies(
  context: BrowserContext,
  cookies: CookieInput[],
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

export async function injectOauthLike(
  context: BrowserContext,
  page: Page,
  siteUrl: string,
  oauth: OAuthCreds,
  extraTokens?: LoginInput["tokens"]
): Promise<void> {
  const cookies = [...(oauth.cookies ?? []), ...(extraTokens?.cookies ?? [])];
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

  const localEntries = [...(oauth.localStorage ?? []), ...(extraTokens?.localStorage ?? [])];
  if (oauth.accessToken) {
    localEntries.push({ name: "access_token", value: oauth.accessToken });
    localEntries.push({ name: "token", value: oauth.accessToken });
  }
  if (extraTokens?.bearer) {
    localEntries.push({ name: "access_token", value: extraTokens.bearer });
    localEntries.push({ name: "token", value: extraTokens.bearer });
  }
  await applyStorageEntries(page, localEntries, [
    ...(oauth.sessionStorage ?? []),
    ...(extraTokens?.sessionStorage ?? []),
  ]);
  await page.reload({ waitUntil: "domcontentloaded" });
}

/** Inject cookies + web storage into an existing context/page (restricted auth / live session). */
export async function injectCredentials(
  context: BrowserContext,
  page: Page,
  siteUrl: string,
  creds: {
    cookies?: CookieInput[];
    localStorage?: StorageEntry[];
    sessionStorage?: StorageEntry[];
  }
): Promise<void> {
  await injectOauthLike(context, page, siteUrl, {
    cookies: creds.cookies,
    localStorage: creds.localStorage,
    sessionStorage: creds.sessionStorage,
  });
}
