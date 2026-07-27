import { sessionManager } from "../session/manager.js";
import type { StartSessionInput } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleStartSession(input: StartSessionInput) {
  try {
    const result = await sessionManager.start(input);
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}
