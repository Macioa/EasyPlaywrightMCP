import { spawnSync } from "node:child_process";

export function runFfmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", ...args], {
    encoding: "utf8",
    // Ensure child can resolve fonts when callers pass fontfile under the package.
    env: process.env,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "ffmpeg failed").trim();
    throw new Error(err.slice(-2000));
  }
}

export function runFfprobeDuration(file: string): number {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nk=1:nw=1",
      file,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.slice(-500) || "ffprobe failed");
  }
  return parseFloat((r.stdout || "0").trim()) || 0;
}

export function hasBinary(name: string): boolean {
  const r = spawnSync(name, ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

/** Build vf filter for WebM→H.264 normalize (demo-video.md recipe). */
export function convertVf(fast: boolean): string {
  const norm =
    "scale=1920:1080:force_original_aspect_ratio=decrease," +
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1";
  return fast
    ? `fps=60,${norm}`
    : `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,${norm}`;
}

export function convertArgs(
  inPath: string,
  outPath: string,
  fast: boolean
): string[] {
  return [
    "-i",
    inPath,
    "-vf",
    convertVf(fast),
    "-c:v",
    "libx264",
    "-preset",
    fast ? "veryfast" : "slow",
    "-crf",
    fast ? "23" : "18",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

export function convertVideo(
  inPath: string,
  outPath: string,
  fast: boolean
): void {
  runFfmpeg(convertArgs(inPath, outPath, fast));
}
