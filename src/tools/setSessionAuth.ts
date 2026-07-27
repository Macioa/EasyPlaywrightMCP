import { setSessionAuth } from "../auth/setSessionAuth.js";
import type { SetSessionAuthInput } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleSetSessionAuth(input: SetSessionAuthInput) {
  try {
    const result = await setSessionAuth(input);
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}
