import { chromium, type Browser } from "playwright";
import { captureContextOptions, injectCaptureHelpers } from "../browser/context.js";
import { sessionManager } from "../session/manager.js";
import type { SetSessionAuthInput, SetSessionAuthResult } from "../types/schemas.js";
import { injectCredentials } from "./inject.js";
import { saveProfile } from "./login.js";
import { parseCredentialsJson } from "./parseCredentials.js";

export async function setSessionAuth(
  input: SetSessionAuthInput
): Promise<SetSessionAuthResult> {
  const strategy = "restricted_auth";
  const authUrl = input.authUrl ?? input.siteUrl;

  let creds;
  try {
    creds = parseCredentialsJson(input.credentialsJson);
  } catch (err) {
    return {
      ok: false,
      strategy,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(captureContextOptions({}));
    await injectCaptureHelpers(context);
    const page = await context.newPage();

    await injectCredentials(context, page, input.siteUrl, creds);

    const profileId = await saveProfile(context, {
      siteUrl: input.siteUrl,
      authUrl,
      strategy,
    });

    if (input.sessionId) {
      await sessionManager.applyAuth(input.sessionId, {
        siteUrl: input.siteUrl,
        cookies: creds.cookies,
        localStorage: creds.localStorage,
        sessionStorage: creds.sessionStorage,
      });
    }

    return {
      ok: true,
      profileId,
      sessionId: input.sessionId,
      strategy,
    };
  } catch (err) {
    return {
      ok: false,
      strategy,
      sessionId: input.sessionId,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
