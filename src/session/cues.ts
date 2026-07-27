import fs from "node:fs";
import path from "node:path";
import type { CommandResult } from "../types/schemas.js";

export interface DemoCue {
  startMs: number;
  endMs: number;
  text: string;
  actionIndex: number;
  audioPath?: string;
}

export interface DemoCuesFile {
  sessionId: string;
  videoPath: string;
  voice: string;
  rate: string;
  cues: DemoCue[];
  actionSpan: { startMs: number; endMs: number };
}

export function cuesPathFor(videoPath: string): string {
  const resolved = path.resolve(videoPath);
  return resolved.replace(/\.(webm|mp4)$/i, "") + ".cues.json";
}

export function buildCuesFile(
  sessionId: string,
  videoPath: string,
  results: CommandResult[],
  voice: string,
  rate: string
): DemoCuesFile {
  const withVideo = results.filter(
    (r) => typeof r.videoStartMs === "number" && typeof r.videoEndMs === "number"
  );
  const cues: DemoCue[] = withVideo.map((r) => ({
    startMs: r.narrationStartMs ?? r.videoStartMs!,
    endMs: r.narrationEndMs ?? r.videoEndMs!,
    text: r.narrationText ?? r.description,
    actionIndex: r.index,
    audioPath: r.audioPath,
  }));
  const startMs = withVideo.length
    ? Math.min(...withVideo.map((r) => r.videoStartMs!))
    : 0;
  const endMs = withVideo.length
    ? Math.max(...withVideo.map((r) => r.videoEndMs!))
    : 0;
  return {
    sessionId,
    videoPath: path.resolve(videoPath),
    voice,
    rate,
    cues,
    actionSpan: { startMs, endMs },
  };
}

export function writeCuesFile(file: DemoCuesFile): string {
  const out = cuesPathFor(file.videoPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file, null, 2), "utf8");
  return out;
}

export function readCuesFile(videoOrCuesPath: string): DemoCuesFile | null {
  const p = videoOrCuesPath.endsWith(".cues.json")
    ? videoOrCuesPath
    : cuesPathFor(videoOrCuesPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as DemoCuesFile;
}
