/**
 * Platform tool registry — resolve OS-specific binaries and install hints.
 *
 * Closed set of logical IDs (add more by extending PlatformToolId + PLATFORM_TOOLS
 * and the matching row in docs/platform-tools.md).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PlatformId = "win32" | "darwin" | "linux";

/** Logical tool IDs currently supported. */
export type PlatformToolId =
  | "ffmpeg"
  | "ffprobe"
  | "python"
  | "edge-tts"
  | "caption-font";

export type BinaryToolId = "ffmpeg" | "ffprobe";

export interface ResolvedBinary {
  command: string;
}

export interface ResolvedEdgeTts {
  python: string;
  /** Args before user flags: ["-m", "edge_tts"] */
  moduleArgs: string[];
}

interface BinarySpec {
  /** PATH command names to try, in order. */
  candidates: string[];
  /** Args used to probe availability (status 0 = present). */
  probeArgs: string[];
  installHint: string;
}

interface PythonSpec {
  candidates: string[];
  installHint: string;
}

interface EdgeTtsSpec {
  /** pip install line; `{python}` replaced with resolved interpreter. */
  installHintTemplate: string;
}

type PlatformTools = {
  ffmpeg: BinarySpec;
  ffprobe: BinarySpec;
  python: PythonSpec;
  "edge-tts": EdgeTtsSpec;
  "caption-font": { systemCandidates: string[] };
};

const WIN_FONTS = process.env.WINDIR ?? "C:\\Windows";

/** Per-OS specs for the closed tool set. */
export const PLATFORM_TOOLS: Record<PlatformId, PlatformTools> = {
  win32: {
    ffmpeg: {
      candidates: ["ffmpeg"],
      probeArgs: ["-version"],
      installHint: "winget install Gyan.FFmpeg",
    },
    ffprobe: {
      candidates: ["ffprobe"],
      probeArgs: ["-version"],
      installHint: "winget install Gyan.FFmpeg",
    },
    python: {
      candidates: ["python", "py", "python3"],
      installHint: "Install Python 3 from https://www.python.org/downloads/ or winget install Python.Python.3.12",
    },
    "edge-tts": {
      installHintTemplate: "{python} -m pip install edge-tts",
    },
    "caption-font": {
      systemCandidates: [
        path.join(WIN_FONTS, "Fonts", "arial.ttf"),
        path.join(WIN_FONTS, "Fonts", "segoeui.ttf"),
        path.join(WIN_FONTS, "Fonts", "calibri.ttf"),
      ],
    },
  },
  darwin: {
    ffmpeg: {
      candidates: ["ffmpeg"],
      probeArgs: ["-version"],
      installHint: "brew install ffmpeg",
    },
    ffprobe: {
      candidates: ["ffprobe"],
      probeArgs: ["-version"],
      installHint: "brew install ffmpeg",
    },
    python: {
      candidates: ["python3", "python"],
      installHint: "brew install python",
    },
    "edge-tts": {
      installHintTemplate: "{python} -m pip install edge-tts",
    },
    "caption-font": {
      systemCandidates: [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
      ],
    },
  },
  linux: {
    ffmpeg: {
      candidates: ["ffmpeg"],
      probeArgs: ["-version"],
      installHint: "sudo apt install ffmpeg",
    },
    ffprobe: {
      candidates: ["ffprobe"],
      probeArgs: ["-version"],
      installHint: "sudo apt install ffmpeg",
    },
    python: {
      candidates: ["python3", "python"],
      installHint: "sudo apt install python3",
    },
    "edge-tts": {
      installHintTemplate: "{python} -m pip install edge-tts",
    },
    "caption-font": {
      systemCandidates: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
      ],
    },
  },
};

export function currentPlatform(): PlatformId {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  return "linux";
}

function toolsFor(platform: PlatformId = currentPlatform()): PlatformTools {
  return PLATFORM_TOOLS[platform];
}

function probeCommand(command: string, probeArgs: string[]): boolean {
  const r = spawnSync(command, probeArgs, { encoding: "utf8" });
  return r.status === 0;
}

/** First working PATH binary for ffmpeg/ffprobe, or null. */
export function resolveBinary(
  id: BinaryToolId,
  platform: PlatformId = currentPlatform()
): ResolvedBinary | null {
  const spec = toolsFor(platform)[id];
  for (const command of spec.candidates) {
    if (probeCommand(command, spec.probeArgs)) {
      return { command };
    }
  }
  return null;
}

/** First working Python interpreter, or null. */
export function resolvePython(
  platform: PlatformId = currentPlatform()
): string | null {
  const spec = toolsFor(platform).python;
  for (const command of spec.candidates) {
    if (probeCommand(command, ["--version"])) {
      return command;
    }
  }
  return null;
}

/** Python + edge_tts module when available. */
export function resolveEdgeTts(
  platform: PlatformId = currentPlatform()
): ResolvedEdgeTts | null {
  const python = resolvePython(platform);
  if (!python) return null;
  const moduleArgs = ["-m", "edge_tts"];
  if (!probeCommand(python, [...moduleArgs, "--help"])) {
    return null;
  }
  return { python, moduleArgs };
}

/** Package-root assets/fonts (readable even when OS font dirs are sandboxed). */
function bundledFontCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/platform → ../../assets/fonts
  const root = path.resolve(here, "..", "..");
  return [
    path.join(root, "assets", "fonts", "arial.ttf"),
    path.join(root, "assets", "fonts", "DejaVuSans.ttf"),
  ];
}

/** Absolute font path for ffmpeg drawtext (prefer bundled). */
export function resolveCaptionFont(
  platform: PlatformId = currentPlatform()
): string | undefined {
  const system = toolsFor(platform)["caption-font"].systemCandidates;
  return [...bundledFontCandidates(), ...system].find((p) => fs.existsSync(p));
}

/**
 * Platform-specific install advice for a logical tool.
 * For edge-tts, substitutes the resolved (or primary) python binary.
 */
export function installHint(
  id: PlatformToolId,
  platform: PlatformId = currentPlatform()
): string {
  const t = toolsFor(platform);
  if (id === "ffmpeg" || id === "ffprobe") {
    return t[id].installHint;
  }
  if (id === "python") {
    return t.python.installHint;
  }
  if (id === "edge-tts") {
    const py =
      resolvePython(platform) ?? t.python.candidates[0] ?? "python";
    return t["edge-tts"].installHintTemplate.replaceAll("{python}", py);
  }
  return "Add assets/fonts/arial.ttf or install a system TTF (Arial/DejaVu).";
}
