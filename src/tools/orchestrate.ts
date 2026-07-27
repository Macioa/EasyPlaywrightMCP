import { sessionManager } from "../session/manager.js";
import { orchestrateSession } from "../session/orchestrate.js";
import type { OrchestrateSessionInput } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleOrchestrateSession(input: OrchestrateSessionInput) {
  try {
    const session = sessionManager.get(input.sessionId);
    const commands = await orchestrateSession(session, input);
    return jsonResult({ commands });
  } catch (err) {
    return errorResult(err);
  }
}
