import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DATA_ROOT = path.join(os.homedir(), ".easy-playwright-mcp");
export const AUTH_DIR = path.join(DATA_ROOT, "auth");
export const SESSIONS_DIR = path.join(DATA_ROOT, "sessions");
export const SCRATCH_DIR = path.join(DATA_ROOT, "scratch");

export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const DEVICE_SCALE_FACTOR = 2;

export function ensureDataDirs(): void {
  for (const dir of [DATA_ROOT, AUTH_DIR, SESSIONS_DIR, SCRATCH_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function profileDir(profileId: string): string {
  return path.join(AUTH_DIR, profileId);
}

export function storageStatePath(profileId: string): string {
  return path.join(profileDir(profileId), "storageState.json");
}

export function scratchJobDir(jobId: string): string {
  const dir = path.join(SCRATCH_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
