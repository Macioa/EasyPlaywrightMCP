import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { scratchJobDir } from "../paths.js";
import { readCuesFile } from "../session/cues.js";
import type {
  CompileDemoInput,
  CompileDemoResult,
  DemoClip,
  NarrationCue,
} from "../types/schemas.js";
import { burnCaptions } from "./captions.js";
import { installHint } from "../platform/tools.js";
import { convertVideo, hasBinary, runFfprobeDuration } from "./convert.js";
import { recordSlate } from "./slate.js";
import { spliceVideos } from "./splice.js";
import {
  buildNarrationBed,
  hasEdgeTts,
  muxAudio,
} from "./voiceover.js";

/** Resolve narration for a clip: cues.json wins when preferCuesFile (default). */
export function resolveClipNarration(item: DemoClip): NarrationCue[] {
  const prefer = item.preferCuesFile !== false;
  if (prefer) {
    const cues = item.cuesPath
      ? readCuesFile(item.cuesPath)
      : readCuesFile(item.videoPath);
    if (cues?.cues?.length) {
      return cues.cues.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        audioPath: c.audioPath,
      }));
    }
  }
  return item.narration ?? [];
}

export async function compileDemo(
  input: CompileDemoInput
): Promise<CompileDemoResult> {
  if (!hasBinary("ffmpeg") || !hasBinary("ffprobe")) {
    return {
      ok: false,
      reason: `ffmpeg/ffprobe not on PATH. Install: ${installHint("ffmpeg")}.`,
    };
  }
  if (!hasEdgeTts()) {
    return {
      ok: false,
      reason: `edge-tts not available. Run: ${installHint("edge-tts")}`,
    };
  }

  const jobId = `job_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const work = scratchJobDir(jobId);
  const fast = input.fast ?? false;
  const voice = input.voice ?? "en-US-AndrewNeural";
  const rate = input.rate ?? "+10%";
  const segmentMp4s: string[] = [];

  try {
    for (let i = 0; i < input.content.length; i++) {
      const item = input.content[i]!;
      const seq = String(i).padStart(2, "0");
      const segDir = path.join(work, seq);
      fs.mkdirSync(segDir, { recursive: true });

      let baseMp4 = path.join(segDir, "base.mp4");

      if (item.kind === "slate") {
        await recordSlate(item, baseMp4, segDir, fast);
      } else {
        const src = path.resolve(item.videoPath);
        if (!fs.existsSync(src)) {
          return { ok: false, reason: `Missing video: ${src}` };
        }
        if (/\.mp4$/i.test(src) && fast) {
          convertVideo(src, baseMp4, true);
        } else {
          convertVideo(src, baseMp4, fast);
        }
      }

      const narration =
        item.kind === "clip"
          ? resolveClipNarration(item)
          : item.narration ?? [];

      let clipVoice = voice;
      let clipRate = rate;
      if (item.kind === "clip") {
        const cuesMeta = item.cuesPath
          ? readCuesFile(item.cuesPath)
          : readCuesFile(item.videoPath);
        if (cuesMeta?.voice) clipVoice = cuesMeta.voice;
        if (cuesMeta?.rate) clipRate = cuesMeta.rate;
      }

      const captioned = path.join(segDir, "captioned.mp4");
      if (narration.length) {
        burnCaptions(baseMp4, captioned, narration);
      } else {
        fs.copyFileSync(baseMp4, captioned);
      }

      const dur = runFfprobeDuration(captioned);
      const voDir = path.join(segDir, "vo");
      const bed = buildNarrationBed(
        narration,
        dur,
        voDir,
        clipVoice,
        clipRate
      );
      const narrated = path.join(segDir, "narrated.mp4");
      muxAudio(captioned, bed, narrated);
      segmentMp4s.push(narrated);
    }

    const out = path.resolve(input.outputPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    spliceVideos(segmentMp4s, out, work);
    return { ok: true, outputPath: out };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
