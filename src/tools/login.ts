import { login } from "../auth/login.js";
import type { LoginInput } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleLogin(input: LoginInput) {
  try {
    const result = await login(input);
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}
