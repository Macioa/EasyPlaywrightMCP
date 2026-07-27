import { sessionManager } from "../session/manager.js";
import { querySessionPage } from "../session/query.js";
import type { SessionIdentity } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleQuerySession(input: SessionIdentity) {
  try {
    const session = sessionManager.get(input.sessionId);
    const data = await querySessionPage(session.sessionId, session.page);
    return jsonResult(data);
  } catch (err) {
    return errorResult(err);
  }
}
