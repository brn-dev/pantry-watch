import type { ParsedItem } from "./quickAdd";
import type { Household } from "@shared/models";

export type HouseholdsResponse = {
  households: Household[];
};

export type RecordingTextResponse = {
  text: string;
};

export type ParsedItemsResponse = {
  items: Omit<ParsedItem, "id">[];
};

export type ErrorResponse = {
  error?: string;
};

export type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

export type LlmModel = string;

export type LlmModelsResponse = {
  models: string[];
  defaultModel: string | null;
};

export type CreateOverviewItemInput = {
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

export type UpdateOverviewItemInput = CreateOverviewItemInput & {
  locationId: string;
};
