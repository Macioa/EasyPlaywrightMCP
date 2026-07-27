import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NarrationCue } from "../types/schemas.js";
import { runFfmpeg } from "./convert.js";

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "%%")
    .replace(/\n/g, " ");
}

/** Package-root assets/fonts (readable even when OS font dirs are sandboxed). */
function bundledFontCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/compile → ../../assets/fonts
  const root = path.resolve(here, "..", "..");
  return [
    path.join(root, "assets", "fonts", "arial.ttf"),
    path.join(root, "assets", "fonts", "DejaVuSans.ttf"),
  ];
}

/** Absolute font path for ffmpeg drawtext (prefer bundled; Windows needs fontfile). */
export function resolveCaptionFontFile(): string | undefined {
  const system =
    process.platform === "win32"
      ? [
          path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "arial.ttf"),
          path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "segoeui.ttf"),
          path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "calibri.ttf"),
        ]
      : process.platform === "darwin"
        ? [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
          ]
        : [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
          ];
  return [...bundledFontCandidates(), ...system].find((p) => fs.existsSync(p));
}

function escapeFontFile(fontPath: string): string {
  // ffmpeg filter paths: escape \ and :
  return fontPath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/** Build ffmpeg drawtext filter chain for timestamped captions. */
export function captionsFilter(cues: NarrationCue[]): string {
  if (!cues.length) return "";
  const font = resolveCaptionFontFile();
  const fontOpt = font ? `fontfile='${escapeFontFile(font)}':` : "";
  return cues
    .map((c) => {
      const start = (c.startMs / 1000).toFixed(3);
      const end = (c.endMs / 1000).toFixed(3);
      const t = escapeDrawtext(c.text);
      return (
        `drawtext=${fontOpt}text='${t}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black@0.7:` +
        `x=80:y=h-120:enable='between(t\\,${start}\\,${end})'`
      );
    })
    .join(",");
}

export function burnCaptions(
  inPath: string,
  outPath: string,
  cues: NarrationCue[]
): void {
  const filt = captionsFilter(cues);
  if (!filt) {
    runFfmpeg(["-i", inPath, "-c", "copy", outPath]);
    return;
  }
  if (!resolveCaptionFontFile()) {
    throw new Error(
      "No caption font found. Add assets/fonts/arial.ttf or install a system TTF (Arial/DejaVu)."
    );
  }
  runFfmpeg([
    "-i",
    inPath,
    "-vf",
    filt,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}
