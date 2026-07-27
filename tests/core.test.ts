import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, afterEach } from "vitest";
import {
  CompileDemoInputSchema,
  LoginInputSchema,
  OrchestrateActionSchema,
  OrchestrateSessionInputSchema,
  StartSessionInputSchema,
} from "../src/types/schemas.js";
import { canAutoLogin, chooseStrategy, login } from "../src/auth/login.js";
import { sessionManager } from "../src/session/manager.js";
import { orchestrateSession, stepsFor } from "../src/session/orchestrate.js";
import { formatStepsMarkdown } from "../src/session/orchestrate.js";
import { convertVf, convertArgs } from "../src/compile/convert.js";
import { captionsFilter } from "../src/compile/captions.js";
import { slateHtml } from "../src/compile/slate.js";
import { SERVER_INSTRUCTIONS } from "../src/server.js";
import { sleep } from "../src/util/sleep.js";
import { setSynthesizeNarrationForTests } from "../src/compile/tts.js";
import { cuesPathFor, readCuesFile } from "../src/session/cues.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function startFixtureServer(handler: (url: string, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    handler(req.url ?? "/", req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

afterEach(async () => {
  await sessionManager.endAll();
  setSynthesizeNarrationForTests(null);
});

describe("Zod schemas", () => {
  it("parses login example", () => {
    const parsed = LoginInputSchema.parse({
      siteUrl: "https://app.example.com",
      authUrl: "https://app.example.com/login",
      username: "user@example.com",
      password: "secret",
    });
    expect(parsed.username).toBe("user@example.com");
  });

  it("coerces numeric orchestration fields", () => {
    const a = OrchestrateActionSchema.parse({
      action: "click",
      description: "Open Settings",
      startMs: "0",
      endMs: "500",
      selector: "#x",
    });
    expect(a.startMs).toBe(0);
    expect(a.endMs).toBe(500);
  });

  it("defaults speed to fast when omitted", () => {
    const a = OrchestrateActionSchema.parse({
      action: "click",
      description: "Open",
      startMs: 0,
      endMs: 400,
      selector: "#x",
    });
    expect(a.speed).toBe("fast");
  });

  it("parses compile demo content union", () => {
    const parsed = CompileDemoInputSchema.parse({
      outputPath: "C:/Videos/out.mp4",
      content: [
        {
          kind: "slate",
          heading: "Hello",
          durationMs: "2500",
          narration: [{ startMs: 0, endMs: 2000, text: "Hi" }],
        },
        {
          kind: "clip",
          videoPath: "C:/Videos/a.webm",
          narration: [{ startMs: 0, endMs: 1000, text: "Clip" }],
        },
      ],
    });
    expect(parsed.content).toHaveLength(2);
    expect(parsed.content[0]?.kind).toBe("slate");
  });

  it("parses start_session and orchestrate examples", () => {
    StartSessionInputSchema.parse({
      startUrl: "https://app.example.com",
      headed: false,
    });
    OrchestrateSessionInputSchema.parse({
      sessionId: "sess_x",
      commands: [
        {
          action: "wait",
          description: "Pause",
          startMs: 0,
          endMs: 100,
        },
      ],
    });
  });
});

