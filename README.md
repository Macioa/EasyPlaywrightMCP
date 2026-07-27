# EasyPlaywrightMCP

LLM-driven Playwright MCP for **automated testing** and **demo videos**.

Capture: synthetic cursor, **1920×1080 @ deviceScaleFactor 2**, WebM→H.264 **60fps `minterpolate`**, smooth rAF scroll.  
Narration: Microsoft Edge neural TTS via **`edge-tts`**.

## Workflows

### Automated testing

1. `login` → save `profileId`
2. `start_session` (usually headless) with `profileId`
3. Loop: `query_session` → `orchestrate_session`
4. `end_session`
5. Short answer to the user (pass/fail + findings)

### Demo videos

1. `login` if auth is needed
2. `start_session` with `recordVideoPath`
3. Loop: `query_session` → `orchestrate_session` with `recordStepsPath`
4. `end_session` on every session
5. Review MD logs → `compile_demo`

**Demo interaction style:** short/direct; `speed: "fast"`; `fill: false` (live typing at delay 8); each `orchestrate_session` clock starts at 0 (do not continue prior timelines); short dwells; minimal scroll; batch related actions in one call.

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

### `start_session`

```ts
{
  startUrl?: "https://app.example.com/dashboard",
  headed?: false,
  recordVideoPath?: "C:/Videos/clip.webm", // omit = no record
  profileId?: "prof_abc"
}
// → { sessionId: "sess_…", headed: false, recording: true, startUrl?: "…" }
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
      description: "Open Settings from the sidebar",
      startMs: 0,
      endMs: 600,
      selector: "nav >> text=Settings",
      speed: "fast" // fast (default) | slow | timed
    }
  ]
}
// → { commands: [{ index, description, action, startMs, endMs, ok, reason? }] }
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
      videoPath: "C:/Videos/clip.webm",
      narration: [{ startMs: 0, endMs: 5000, text: "Opening settings." }]
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
