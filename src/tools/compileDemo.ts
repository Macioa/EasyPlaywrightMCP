import { compileDemo } from "../compile/pipeline.js";
import type { CompileDemoInput } from "../types/schemas.js";
import { jsonResult, errorResult } from "./result.js";

export async function handleCompileDemo(input: CompileDemoInput) {
  try {
    const result = await compileDemo(input);
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}