describe("login strategies", () => {
  it("chooses strategy from params", () => {
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
        profileId: "p1",
      })
    ).toBe("reuse_profile");
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
        httpCredentials: { username: "u", password: "p" },
      })
    ).toBe("http_basic");
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
        oauth: { accessToken: "t" },
      })
    ).toBe("oauth_tokens");
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
        tokens: { bearer: "t" },
      })
    ).toBe("token_inject");
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
        username: "u",
        password: "p",
      })
    ).toBe("password");
    expect(
      chooseStrategy({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
      })
    ).toBe("manual");
    expect(
      canAutoLogin({
        siteUrl: "https://a.com",
        authUrl: "https://a.com/login",
      })
    ).toBe(false);
  });

  it("password form login", async () => {
    const fx = await startFixtureServer((url, _req, res) => {
      if (url.startsWith("/login")) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body>
          <form method="GET" action="/app">
            <input type="email" name="email" />
            <input type="password" name="password" />
            <button type="submit">Log in</button>
          </form>
        </body></html>`);
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html",
        "set-cookie": "session=ok; Path=/",
      });
      res.end(`<!doctype html><html><body><h1>App</h1><script>localStorage.setItem('token','x')</script></body></html>`);
    });
    try {
      const result = await login({
        siteUrl: `${fx.baseUrl}/app`,
        authUrl: `${fx.baseUrl}/login`,
        username: "a@b.com",
        password: "secret",
        timeoutMs: 30_000,
      });
      expect(result.ok).toBe(true);
      expect(result.strategy).toBe("password");
      expect(result.profileId).toMatch(/^prof_/);
    } finally {
      await fx.close();
    }
  });

  it("token inject login", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><h1 id="t"></h1>
        <script>document.getElementById('t').textContent=localStorage.getItem('token')||''</script>
      </body></html>`);
    });
    try {
      const result = await login({
        siteUrl: fx.baseUrl,
        authUrl: fx.baseUrl,
        tokens: {
          bearer: "tok_abc",
          localStorage: [{ name: "token", value: "tok_abc" }],
        },
      });
      expect(result.ok).toBe(true);
      expect(result.strategy).toBe("token_inject");
    } finally {
      await fx.close();
    }
  });

  it("http basic login", async () => {
    const fx = await startFixtureServer((_url, req, res) => {
      const auth = req.headers.authorization ?? "";
      if (auth.startsWith("Basic ")) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>ok</body></html>");
      } else {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="t"' });
        res.end("auth");
      }
    });
    try {
      const result = await login({
        siteUrl: fx.baseUrl,
        authUrl: fx.baseUrl,
        httpCredentials: { username: "u", password: "p" },
      });
      expect(result.ok).toBe(true);
      expect(result.strategy).toBe("http_basic");
    } finally {
      await fx.close();
    }
  });

  it("oauth cookies login", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>dash</body></html>");
    });
    try {
      const host = new URL(fx.baseUrl).hostname;
      const result = await login({
        siteUrl: fx.baseUrl,
        authUrl: `${fx.baseUrl}/oauth`,
        oauth: {
          accessToken: "at_1",
          cookies: [{ name: "sid", value: "1", domain: host, path: "/" }],
        },
      });
      expect(result.ok).toBe(true);
      expect(result.strategy).toBe("oauth_tokens");
    } finally {
      await fx.close();
    }
  });

  it("manual login times out without user", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>login forever</body></html>");
    });
    try {
      const result = await login({
        siteUrl: `${fx.baseUrl}/app`,
        authUrl: `${fx.baseUrl}/login`,
        timeoutMs: 2000,
      });
      expect(result.ok).toBe(false);
      expect(result.strategy).toBe("manual");
      expect(result.reason).toMatch(/timed out/i);
    } finally {
      await fx.close();
    }
  }, 90_000);

  it("reuses saved profile", async () => {
    const fx = await startFixtureServer((url, _req, res) => {
      if (url.startsWith("/login")) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body>
          <form method="GET" action="/app">
            <input type="email" name="email" />
            <input type="password" name="password" />
            <button type="submit">Log in</button>
          </form>
        </body></html>`);
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html",
        "set-cookie": "session=ok; Path=/",
      });
      res.end(`<!doctype html><html><body><h1>App</h1><script>localStorage.setItem('token','x')</script></body></html>`);
    });
    try {
      const first = await login({
        siteUrl: `${fx.baseUrl}/app`,
        authUrl: `${fx.baseUrl}/login`,
        username: "a@b.com",
        password: "secret",
      });
      expect(first.ok).toBe(true);
      const second = await login({
        siteUrl: `${fx.baseUrl}/app`,
        authUrl: `${fx.baseUrl}/login`,
        profileId: first.profileId,
      });
      expect(second.ok).toBe(true);
      expect(second.strategy).toBe("reuse_profile");
      expect(second.profileId).toBe(first.profileId);
    } finally {
      await fx.close();
    }
  });
});

describe("session lifecycle + orchestrate", () => {
  it("start, query, orchestrate, end", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body style="height:2000px">
        <button id="go">Go</button>
        <input id="q" />
        <div id="out"></div>
        <script>
          document.getElementById('go').onclick=()=>{document.getElementById('out').textContent='clicked'};
        </script>
      </body></html>`);
    });
    try {
      const started = await sessionManager.start({
        startUrl: fx.baseUrl,
        headed: false,
      });
      expect(started.sessionId).toMatch(/^sess_/);
      const sessions = await sessionManager.listDetailed();
      expect(sessions.some((s) => s.sessionId === started.sessionId)).toBe(true);

      const session = sessionManager.get(started.sessionId);
      const tmpMd = path.join(os.tmpdir(), `epm-steps-${Date.now()}.md`);
      const results = await orchestrateSession(session, {
        sessionId: started.sessionId,
        recordStepsPath: tmpMd,
        commands: [
          {
            action: "click",
            description: "Click Go",
            startMs: 0,
            endMs: 200,
            selector: "#go",
            speed: "fast",
          },
          {
            action: "type",
            description: "Type query",
            startMs: 200,
            endMs: 500,
            selector: "#q",
            text: "hello",
            fill: true,
          },
        ],
      });
      expect(results.every((r) => r.ok)).toBe(true);
      expect(fs.existsSync(tmpMd)).toBe(true);
      const md = formatStepsMarkdown(started.sessionId, results);
      expect(md).toContain("Click Go");

      const ended = await sessionManager.end(started.sessionId);
      expect(ended.ok).toBe(true);
      fs.unlinkSync(tmpMd);
    } finally {
      await fx.close();
    }
  });

  it("normalizes timeline so large first startMs does not sleep ~12s", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><button id="go">Go</button></body></html>`);
    });
    try {
      const started = await sessionManager.start({
        startUrl: fx.baseUrl,
        headed: false,
      });
      const session = sessionManager.get(started.sessionId);
      const t0 = Date.now();
      const results = await orchestrateSession(session, {
        sessionId: started.sessionId,
        commands: [
          {
            action: "click",
            description: "Click Go late timeline",
            startMs: 12300,
            endMs: 13000,
            selector: "#go",
            speed: "fast",
          },
          {
            action: "wait",
            description: "Short dwell",
            startMs: 13100,
            endMs: 13400,
          },
        ],
      });
      const wall = Date.now() - t0;
      expect(results.every((r) => r.ok)).toBe(true);
      expect(results[0]?.startMs).toBe(12300); // original times preserved in log
      expect(wall).toBeLessThan(5000); // must not wait ~12.3s
      await sessionManager.end(started.sessionId);
    } finally {
      await fx.close();
    }
  });

  it("recording sessions stamp video timestamps and write cues.json", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><button id="go">Go</button></body></html>`);
    });
    const videoPath = path.join(os.tmpdir(), `epm-rec-${Date.now()}.webm`);
    const cuesPath = videoPath.replace(/\.webm$/i, "") + ".cues.json";
    try {
      const started = await sessionManager.start({
        startUrl: fx.baseUrl,
        headed: false,
        recordVideoPath: videoPath,
        narrate: false,
      });
      expect(started.demoMode).toBe(false);
      expect(started.recording).toBe(true);
      const session = sessionManager.get(started.sessionId);
      expect(session.recordingStartedAt).toBeTypeOf("number");
      expect(session.demoMode).toBe(false);

      await sleep(80);
      const results = await orchestrateSession(session, {
        sessionId: started.sessionId,
        commands: [
          {
            action: "click",
            description: "Click Go",
            startMs: 0,
            endMs: 200,
            selector: "#go",
            speed: "fast",
          },
          {
            action: "wait",
            description: "Brief dwell",
            startMs: 200,
            endMs: 350,
          },
        ],
      });
      expect(results.every((r) => r.ok)).toBe(true);
      expect(results.every((r) => typeof r.videoStartMs === "number")).toBe(true);
      expect(results.every((r) => typeof r.videoEndMs === "number")).toBe(true);
      expect(results[0]!.videoStartMs!).toBeGreaterThanOrEqual(0);
      expect(results[1]!.videoStartMs!).toBeGreaterThanOrEqual(results[0]!.videoStartMs!);
      expect(results[1]!.videoEndMs!).toBeGreaterThanOrEqual(results[1]!.videoStartMs!);
      expect(fs.existsSync(cuesPath)).toBe(true);
      const cues = JSON.parse(fs.readFileSync(cuesPath, "utf8"));
      expect(cues.cues).toHaveLength(2);
      expect(cues.actionSpan.startMs).toBeLessThanOrEqual(cues.actionSpan.endMs);
      expect(cues.cues[0].text).toBe("Click Go");

      const ended = await sessionManager.end(started.sessionId);
      expect(ended.ok).toBe(true);
    } finally {
      await fx.close();
      for (const p of [videoPath, cuesPath]) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("demoMode paces action span to mocked TTS duration", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><button id="go">Go</button></body></html>`);
    });
    const videoPath = path.join(os.tmpdir(), `epm-demo-${Date.now()}.webm`);
    const fakeMp3 = path.join(os.tmpdir(), `epm-fake-${Date.now()}.mp3`);
    fs.writeFileSync(fakeMp3, Buffer.from([0]));
    setSynthesizeNarrationForTests(async ({ index }) => ({
      audioPath: fakeMp3,
      durationMs: 800,
    }));
    try {
      const started = await sessionManager.start({
        startUrl: fx.baseUrl,
        headed: false,
        recordVideoPath: videoPath,
      });
      expect(started.demoMode).toBe(true);
      const session = sessionManager.get(started.sessionId);
      const t0 = Date.now();
      const results = await orchestrateSession(session, {
        sessionId: started.sessionId,
        commands: [
          {
            action: "click",
            description: "Click the Go button now",
            startMs: 0,
            endMs: 100,
            selector: "#go",
            speed: "fast",
          },
        ],
      });
      const wall = Date.now() - t0;
      expect(results[0]?.ok).toBe(true);
      expect(results[0]?.audioPath).toBe(fakeMp3);
      expect(results[0]!.durationMs!).toBeGreaterThanOrEqual(800);
      expect(wall).toBeGreaterThanOrEqual(800);
      // Snappy startMs/endMs must not win over VO hold
      expect(wall).toBeGreaterThan(400);
      const cues = readCuesFile(videoPath);
      expect(cues?.cues[0]?.audioPath).toBe(fakeMp3);
      expect(cues?.cues[0]?.endMs! - cues!.cues[0]!.startMs).toBe(800);
      await sessionManager.end(started.sessionId);
    } finally {
      await fx.close();
      for (const p of [videoPath, cuesPathFor(videoPath), fakeMp3]) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("non-recording sessions still honor startMs sleeps", async () => {
    const fx = await startFixtureServer((_url, _req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><button id="go">Go</button></body></html>`);
    });
    try {
      const started = await sessionManager.start({
        startUrl: fx.baseUrl,
        headed: false,
      });
      expect(started.demoMode).toBeFalsy();
      const session = sessionManager.get(started.sessionId);
      const t0 = Date.now();
      await orchestrateSession(session, {
        sessionId: started.sessionId,
        commands: [
          {
            action: "wait",
            description: "dwell",
            startMs: 0,
            endMs: 50,
          },
          {
            action: "click",
            description: "Click",
            startMs: 400,
            endMs: 500,
            selector: "#go",
            speed: "fast",
          },
        ],
      });
      expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
      await sessionManager.end(started.sessionId);
    } finally {
      await fx.close();
    }
  });
});

