/**
 * Shared LLM-facing protocol for restricted auth (set_session_auth).
 * Keep SERVER_INSTRUCTIONS and the set_session_auth tool description in sync via this constant.
 */
export const RESTRICTED_AUTH_SNIPPET = `(() => {
  const cookieHeader = prompt(
    "PASTE the full Cookie request header here (Network → document request → Request Headers → Cookie). Type allow pasting in the console first if needed."
  );
  if (!cookieHeader || !cookieHeader.trim()) throw new Error("No Cookie header pasted");

  const host = location.hostname;
  const googleAuth =
    /^(SID|HSID|SSID|APISID|SAPISID|SIDCC|NID|OSID|__Secure-.*PSID.*|__Secure-.*PAPISID.*|__Secure-OSID)$/i;

  const byKey = new Map();
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!name) continue;
    const domain = googleAuth.test(name) ? ".google.com" : host;
    byKey.set(name + "|" + domain, {
      name,
      value,
      domain,
      path: "/",
      httpOnly: googleAuth.test(name) || /^(SID|HSID|SSID|OSID|__Secure-|__Host-)/i.test(name),
      secure: location.protocol === "https:",
      sameSite: "Lax",
    });
  }

  const localStorageEntries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    localStorageEntries.push({ name, value: localStorage.getItem(name) });
  }
  const sessionStorageEntries = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const name = sessionStorage.key(i);
    sessionStorageEntries.push({ name, value: sessionStorage.getItem(name) });
  }

  const payload = {
    origin: location.origin,
    url: location.href,
    cookies: [...byKey.values()],
    localStorage: localStorageEntries,
    sessionStorage: sessionStorageEntries,
  };
  const text = JSON.stringify(payload, null, 2);
  copy(text);
  console.log(text);
  console.log("Copied " + payload.cookies.length + " cookies to clipboard — paste that JSON back to the assistant.");
  return payload;
})()`;

/**
 * Mandatory user-facing message the LLM must send BEFORE calling set_session_auth.
 * Replace LOGIN_URL with the concrete site/login URL for the task.
 */
export const RESTRICTED_AUTH_USER_MESSAGE_TEMPLATE = `I need you to sign in in your own browser (Playwright cannot complete this login). Do these steps exactly, then paste the JSON result here.

## 1. Open and sign in
Open this URL and fully complete login until you see the logged-in app (not only the Google/Microsoft interstitial):
LOGIN_URL

## 2. Copy the Cookie request header (includes httpOnly cookies)
1. Open DevTools (F12) → **Network**
2. Check **Preserve log**
3. Clear the network list, then reload the page (Ctrl+R)
4. Find the main **document** request for this site (Type = document, status 200). Skip xhr/fetch/css/js and skip accounts.google.com / login.microsoftonline.com interstitial rows unless that IS the app.
5. Click that document row → **Headers** → **Request Headers** → **Cookie**
6. Copy the **entire** Cookie header value (one long line)

## 3. Run this console snippet
1. DevTools → **Console**
2. If paste is blocked, type \`allow pasting\` and press Enter
3. Paste and run:

\`\`\`js
${RESTRICTED_AUTH_SNIPPET}
\`\`\`

4. When prompted, paste the Cookie header from step 2
5. The snippet copies JSON to your clipboard — **paste that JSON back to me**

Do not summarize or redact cookies. I will call set_session_auth with your paste.`;

export const WHEN_TO_USE_SET_SESSION_AUTH = `## When to use set_session_auth (evaluate BEFORE calling login)

Use set_session_auth — NOT login (especially NOT headed/manual login) — when ANY of these are true:

### Always treat as restricted (default to set_session_auth)
- **Google OAuth / Sign in with Google** (accounts.google.com, Gmail, Google Workspace, Firebase Google, "Continue with Google")
- **Microsoft / Azure AD / Entra ID** (login.microsoftonline.com, "Sign in with Microsoft")
- **Apple Sign In**
- **Discord OAuth** (discord.com/oauth2 — often blocks automation)
- **GitHub OAuth** when the site uses GitHub social login with bot checks
- **Cloudflare** Turnstile / bot challenge / "Verify you are human" on the login path
- **Okta / Auth0 / Cognito Hosted UI** social login that opens a third-party IdP
- Target is a Google property (e.g. mail.google.com, drive.google.com) or explicitly mentions Google login
- User says they must use Google / SSO / "my browser" / 2FA device prompt that automation cannot complete

### Also switch to set_session_auth if you observe
- login timed out or failed with OAuth popup / redirect loops
- query_session shows accounts.google.com / login.microsoftonline.com / Cloudflare challenge instead of the app
- Headed Playwright Chrome is rejected ("This browser or app may not be secure", bot detection)

### Prefer normal login instead when
- Username/password form on the app itself (no Google/Microsoft/Apple interstitial)
- HTTP Basic
- User already provides bearer tokens / cookies / storageState that are known-good
- Reusing an existing profileId that still works

### Critical behavior rule (high reproducibility)
As soon as you decide set_session_auth is required:
1. **Immediately** send the user the login URL + Network Cookie steps + JS snippet (use the Restricted auth user-message template). Do this in the **same turn**, before waiting on other tools.
2. Do **NOT** call login with a headed window for Google OAuth / the restricted cases above.
3. Do **NOT** call set_session_auth until the user pastes credentials JSON.
4. After a successful set_session_auth, use the returned profileId with start_session.`;
