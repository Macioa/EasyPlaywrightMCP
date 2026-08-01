import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { installHint, resolveEdgeTts } from "../platform/tools.js";
import type { NarrationCue } from "../types/schemas.js";
import { runFfmpeg, runFfprobeDuration } from "./convert.js";

const LEAD_IN = 0.35;

export function hasEdgeTts(): boolean {
  return resolveEdgeTts() !== null;
}

export function synthesizeLine(
  text: string,
  outMp3: string,
  voice: string,
  rate: string
): void {
  const edge = resolveEdgeTts();
  if (!edge) {
    throw new Error(
      `edge-tts not available. Run: ${installHint("edge-tts")}`
    );
  }
  const r = spawnSync(
    edge.python,
    [
      ...edge.moduleArgs,
      "--voice",
      voice,
      "--rate",
      rate,
      "--text",
      text,
      "--write-media",
      outMp3,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.slice(-800) || "edge-tts failed");
  }
}

/** Fit VO to a window duration (seconds), matching demo-videos/voiceover.mjs. */
export function fitVoiceoverArgs(
  mp3Path: string,
  wavPath: string,
  windowSec: number
): string[] {
  const voDur = runFfprobeDuration(mp3Path);
  const avail = windowSec - LEAD_IN - 0.15;
  const tempo = voDur > avail && avail > 0 ? Math.min(1.6, voDur / avail) : 1;
  const delayMs = Math.round(LEAD_IN * 1000);
  const filt =
    (tempo > 1 ? `atempo=${tempo.toFixed(3)},` : "") +
    `adelay=${delayMs}|${delayMs},apad`;
  return [
    "-i",
    mp3Path,
    "-af",
    filt,
    "-t",
    windowSec.toFixed(3),
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ];
}

export function buildNarrationBed(
  cues: NarrationCue[],
  totalSec: number,
  voDir: string,
  voice: string,
  rate: string
): string {
  fs.mkdirSync(voDir, { recursive: true });
  if (!cues.length) {
    const silent = path.join(voDir, "silent.wav");
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-t",
      totalSec.toFixed(3),
      "-c:a",
      "pcm_s16le",
      silent,
    ]);
    return silent;
  }

  // Silent base + delayed speech segments mixed onto a timeline
  const inputs: string[] = [
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=48000:cl=stereo:d=${totalSec.toFixed(3)}`,
  ];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    const mp3 = path.join(voDir, `cue-${i}.mp3`);
    const wav = path.join(voDir, `cue-${i}.wav`);
    if (c.audioPath && fs.existsSync(c.audioPath)) {
      fs.copyFileSync(c.audioPath, mp3);
    } else {
      synthesizeLine(c.text, mp3, voice, rate);
    }
    const windowSec = Math.max(0.2, (c.endMs - c.startMs) / 1000);
    runFfmpeg(fitVoiceoverArgs(mp3, wav, windowSec));
    inputs.push("-i", wav);
  }
  const delays = cues.map((_, i) => {
    const delayMs = Math.round(cues[i]!.startMs);
    return `[${i + 1}]adelay=${delayMs}|${delayMs}[a${i + 1}]`;
  });
  const amixIn = ["[0:a]", ...cues.map((_, i) => `[a${i + 1}]`)].join("");
  const filter =
    delays.join(";") +
    ";" +
    `${amixIn}amix=inputs=${cues.length + 1}:duration=first:dropout_transition=0:normalize=0[aout]`;

  const outWav = path.join(voDir, "bed.wav");
  runFfmpeg([
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[aout]",
    "-t",
    totalSec.toFixed(3),
    "-c:a",
    "pcm_s16le",
    outWav,
  ]);
  return outWav;
}

export function muxAudio(videoPath: string, wavPath: string, outPath: string): void {
  runFfmpeg([
    "-i",
    videoPath,
    "-i",
    wavPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}
