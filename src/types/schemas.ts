import { z } from "zod";

/** Example:
 * ```json
 * {
 *   "name": "session",
 *   "value": "abc",
 *   "domain": "app.example.com",
 *   "path": "/"
 * }
 * ```
 */
export const CookieSchema = z.object({
  name: z.string().describe("Cookie name"),
  value: z.string().describe("Cookie value"),
  domain: z.string().optional().describe("Cookie domain, e.g. app.example.com"),
  path: z.string().optional().describe("Cookie path, default /"),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});
export type CookieInput = z.infer<typeof CookieSchema>;

/** Example:
 * ```json
 * { "name": "access_token", "value": "eyJhbGciOi..." }
 * ```
 */
export const StorageEntrySchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type StorageEntry = z.infer<typeof StorageEntrySchema>;

/** Example:
 * ```json
 * {
 *   "accessToken": "eyJ...",
 *   "refreshToken": "def...",
 *   "idToken": "eyJ...",
 *   "cookies": [{ "name": "sid", "value": "x", "domain": "app.example.com" }],
 *   "localStorage": [{ "name": "token", "value": "eyJ..." }]
 * }
 * ```
 */
export const OAuthCredsSchema = z.object({
  accessToken: z.string().optional().describe("OAuth access token"),
  refreshToken: z.string().optional().describe("OAuth refresh token"),
  idToken: z.string().optional().describe("OIDC id token"),
  cookies: z.array(CookieSchema).optional().describe("Cookies to inject for OAuth session"),
  localStorage: z
    .array(StorageEntrySchema)
    .optional()
    .describe("localStorage entries to inject"),
  sessionStorage: z
    .array(StorageEntrySchema)
    .optional()
    .describe("sessionStorage entries to inject"),
});
export type OAuthCreds = z.infer<typeof OAuthCredsSchema>;

/** Example:
 * ```json
 * {
 *   "siteUrl": "https://app.example.com",
 *   "authUrl": "https://app.example.com/login",
 *   "username": "user@example.com",
 *   "password": "secret",
 *   "timeoutMs": 120000
 * }
 * ```
 */
