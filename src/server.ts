import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompileDemoInputSchema,
  LoginInputSchema,
  OrchestrateSessionInputSchema,
  SessionIdentitySchema,
  SetSessionAuthInputSchema,
  StartSessionInputSchema,
} from "./types/schemas.js";
import { handleLogin } from "./tools/login.js";
import { handleSetSessionAuth } from "./tools/setSessionAuth.js";
import { handleStartSession } from "./tools/startSession.js";
import { handleQuerySessions } from "./tools/querySessions.js";
import { handleQuerySession } from "./tools/querySession.js";
import { handleOrchestrateSession } from "./tools/orchestrate.js";
import { handleEndSession } from "./tools/endSession.js";
import { handleCompileDemo } from "./tools/compileDemo.js";
import { ensureDataDirs } from "./paths.js";

export const SERVER_INSTRUCTIONS = `EasyPlaywrightMCP — LLM-driven Playwright testing and demo videos.

## Workflow A — Automated testing
1. login — save auth profile (password, tokens, OAuth, or manual window)
   - Restricted auth (Google/OAuth bot-blocked): skip headed login; use set_session_auth instead (see Restricted auth below)
2. start_session — open a session (usually headed=false); pass profileId; do NOT set recordVideoPath
3. Loop: query_session → orchestrate_session until the task is done
4. end_session
5. Report a concise short answer to the user (pass/fail + key findings)

## Workflow B — Demo videos (server-paced narration)
1. login — save auth profile if the flow needs auth (or set_session_auth for restricted providers)
2. start_session with recordVideoPath (demoMode on by default; narrate:false for silent capture)
3. Loop: query_session → orchestrate_session
   - Put the spoken sentence in description (or narration). Server synthesizes TTS, acts, and holds until VO ends.
   - startMs/endMs are ignored for pacing while recording — use placeholders (0/1000).
   - Typing: fill=false. Prefer one clear beat per command.
4. end_session — finalizes WebM, trims idle head/tail, rewrites cues.json
5. compile_demo — pass videoPath only for clips (loads sibling .cues.json automatically). Optional slates for intros.
6. Do NOT hand-author clip narration timestamps when cues.json exists — the server wins.

## Restricted auth (Google / bot-blocked OAuth)
When automation cannot complete login (Google, Discord, similar), do NOT rely on headed login:
1. Give the user the app login/site URL and this console snippet (run on the **app** origin after they are logged in — not only the Google interstitial):
\`\`\`js
(() => {
  const ls = [], ss = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    ls.push({ name, value: localStorage.getItem(name) });
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const name = sessionStorage.key(i);
    ss.push({ name, value: sessionStorage.getItem(name) });
  }
  const cookies = document.cookie.split(";").map((c) => {
    const i = c.indexOf("=");
    const name = c.slice(0, i).trim();
    const value = c.slice(i + 1).trim();
    return { name, value, domain: location.hostname, path: "/" };
  }).filter((c) => c.name);
  return JSON.stringify({ origin: location.origin, url: location.href, cookies, localStorage: ls, sessionStorage: ss }, null, 2);
})()
\`\`\`
2. httpOnly caveat: document.cookie cannot read httpOnly cookies (e.g. Clerk __session). Ask the user to also copy those from DevTools → Application → Cookies as { name, value, domain, path, httpOnly, secure, sameSite } and merge into cookies[].
3. Call set_session_auth with the pasted JSON → profileId (optional sessionId to inject into a live session).
4. start_session({ profileId }) as usual.

## Testing vs demo timing
- Testing (no recordVideoPath): snappy startMs/endMs pacing; fill=true OK.
- Demo (recording): speech and UI are conjoined by the server; do not invent compile narration clocks.

Capture recipe: synthetic cursor + always-on click highlight, 1920×1080 deviceScaleFactor 2, WebM→H.264 60fps minterpolate, smooth rAF scroll.
Narration: Microsoft Edge neural TTS via edge-tts (default en-US-AndrewNeural +10%).

Type examples are in each tool description. Prefer selectors from query_session.interactive / ariaSnapshot.`;

