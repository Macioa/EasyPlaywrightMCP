# Google Workspace (G Suite) — restricted auth (cookies)

Google / Workspace blocks automated Playwright OAuth (“This browser or app may not be secure”). Sign in in your own browser, copy cookies, then inject them with **`set_session_auth`** (or `login` with `oauth.cookies`).

Do **not** use headed `login` for Google OAuth, Gmail, Drive, Calendar, Admin, or “Sign in with Google”.

## What to obtain

**One thing:** the full **Cookie** request header from the **logged-in product** page (e.g. Gmail), not from the `accounts.google.com` interstitial alone.

That single header must include at least:

| Cookie | Required |
| --- | --- |
| `SID`, `HSID`, `SSID` | Yes — core Google session |
| `APISID`, `SAPISID` | Yes — API / request auth |
| `__Secure-1PSID`, `__Secure-3PSID` | Yes — secure session (names may vary slightly) |
| `__Secure-*PAPISID*` (e.g. `__Secure-1PAPISID`) | Yes — pairs with the PSID cookies |

Copy the **entire** Cookie header (one long line). Do not hand-pick a few names — Google rotates cookie sets; a partial set usually fails with “This browser or app may not be secure” or drops you back on `accounts.google.com`.

App-specific cookies (e.g. `GMAIL_AT`, `OSID`) come along when you copy from the product document request — no need to collect them separately.

You do **not** need: localStorage, sessionStorage, passwords, or a console snippet.

## Which page to use

Finish login until that product UI is visible, then copy cookies from **that** host:

| App | URL |
| --- | --- |
| Gmail | https://mail.google.com/ |
| Drive | https://drive.google.com/ |
| Calendar | https://calendar.google.com/ |
| Docs | https://docs.google.com/ |
| Admin console | https://admin.google.com/ |

For a third-party app that uses “Sign in with Google”, complete OAuth until the **target app** is visible, then copy the Cookie header from that app’s document request.

## How to copy it

1. Open the product URL above (or your app after Google login). Complete Workspace SSO / 2FA / passkey until you see the logged-in product UI.
2. DevTools (F12) → **Network** → enable **Preserve log**.
3. Clear the network list, then reload (Ctrl+R / Cmd+R).
4. Click the main **document** request for the product host (Type = document, status 200). Prefer `mail.google.com` / `drive.google.com` / etc. — skip xhr / fetch / css / js and skip `accounts.google.com` unless the task is account settings.
5. **Headers** → **Request Headers** → **Cookie** → copy the whole value.

Paste that Cookie header string to the assistant (do not redact). The assistant turns it into `credentialsJson` / cookie inject for EasyPlaywrightMCP (Google auth cookies are mapped to `.google.com`).

## Inject and start

```ts
set_session_auth({
  siteUrl: "https://mail.google.com/", // or Drive / Calendar / your app
  credentialsJson: /* cookies parsed from your Cookie header */,
})
// → profileId

start_session({ profileId, startUrl: "https://mail.google.com/" })
```

## Notes

- Google sessions rotate; re-copy the Cookie header if you land on `accounts.google.com` or a bot interstitial.
- Treat the Cookie header like a password — it grants full Workspace access.
