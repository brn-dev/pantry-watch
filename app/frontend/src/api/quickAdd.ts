import type { Language } from "../i18n";
import type { LlmModel, ParsedItemsResponse, RecordingResult, RecordingTextResponse } from "../types/app";
import { assertApiOk } from "./http";

export async function transcribeVoiceToText(recordingResult: RecordingResult, language: Language): Promise<string> {
  const audioBase64 = await blobToBase64(recordingResult.audioBlob);
  const response = await fetch("/api/ai/voice-to-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: recordingResult.mimeType,
      language
    })
  });

  assertApiOk(response, "Failed to transcribe recording");

  const data = (await response.json()) as RecordingTextResponse;
  return data.text;
}

export async function parseTextToItems(input: {
  text: string;
  availableLocations: string[];
  currentDate: string;
  llmModel: LlmModel;
}): Promise<ParsedItemsResponse["items"]> {
  const response = await fetch("/api/ai/text-to-items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  assertApiOk(response, "Failed to parse text");

  const data = (await response.json()) as ParsedItemsResponse;
  return data.items;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read audio data."));
        return;
      }

      const delimiterIndex = result.indexOf(",");
      if (delimiterIndex < 0) {
        reject(new Error("Audio data URL is invalid."));
        return;
      }

      resolve(result.slice(delimiterIndex + 1));
    };
    reader.onerror = () => {
      reject(new Error("Failed to read recorded audio."));
    };
    reader.readAsDataURL(blob);
  });
}