export function createServer(): McpServer {
  ensureDataDirs();

  const server = new McpServer(
    {
      name: "EasyPlaywrightMCP",
      version: "1.0.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  server.tool(
    "login",
    `Orchestrate login and persist Playwright storageState.
Strategies: password form, HTTP Basic, bearer/token inject, OAuth cookies/tokens, manual/OAuth window, reuse profileId.
Auto (headless) when enough creds/tokens are provided; otherwise opens a headed window and waits.
For Google/bot-blocked OAuth, prefer set_session_auth (user's own browser + paste) instead of headed login.

Example input:
\`\`\`json
{
  "siteUrl": "https://app.example.com",
  "authUrl": "https://app.example.com/login",
  "username": "user@example.com",
  "password": "secret"
}
\`\`\`
Example success: { "ok": true, "profileId": "prof_abc", "strategy": "password" }`,
    LoginInputSchema.shape,
    async (args) => handleLogin(LoginInputSchema.parse(args))
  );

  server.tool(
    "set_session_auth",
    `Set Playwright auth from credentials the user extracted in their own browser (restricted Google/OAuth).
Instruct the user to open the app URL, log in, then run this console snippet on the **app** origin and paste the JSON:
\`\`\`js
(() => {
  const ls = [], ss = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    ls.push({ name, value: localStorage.getItem(name) });
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const name = sessionStorage.key(i);
    ss.push({ name, value: sessionStorage.getItem(name) });
  }
  const cookies = document.cookie.split(";").map((c) => {
    const i = c.indexOf("=");
    const name = c.slice(0, i).trim();
    const value = c.slice(i + 1).trim();
    return { name, value, domain: location.hostname, path: "/" };
  }).filter((c) => c.name);
  return JSON.stringify({ origin: location.origin, url: location.href, cookies, localStorage: ls, sessionStorage: ss }, null, 2);
})()
\`\`\`
httpOnly cookies (e.g. Clerk __session) are invisible to document.cookie — ask the user to merge DevTools Application → Cookies entries ({ name, value, domain, path, httpOnly, secure, sameSite }) into cookies[].
Also accepts Playwright storageState JSON. Always saves profileId; pass sessionId to inject into a live session.

Example:
\`\`\`json
{
  "siteUrl": "https://app.example.com/dashboard",
  "credentialsJson": "{\\"origin\\":\\"https://app.example.com\\",\\"cookies\\":[{\\"name\\":\\"session\\",\\"value\\":\\"abc\\",\\"domain\\":\\"app.example.com\\",\\"path\\":\\"/\\"}],\\"localStorage\\":[],\\"sessionStorage\\":[]}"
}
\`\`\`
Returns: { "ok": true, "profileId": "prof_…", "strategy": "restricted_auth" }`,
    SetSessionAuthInputSchema.shape,
    async (args) => handleSetSessionAuth(SetSessionAuthInputSchema.parse(args))
  );

  server.tool(
    "start_session",
    `Start a Playwright Chromium session (headless or windowed) and keep it open.
Optional recordVideoPath enables WebM capture at 1920×1080 @ deviceScaleFactor 2 with synthetic cursor and always-on click highlight.
When recording, demoMode is on (narrate defaults true): orchestrate auto-paces to TTS.
Pass profileId from login or set_session_auth to reuse auth.

Example:
\`\`\`json
{
  "startUrl": "https://app.example.com/dashboard",
  "headed": false,
  "recordVideoPath": "C:/Videos/demo-clip.webm",
  "profileId": "prof_abc"
}
\`\`\`
Returns: { "sessionId": "sess_…", "headed": false, "recording": true, "demoMode": true, "startUrl": "…" }`,
    StartSessionInputSchema.shape,
    async (args) => handleStartSession(StartSessionInputSchema.parse(args))
  );

  server.tool(
    "query_sessions",
    `List all active sessions with sessionId, url, title, recording, createdAt, headed.`,
    {},
    async () => handleQuerySessions()
  );

  server.tool(
    "query_session",
    `Fast page digest for LLM navigation decisions: url, title, viewport, ariaSnapshot, interactive controls.
Example: { "sessionId": "sess_01HXYZ" }`,
    SessionIdentitySchema.shape,
    async (args) => handleQuerySession(SessionIdentitySchema.parse(args))
  );

  server.tool(
    "orchestrate_session",
    `Execute ordered tap/cursor/keyboard actions.
Recording/demoMode: server synthesizes TTS from narration|description, runs the action, holds until VO ends.
startMs/endMs are ignored for pacing while recording (placeholders OK). fill=false for live typing.
Testing (no recording): startMs/endMs pace the batch; each call clock starts near 0.
Optional recordStepsPath writes an MD log. Recording also writes sibling .cues.json.

Example (demo):
\`\`\`json
{
  "sessionId": "sess_01HXYZ",
  "commands": [
    {
      "action": "click",
      "description": "Open Settings from the sidebar",
      "startMs": 0,
      "endMs": 1000,
      "selector": "nav >> text=Settings",
      "speed": "fast"
    },
    {
      "action": "type",
      "description": "Enter the billing search query",
      "narration": "Now we search for billing.",
      "startMs": 0,
      "endMs": 1000,
      "selector": "input[type=search]",
      "text": "billing",
      "fill": false
    }
  ]
}
\`\`\``,
    OrchestrateSessionInputSchema.shape,
    async (args) =>
      handleOrchestrateSession(OrchestrateSessionInputSchema.parse(args))
  );

  server.tool(
    "end_session",
    `End a session and finalize recorded video if any.
Recording sessions: trims idle head/tail using cues.json actionSpan, then returns videoPath.
Example: { "sessionId": "sess_01HXYZ" }
Returns: { "ok": true, "videoPath": "C:/Videos/demo-clip.webm" }`,
    SessionIdentitySchema.shape,
    async (args) => handleEndSession(SessionIdentitySchema.parse(args))
  );

  server.tool(
    "compile_demo",
    `Compile demo clips + slate segways into one narrated MP4.
Pipeline: convert (minterpolate 60fps H.264) → burn captions → VO → splice.
For recorded clips, pass videoPath only — loads sibling .cues.json (wins over hand-authored narration).
Slates still take explicit narration.

Example:
\`\`\`json
{
  "outputPath": "C:/Videos/final-demo.mp4",
  "fast": false,
  "content": [
    {
      "kind": "slate",
      "eyebrow": "INTRO",
      "heading": "Product Demo",
      "body": "A quick walkthrough",
      "durationMs": 3000,
      "narration": [{ "startMs": 0, "endMs": 2800, "text": "Welcome to the demo." }]
    },
    {
      "kind": "clip",
      "videoPath": "C:/Videos/demo-clip.webm"
    }
  ]
}
\`\`\``,
    CompileDemoInputSchema.shape,
    async (args) => handleCompileDemo(CompileDemoInputSchema.parse(args))
  );

  server.prompt(
    "workflows",
    "Intended EasyPlaywrightMCP workflows for automated testing and demo videos",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: SERVER_INSTRUCTIONS,
          },
        },
      ],
    })
  );

  return server;
}
