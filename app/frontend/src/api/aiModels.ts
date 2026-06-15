import type { LlmModelsResponse } from "../types/app";
import { apiFetch, assertApiOk } from "./http";

export async function fetchAvailableLlmModels(): Promise<LlmModelsResponse> {
  const response = await apiFetch("/api/ai/models");
  assertApiOk(response, "Failed to load AI models");

  return (await response.json()) as LlmModelsResponse;
}
