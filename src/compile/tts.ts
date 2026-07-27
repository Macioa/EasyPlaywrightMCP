import fs from "node:fs";
import path from "node:path";
import { scratchJobDir } from "../paths.js";
import { runFfprobeDuration } from "./convert.js";
import { synthesizeLine } from "./voiceover.js";

export interface SynthesizedNarration {
  audioPath: string;
  durationMs: number;
}

export type SynthesizeNarrationFn = (args: {
  text: string;
  voice: string;
  rate: string;
  outDir: string;
  index: number;
}) => Promise<SynthesizedNarration>;

async function defaultSynthesize(args: {
  text: string;
  voice: string;
  rate: string;
  outDir: string;
  index: number;
}): Promise<SynthesizedNarration> {
  fs.mkdirSync(args.outDir, { recursive: true });
  const audioPath = path.join(args.outDir, `cue-${args.index}.mp3`);
  synthesizeLine(args.text, audioPath, args.voice, args.rate);
  const durationMs = Math.round(runFfprobeDuration(audioPath) * 1000);
  return { audioPath, durationMs: Math.max(200, durationMs) };
}

/** Injectable for unit tests (mock VO duration without edge-tts). */
export let synthesizeNarration: SynthesizeNarrationFn = defaultSynthesize;

export function setSynthesizeNarrationForTests(
  fn: SynthesizeNarrationFn | null
): void {
  synthesizeNarration = fn ?? defaultSynthesize;
}

export function sessionVoDir(sessionId: string): string {
  return scratchJobDir(`vo_${sessionId}`);
}

export const VO_HOLD_PAD_MS = 150;