export const LoginInputSchema = z.object({
  siteUrl: z.string().url().describe("Target application URL after login"),
  authUrl: z.string().url().describe("Login / OAuth start URL"),
  username: z.string().optional().describe("Username or email for password login"),
  password: z.string().optional().describe("Password for password login"),
  oauth: OAuthCredsSchema.optional().describe("OAuth tokens / cookies / storage to inject"),
  httpCredentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional()
    .describe("HTTP Basic auth credentials"),
  tokens: z
    .object({
      bearer: z.string().optional(),
      cookies: z.array(CookieSchema).optional(),
      localStorage: z.array(StorageEntrySchema).optional(),
      sessionStorage: z.array(StorageEntrySchema).optional(),
    })
    .optional()
    .describe("Generic bearer / cookie / storage tokens"),
  timeoutMs: z.coerce.number().optional().describe("Max wait ms (default 120000)"),
  profileId: z
    .string()
    .optional()
    .describe("Reuse an existing auth profile id instead of logging in again"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Example:
 * ```json
 * { "ok": true, "profileId": "prof_abc123", "strategy": "password" }
 * ```
 */
export const LoginResultSchema = z.object({
  ok: z.boolean(),
  profileId: z.string().optional(),
  strategy: z.string().optional(),
  reason: z.string().optional(),
});
export type LoginResult = z.infer<typeof LoginResultSchema>;

/** Example:
 * ```json
 * {
 *   "startUrl": "https://app.example.com/dashboard",
 *   "headed": false,
 *   "recordVideoPath": "C:/Videos/clip.webm",
 *   "profileId": "prof_abc123"
 * }
 * ```
 */
export const StartSessionInputSchema = z.object({
  startUrl: z.string().url().optional().describe("Optional URL to open first"),
  headed: z.boolean().optional().describe("Open a visible window (default false)"),
  recordVideoPath: z
    .string()
    .optional()
    .describe("If set, record WebM to this path; omit to skip recording"),
  narrate: z
    .boolean()
    .optional()
    .describe(
      "When recording, auto-pace actions to TTS (default true). Set false for silent recording."
    ),
  voice: z.string().optional().describe("edge-tts voice for demoMode (default en-US-AndrewNeural)"),
  rate: z.string().optional().describe("edge-tts rate for demoMode (default +10%)"),
  profileId: z.string().optional().describe("Auth profile from login"),
  storageStatePath: z
    .string()
    .optional()
    .describe("Optional path to a Playwright storageState JSON file"),
});
export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;

/** Example:
 * ```json
 * {
 *   "sessionId": "sess_01HXYZ",
 *   "headed": false,
 *   "recording": true,
 *   "demoMode": true,
 *   "startUrl": "https://app.example.com/dashboard"
 * }
 * ```
 */
export const StartSessionResultSchema = z.object({
  sessionId: z.string(),
  headed: z.boolean(),
  recording: z.boolean(),
  demoMode: z.boolean().optional(),
  startUrl: z.string().optional(),
});
export type StartSessionResult = z.infer<typeof StartSessionResultSchema>;

export const SessionIdentitySchema = z.object({
  sessionId: z.string().describe("Session id from start_session"),
});
export type SessionIdentity = z.infer<typeof SessionIdentitySchema>;

export const CursorSpeedSchema = z
  .enum(["fast", "slow", "timed"])
  .default("fast")
  .describe(
    "Cursor motion: fast (~8 steps, default), slow (~40), timed (steps from startMs/endMs, capped ~30)."
  );

/**
 * Example move:
 * ```json
 * { "action": "move", "description": "Move cursor to Save", "startMs": 0, "endMs": 400, "x": 100, "y": 200, "speed": "fast" }
 * ```
 * Example click:
 * ```json
 * { "action": "click", "description": "Click Save", "startMs": 400, "endMs": 700, "selector": "button:has-text('Save')", "speed": "fast" }
 * ```
 * Example type (demos: fill false for live keystrokes):
 * ```json
 * { "action": "type", "description": "Enter email", "startMs": 700, "endMs": 1200, "selector": "#email", "text": "a@b.com", "fill": false }
 * ```
 */
export const OrchestrateActionSchema = z.object({
  action: z.enum([
    "move",
    "click",
    "tap",
    "type",
    "press",
    "scroll",
    "wait",
    "navigate",
    "select",
    "hover",
  ]),
  description: z
    .string()
    .describe("App-perspective description, e.g. Open Settings from the sidebar"),
  startMs: z.coerce
    .number()
    .describe("Action start offset ms within THIS orchestrate_session call (start near 0)"),
  endMs: z.coerce
    .number()
    .describe("Action end offset ms within THIS orchestrate_session call"),
  speed: CursorSpeedSchema,
  x: z.coerce.number().optional().describe("Viewport X for move/click/tap/hover"),
  y: z.coerce.number().optional().describe("Viewport Y for move/click/tap/hover"),
  selector: z.string().optional().describe("CSS/text selector"),
  text: z.string().optional().describe("Text to type or option to select"),
  key: z.string().optional().describe("Key for press, e.g. Enter"),
  url: z.string().optional().describe("URL for navigate"),
  scrollY: z.coerce.number().optional().describe("Absolute scroll Y for scroll"),
  scrollMs: z.coerce.number().optional().describe("Scroll duration ms (default from end-start)"),
  fill: z
    .boolean()
    .optional()
    .describe(
      "If true, locator.fill (instant). For demos leave false/omit so pressSequentially(delay 8) shows live typing. Testing-only: true is fine."
    ),
  narration: z
    .string()
    .optional()
    .describe(
      "Spoken line for demoMode (default: description). Ignored when skipNarration is true."
    ),
  skipNarration: z
    .boolean()
    .optional()
    .describe("If true, do not synthesize VO for this beat in demoMode"),
});
export type OrchestrateAction = z.infer<typeof OrchestrateActionSchema>;

/** Example:
 * ```json
 * {
 *   "sessionId": "sess_01HXYZ",
 *   "commands": [
 *     { "action": "click", "description": "Open Settings", "startMs": 0, "endMs": 500, "selector": "nav >> text=Settings" }
 *   ],
 *   "recordStepsPath": "C:/Videos/steps.md"
 * }
 * ```
 */
export const OrchestrateSessionInputSchema = z.object({
  sessionId: z.string(),
  commands: z.array(OrchestrateActionSchema).min(1),
  recordStepsPath: z
    .string()
    .optional()
    .describe("If set, write markdown log of commands+results; omit to skip MD"),
});
export type OrchestrateSessionInput = z.infer<typeof OrchestrateSessionInputSchema>;

export const CommandResultSchema = z.object({
  index: z.number(),
  description: z.string(),
  action: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  ok: z.boolean(),
  reason: z.string().optional(),
  durationMs: z.number().optional(),
  /** Offset ms from recordingStartedAt when the action began (recording sessions). */
  videoStartMs: z.number().optional(),
  /** Offset ms from recordingStartedAt when the action (and VO hold) finished. */
  videoEndMs: z.number().optional(),
  narrationText: z.string().optional(),
  narrationStartMs: z.number().optional(),
  narrationEndMs: z.number().optional(),
  audioPath: z.string().optional(),
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

/** Example narration cue:
 * ```json
 * { "startMs": 0, "endMs": 3500, "text": "Here we open the dashboard." }
 * ```
 */
export const NarrationCueSchema = z.object({
  startMs: z.coerce.number(),
  endMs: z.coerce.number(),
  text: z.string(),
  audioPath: z
    .string()
    .optional()
    .describe("Optional pre-synthesized mp3/wav from demoMode orchestrate"),
});
export type NarrationCue = z.infer<typeof NarrationCueSchema>;

/**
 * Example clip:
 * ```json
 * {
 *   "kind": "clip",
 *   "videoPath": "C:/Videos/clip1.webm"
 * }
 * ```
 */
export const DemoClipSchema = z.object({
  kind: z.literal("clip"),
  videoPath: z.string(),
  narration: z.array(NarrationCueSchema).default([]),
  cuesPath: z
    .string()
    .optional()
    .describe("Optional path to .cues.json (default: beside videoPath)"),
  preferCuesFile: z
    .boolean()
    .optional()
    .describe(
      "When true (default), load cues.json and ignore hand-authored narration"
    ),
});
export type DemoClip = z.infer<typeof DemoClipSchema>;

export const DemoSlateSchema = z.object({
  kind: z.literal("slate"),
  eyebrow: z.string().optional(),
  heading: z.string(),
  body: z.string().optional(),
  footer: z.string().optional(),
  durationMs: z.coerce.number().default(3000),
  narration: z.array(NarrationCueSchema).optional(),
});
export type DemoSlate = z.infer<typeof DemoSlateSchema>;

export const DemoContentItemSchema = z.discriminatedUnion("kind", [
  DemoClipSchema,
  DemoSlateSchema,
]);
export type DemoContentItem = z.infer<typeof DemoContentItemSchema>;

/** Example:
 * ```json
 * {
 *   "content": [
 *     { "kind": "slate", "heading": "Demo", "durationMs": 2500,
 *       "narration": [{ "startMs": 0, "endMs": 2400, "text": "Welcome." }] },
 *     { "kind": "clip", "videoPath": "C:/Videos/a.webm",
 *       "narration": [{ "startMs": 0, "endMs": 5000, "text": "Opening settings." }] }
 *   ],
 *   "outputPath": "C:/Videos/final-demo.mp4",
 *   "fast": false
 * }
 * ```
 */
export const CompileDemoInputSchema = z.object({
  content: z.array(DemoContentItemSchema).min(1),
  outputPath: z.string().describe("Final MP4 output path"),
  fast: z
    .boolean()
    .optional()
    .describe("Skip minterpolate for quick validation encode (default false)"),
  voice: z.string().optional().describe("edge-tts voice (default en-US-AndrewNeural)"),
  rate: z.string().optional().describe("edge-tts rate (default +10%)"),
});
export type CompileDemoInput = z.infer<typeof CompileDemoInputSchema>;

export const CompileDemoResultSchema = z.object({
  ok: z.boolean(),
  outputPath: z.string().optional(),
  reason: z.string().optional(),
});
export type CompileDemoResult = z.infer<typeof CompileDemoResultSchema>;

export const OkResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  videoPath: z.string().optional(),
});
export type OkResult = z.infer<typeof OkResultSchema>;

/** Example:
 * ```json
 * {
 *   "siteUrl": "https://app.example.com/dashboard",
 *   "credentialsJson": "{\"origin\":\"https://app.example.com\",\"cookies\":[{\"name\":\"session\",\"value\":\"abc\",\"domain\":\"app.example.com\",\"path\":\"/\"}],\"localStorage\":[],\"sessionStorage\":[]}",
 *   "sessionId": "sess_01HXYZ"
 * }
 * ```
 */
export const SetSessionAuthInputSchema = z.object({
  siteUrl: z.string().url().describe("Target application URL (inject / navigate origin)"),
  credentialsJson: z
    .string()
    .describe(
      "JSON paste from the browser snippet (cookies/localStorage/sessionStorage) or Playwright storageState"
    ),
  sessionId: z
    .string()
    .optional()
    .describe("If set, also inject credentials into this live session"),
  authUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional auth URL for profile meta (defaults to siteUrl)"),
});
export type SetSessionAuthInput = z.infer<typeof SetSessionAuthInputSchema>;

/** Example:
 * ```json
 * { "ok": true, "profileId": "prof_abc", "sessionId": "sess_01HXYZ", "strategy": "restricted_auth" }
 * ```
 */
export const SetSessionAuthResultSchema = z.object({
  ok: z.boolean(),
  profileId: z.string().optional(),
  sessionId: z.string().optional(),
  strategy: z.string().optional(),
  reason: z.string().optional(),
});
export type SetSessionAuthResult = z.infer<typeof SetSessionAuthResultSchema>;
