export function jsonResult(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const text = JSON.stringify(data, null, 2);
  const isError =
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
    (data as { ok: unknown }).ok === false;
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function errorResult(err: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const reason = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, reason }, null, 2) }],
    isError: true,
  };
}
