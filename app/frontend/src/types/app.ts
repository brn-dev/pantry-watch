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

export type LlmModel = "gpt-5.4" | "gpt-5" | "gpt-5-mini" | "gpt-5-nano";

export type CreateOverviewItemInput = {
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

export type UpdateOverviewItemInput = CreateOverviewItemInput & {
  locationId: string;
};
