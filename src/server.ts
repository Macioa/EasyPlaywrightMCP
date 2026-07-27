import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompileDemoInputSchema,
  LoginInputSchema,
  OrchestrateSessionInputSchema,
  SessionIdentitySchema,
  StartSessionInputSchema,
} from "./types/schemas.js";
import { handleLogin } from "./tools/login.js";
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
2. start_session — open a session (usually headed=false); pass profileId
3. Loop: query_session → orchestrate_session until the task is done
4. end_session
5. Report a concise short answer to the user (pass/fail + key findings)

## Workflow B — Demo videos
1. login — save auth profile if the flow needs auth
2. start_session with recordVideoPath set (1920×1080 @ dsf 2, synthetic cursor)
3. Loop: query_session → orchestrate_session with recordStepsPath (MD log)
4. end_session for every active session (finalize WebM)
5. Review MD orchestration logs
6. compile_demo — narrated H.264 MP4 (edge-tts + minterpolate splice)

Capture recipe: synthetic cursor, 1920×1080 deviceScaleFactor 2, WebM→H.264 60fps minterpolate, smooth rAF scroll.
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
    "start_session",
    `Start a Playwright Chromium session (headless or windowed) and keep it open.
Optional recordVideoPath enables WebM capture at 1920×1080 @ deviceScaleFactor 2 with synthetic cursor.
Pass profileId from login to reuse auth.

Example:
\`\`\`json
{
  "startUrl": "https://app.example.com/dashboard",
  "headed": false,
  "recordVideoPath": "C:/Videos/demo-clip.webm",
  "profileId": "prof_abc"
}
\`\`\`
Returns: { "sessionId": "sess_…", "headed": false, "recording": true, "startUrl": "…" }`,
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
    `Execute ordered tap/cursor/keyboard actions with timed cursor motion.
Each command needs description (app perspective), startMs, endMs.
Optional recordStepsPath writes an MD log of commands + results.

Example:
\`\`\`json
{
  "sessionId": "sess_01HXYZ",
  "recordStepsPath": "C:/Videos/steps.md",
  "commands": [
    {
      "action": "click",
      "description": "Open Settings from the sidebar",
      "startMs": 0,
      "endMs": 600,
      "selector": "nav >> text=Settings",
      "speed": "timed"
    },
    {
      "action": "type",
      "description": "Enter search query",
      "startMs": 700,
      "endMs": 1400,
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
Example: { "sessionId": "sess_01HXYZ" }
Returns: { "ok": true, "videoPath": "C:/Videos/demo-clip.webm" }`,
    SessionIdentitySchema.shape,
    async (args) => handleEndSession(SessionIdentitySchema.parse(args))
  );

  server.tool(
    "compile_demo",
    `Compile demo clips + slate segways into one narrated MP4.
Pipeline: convert (minterpolate 60fps H.264) → burn timestamped captions → edge-tts VO → splice.
Content items are kind=clip (videoPath + narration cues) or kind=slate (PowerPoint-style intro).

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
      "videoPath": "C:/Videos/demo-clip.webm",
      "narration": [{ "startMs": 0, "endMs": 5000, "text": "Opening settings." }]
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