describe("cursor steps + demo instructions", () => {
  it("defaults omitted speed to fast step count", () => {
    expect(
      stepsFor({
        action: "move",
        description: "m",
        startMs: 0,
        endMs: 1000,
        x: 1,
        y: 1,
      })
    ).toBe(8);
  });

  it("caps timed steps at 30 for long windows", () => {
    expect(
      stepsFor({
        action: "move",
        description: "m",
        startMs: 0,
        endMs: 2000,
        speed: "timed",
        x: 1,
        y: 1,
      })
    ).toBe(30);
    expect(
      stepsFor({
        action: "click",
        description: "c",
        startMs: 0,
        endMs: 480,
        speed: "timed",
      })
    ).toBe(30); // 480/16 = 30
    expect(
      stepsFor({
        action: "click",
        description: "c",
        startMs: 0,
        endMs: 160,
        speed: "timed",
      })
    ).toBe(10); // 160/16 = 10, above min 8
  });

  it("SERVER_INSTRUCTIONS include demo interaction style", () => {
    expect(SERVER_INSTRUCTIONS).toContain("Demo interaction style");
    expect(SERVER_INSTRUCTIONS).toContain("fill=false");
    expect(SERVER_INSTRUCTIONS).toContain('speed "fast"');
  });
});

describe("compile helpers", () => {
  it("builds convert vf and args", () => {
    expect(convertVf(true)).toContain("fps=60");
    expect(convertVf(false)).toContain("minterpolate");
    const args = convertArgs("in.webm", "out.mp4", true);
    expect(args).toContain("libx264");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("builds caption filter and slate html", () => {
    const f = captionsFilter([
      { startMs: 0, endMs: 1000, text: "Hello: world" },
    ]);
    expect(f).toContain("drawtext");
    expect(f).toContain("Hello");
    expect(f).toContain("fontfile=");
    const html = slateHtml({
      eyebrow: "INTRO",
      heading: "Demo",
      body: "Body",
      footer: "Footer",
    });
    expect(html).toContain("Demo");
    expect(html).toContain("INTRO");
  });
});
