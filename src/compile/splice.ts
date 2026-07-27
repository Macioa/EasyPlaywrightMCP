import fs from "node:fs";
import path from "node:path";
import { runFfmpeg } from "./convert.js";

export function spliceArgs(listPath: string, outPath: string): string[] {
  return [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

export function spliceVideos(mp4Paths: string[], outPath: string, workDir: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const listPath = path.join(workDir, "concat-list.txt");
  const lines = mp4Paths.map((f) => {
    const abs = path.resolve(f).replace(/\\/g, "/").replace(/'/g, "'\\''");
    return `file '${abs}'`;
  });
  fs.writeFileSync(listPath, lines.join("\n"), "utf8");
  try {
    runFfmpeg(spliceArgs(listPath, outPath));
  } catch {
    runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outPath,
    ]);
  }
}
