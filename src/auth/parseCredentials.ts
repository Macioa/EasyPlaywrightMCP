import type { CookieInput, StorageEntry } from "../types/schemas.js";
import { CookieSchema, StorageEntrySchema } from "../types/schemas.js";

export interface ParsedCredentials {
  cookies: CookieInput[];
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];
  origin?: string;
  url?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function parseCookieList(raw: unknown): CookieInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CookieInput[] = [];
  for (const item of raw) {
    const parsed = CookieSchema.safeParse(item);
    if (parsed.success && parsed.data.name && parsed.data.value !== undefined) {
      out.push(parsed.data);
    }
  }
  return out;
}

function parseStorageList(raw: unknown): StorageEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StorageEntry[] = [];
  for (const item of raw) {
    const parsed = StorageEntrySchema.safeParse(item);
    if (parsed.success && parsed.data.name) {
      out.push(parsed.data);
    }
  }
  return out;
}

function fromStorageState(obj: Record<string, unknown>): ParsedCredentials | null {
  if (!Array.isArray(obj.origins) && !Array.isArray(obj.cookies)) return null;
  // Playwright storageState always has cookies; origins is typical but may be empty.
  if (!("cookies" in obj) && !("origins" in obj)) return null;
  if (!Array.isArray(obj.cookies) && !Array.isArray(obj.origins)) return null;

  const cookies = parseCookieList(obj.cookies);
  const localStorage: StorageEntry[] = [];
  let origin: string | undefined;

  if (Array.isArray(obj.origins)) {
    for (const o of obj.origins) {
      const rec = asRecord(o);
      if (!rec) continue;
      if (typeof rec.origin === "string" && !origin) origin = rec.origin;
      const ls = parseStorageList(rec.localStorage);
      localStorage.push(...ls);
    }
  }

  return {
    cookies,
    localStorage,
    sessionStorage: [],
    origin,
  };
}

function fromSnippet(obj: Record<string, unknown>): ParsedCredentials {
  return {
    cookies: parseCookieList(obj.cookies),
    localStorage: parseStorageList(obj.localStorage),
    sessionStorage: parseStorageList(obj.sessionStorage),
    origin: typeof obj.origin === "string" ? obj.origin : undefined,
    url: typeof obj.url === "string" ? obj.url : undefined,
  };
}

export function parseCredentialsJson(credentialsJson: string): ParsedCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(credentialsJson);
  } catch {
    throw new Error("credentialsJson is not valid JSON");
  }

  const obj = asRecord(parsed);
  if (!obj) {
    throw new Error("credentialsJson must be a JSON object");
  }

  // Prefer Playwright storageState when origins is present
  const storageState = Array.isArray(obj.origins) ? fromStorageState(obj) : null;
  const creds = storageState ?? fromSnippet(obj);

  const empty =
    creds.cookies.length === 0 &&
    creds.localStorage.length === 0 &&
    creds.sessionStorage.length === 0;

  if (empty) {
    throw new Error(
      "credentialsJson has no cookies, localStorage, or sessionStorage entries"
    );
  }

  return creds;
}
