import { sessionManager } from "../session/manager.js";
import type { SessionIdentity } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleEndSession(input: SessionIdentity) {
  try {
    const result = await sessionManager.end(input.sessionId);
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}
