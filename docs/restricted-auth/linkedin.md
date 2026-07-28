# LinkedIn — restricted auth (cookies)

LinkedIn blocks automated/headed Playwright login. Sign in in your own browser, copy cookies, then inject them with **`set_session_auth`** (or `login` with `oauth.cookies`).

Do **not** use headed `login` for LinkedIn.

## What to obtain

**One thing:** the full **Cookie** request header from a logged-in `www.linkedin.com` page.

That single header must include at least:

| Cookie | Required |
| --- | --- |
| `li_at` | Yes — session auth |
| `JSESSIONID` | Yes — CSRF (value often looks like `"ajax:…"` including quotes) |
| `bcookie` | Yes — browser identity |
| `bscookie` | Yes — browser identity |

Copy the **entire** Cookie header (one long line). Do not hand-pick only `li_at` / `JSESSIONID` — missing `bcookie` / `bscookie` commonly causes redirect loops and auth failure after a short time.

You do **not** need: localStorage, sessionStorage, passwords, or a console snippet.

## How to copy it

1. Open https://www.linkedin.com/feed/ and finish login (2FA / checkpoint if prompted) until you see your **feed** — not `/login`, `/checkpoint`, `/uas`, or an auth wall.
2. DevTools (F12) → **Network** → enable **Preserve log**.
3. Clear the network list, then reload (Ctrl+R / Cmd+R).
4. Click the main **document** request for `www.linkedin.com` (Type = document, status 200). Skip xhr / fetch / css / js.
5. **Headers** → **Request Headers** → **Cookie** → copy the whole value.

Paste that Cookie header string to the assistant (do not redact). The assistant turns it into `credentialsJson` / cookie inject for EasyPlaywrightMCP.

## Inject and start

```ts
set_session_auth({
  siteUrl: "https://www.linkedin.com/feed/",
  credentialsJson: /* cookies parsed from your Cookie header */,
})
// → profileId

start_session({ profileId, startUrl: "https://www.linkedin.com/feed/" })
```

## Notes

- Sessions expire; re-copy the Cookie header if `query_session` lands on login / checkpoint / redirect loops.
- Treat the Cookie header like a password — it grants full account access.
- Sales Navigator / Recruiter: the same full Cookie header usually includes `li_a` when needed; still copy the entire header, not individual cookies.
