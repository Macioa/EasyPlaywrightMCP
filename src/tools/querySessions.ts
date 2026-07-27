import { sessionManager } from "../session/manager.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleQuerySessions() {
  try {
    const sessions = await sessionManager.listDetailed();
    return jsonResult({ sessions });
  } catch (err) {
    return errorResult(err);
  }
}
