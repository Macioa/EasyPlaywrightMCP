import {
  installHint,
  resolveCaptionFont,
} from "../platform/tools.js";
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

/** Absolute font path for ffmpeg drawtext (prefer bundled; Windows needs fontfile). */
export function resolveCaptionFontFile(): string | undefined {
  return resolveCaptionFont();
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
    throw new Error(`No caption font found. ${installHint("caption-font")}`);
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
