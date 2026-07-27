# EasyPlaywrightMCP

LLM-driven Playwright MCP for **automated testing** and **demo videos**.

Capture: synthetic cursor + always-on click highlight, **1920×1080 @ deviceScaleFactor 2**, WebM→H.264 **60fps `minterpolate`**, smooth rAF scroll.  
Narration: Microsoft Edge neural TTS via **`edge-tts`**.

### Install

| Client | Guide |
| --- | --- |
| Cursor | [docs/INSTALL-CURSOR.md](docs/INSTALL-CURSOR.md) |
| Cursor CLI | [docs/INSTALL-CURSOR-CLI.md](docs/INSTALL-CURSOR-CLI.md) |
| Claude Desktop | [docs/INSTALL-CLAUDE.md](docs/INSTALL-CLAUDE.md) |
| Claude CLI | [docs/INSTALL-CLAUDE-CLI.md](docs/INSTALL-CLAUDE-CLI.md) |

## Workflows

### Automated testing

1. `login` → save `profileId` (or `set_session_auth` for Google/bot-blocked OAuth)
2. `start_session` (usually headless) with `profileId`
3. Loop: `query_session` → `orchestrate_session`
4. `end_session`
5. Short answer to the user (pass/fail + findings)

### Demo videos

1. `login` if auth is needed (or `set_session_auth` for restricted providers)
2. `start_session` with `recordVideoPath` (demoMode / auto-narrate on by default)
3. Loop: `query_session` → `orchestrate_session` — put spoken lines in `description` / `narration`; server TTS + holds
4. `end_session` (finalizes WebM, trims idle, writes/updates `.cues.json`)
5. `compile_demo` with clip `videoPath` only (loads cues automatically)

**Demo vs testing:** Recording sessions conjoin speech and UI on the server. Testing sessions (no `recordVideoPath`) keep snappy `startMs`/`endMs` pacing.

**Restricted auth:** For Google OAuth / Sign in with Google (and Microsoft, Discord, Cloudflare bot walls, etc.), do **not** use headed `login`. Immediately give the user the login URL, Network → Cookie header steps, and the console snippet from MCP instructions; then `set_session_auth` with their paste → `start_session({ profileId })`.

## Tools & type examples

### `login`

```ts
// LoginInput
{
  siteUrl: "https://app.example.com",
  authUrl: "https://app.example.com/login",
  username?: "user@example.com",
  password?: "secret",
  oauth?: {
    accessToken?: "eyJ...",
    cookies?: [{ name: "sid", value: "x", domain: "app.example.com" }],
    localStorage?: [{ name: "token", value: "eyJ..." }]
  },
  httpCredentials?: { username: "u", password: "p" },
  tokens?: { bearer?: "eyJ...", cookies?: [], localStorage?: [] },
  timeoutMs?: 120000,
  profileId?: "prof_abc" // reuse
}
// LoginResult → { ok: true, profileId: "prof_…", strategy: "password" }
```

**Strategies:** `password` · `http_basic` · `token_inject` · `oauth_tokens` · `manual` (headed OAuth/password window) · `reuse_profile`

### `set_session_auth`

```ts
// SetSessionAuthInput
{
  siteUrl: "https://app.example.com/dashboard",
  credentialsJson: JSON.stringify({
    origin: "https://app.example.com",
    cookies: [{ name: "session", value: "abc", domain: "app.example.com", path: "/" }],
    localStorage: [{ name: "token", value: "eyJ..." }],
    sessionStorage: []
  }),
  sessionId?: "sess_…", // optional: also inject into a live session
  authUrl?: "https://app.example.com/login"
}
// → { ok: true, profileId: "prof_…", strategy: "restricted_auth", sessionId?: "sess_…" }
```

Use when the user must log in in their own browser. **Always** (Google OAuth / Sign in with Google, Microsoft, Apple, Discord, Cloudflare Turnstile, Okta/Auth0 social). Accepts Network Cookie-header snippet JSON or Playwright `storageState`. Always saves a reusable `profileId`.

### `start_session`

```ts
{
  startUrl?: "https://app.example.com/dashboard",
  headed?: false,
  recordVideoPath?: "C:/Videos/clip.webm", // omit = no record; set => demoMode
  narrate?: true, // default true when recording; false = silent capture
  voice?: "en-US-AndrewNeural",
  rate?: "+10%",
  profileId?: "prof_abc"
}
// → { sessionId: "sess_…", headed: false, recording: true, demoMode: true, startUrl?: "…" }
```

### `query_sessions` / `query_session`

```ts
// query_session
{ sessionId: "sess_…" }
// → { url, title, viewport, ariaSnapshot, interactive: [{ role, name, selectorHint }] }
```

### `orchestrate_session`

```ts
{
  sessionId: "sess_…",
  recordStepsPath?: "C:/Videos/steps.md",
  commands: [
    {
      action: "click", // move|click|tap|type|press|scroll|wait|navigate|select|hover
      description: "Open Settings from the sidebar", // also default VO text in demoMode
      narration?: "Spoken override",
      skipNarration?: false,
      startMs: 0, // ignored for pacing while recording
      endMs: 1000,
      selector: "nav >> text=Settings",
      speed: "fast", // fast (default) | slow | timed
      fill?: false // demos: false for live typing
    }
  ]
}
// → { commands: [{ index, description, action, startMs, endMs, videoStartMs?, videoEndMs?, ok, reason? }] }
// Recording also writes C:/Videos/clip.cues.json
```

### `end_session`

```ts
{ sessionId: "sess_…" }
// → { ok: true, videoPath?: "C:/Videos/clip.webm" }
```

### `compile_demo`

```ts
{
  outputPath: "C:/Videos/final-demo.mp4",
  fast?: false, // skip minterpolate for quick check
  content: [
    {
      kind: "slate",
      eyebrow: "INTRO",
      heading: "Product Demo",
      body: "A quick walkthrough",
      durationMs: 3000,
      narration: [{ startMs: 0, endMs: 2800, text: "Welcome to the demo." }]
    },
    {
      kind: "clip",
      videoPath: "C:/Videos/clip.webm" // loads clip.cues.json automatically
    }
  ]
}
// → { ok: true, outputPath: "C:/Videos/final-demo.mp4" }
```

## Prerequisites

- Node 20+
- `ffmpeg` / `ffprobe` on PATH (Gyan build: `winget install Gyan.FFmpeg`)
- `python -m pip install edge-tts`
- Chromium via `npx playwright install chromium` (runs on `npm install`)

## Install

| Client | Doc |
|--------|-----|
| Cursor IDE | [docs/INSTALL-CURSOR.md](docs/INSTALL-CURSOR.md) |
| Cursor CLI | [docs/INSTALL-CURSOR-CLI.md](docs/INSTALL-CURSOR-CLI.md) |
| Claude Desktop | [docs/INSTALL-CLAUDE.md](docs/INSTALL-CLAUDE.md) |
| Claude Code CLI | [docs/INSTALL-CLAUDE-CLI.md](docs/INSTALL-CLAUDE-CLI.md) |

```bash
npm install
npm run build
npm start   # stdio MCP
npm test
npm run typecheck
```

Auth profiles and scratch files live under `%USERPROFILE%\.easy-playwright-mcp\`.
