import fs from "node:fs";
import path from "node:path";
import type { DemoCuesFile } from "../session/cues.js";
import { writeCuesFile } from "../session/cues.js";
import { runFfmpeg, runFfprobeDuration } from "./convert.js";

export const TRIM_PAD_START_MS = 250;
export const TRIM_PAD_END_MS = 400;

export function computeTrimWindow(
  actionSpan: { startMs: number; endMs: number },
  videoDurationMs: number
): { startMs: number; endMs: number } {
  if (actionSpan.endMs <= actionSpan.startMs) {
    return { startMs: 0, endMs: videoDurationMs };
  }
  const startMs = Math.max(0, actionSpan.startMs - TRIM_PAD_START_MS);
  const endMs = Math.min(
    videoDurationMs,
    Math.max(startMs + 100, actionSpan.endMs + TRIM_PAD_END_MS)
  );
  return { startMs, endMs };
}

export function shiftCuesFile(
  file: DemoCuesFile,
  trimStartMs: number
): DemoCuesFile {
  return {
    ...file,
    cues: file.cues.map((c) => ({
      ...c,
      startMs: Math.max(0, c.startMs - trimStartMs),
      endMs: Math.max(0, c.endMs - trimStartMs),
    })),
    actionSpan: {
      startMs: Math.max(0, file.actionSpan.startMs - trimStartMs),
      endMs: Math.max(0, file.actionSpan.endMs - trimStartMs),
    },
  };
}

/** Trim video in place (via temp file) and rewrite cues timestamps. */
export function trimVideoToActionSpan(
  videoPath: string,
  cues: DemoCuesFile
): DemoCuesFile {
  const durSec = runFfprobeDuration(videoPath);
  const videoDurationMs = Math.round(durSec * 1000);
  const win = computeTrimWindow(cues.actionSpan, videoDurationMs);
  if (win.startMs <= 0 && win.endMs >= videoDurationMs - 50) {
    return cues;
  }

  const tmp = path.join(
    path.dirname(videoPath),
    `.trim-${path.basename(videoPath)}`
  );
  const startSec = (win.startMs / 1000).toFixed(3);
  const takeSec = ((win.endMs - win.startMs) / 1000).toFixed(3);
  try {
    runFfmpeg([
      "-ss",
      startSec,
      "-i",
      videoPath,
      "-t",
      takeSec,
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      tmp,
    ]);
  } catch {
    runFfmpeg([
      "-ss",
      startSec,
      "-i",
      videoPath,
      "-t",
      takeSec,
      "-c:v",
      "libvpx",
      "-b:v",
      "2M",
      "-c:a",
      "libopus",
      tmp,
    ]);
  }
  fs.renameSync(tmp, videoPath);
  const shifted = shiftCuesFile(cues, win.startMs);
  writeCuesFile(shifted);
  return shifted;
}
