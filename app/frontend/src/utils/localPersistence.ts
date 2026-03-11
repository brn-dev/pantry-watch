import { Preferences } from "@capacitor/preferences";
import type { Language } from "../i18n";

const STORAGE_KEYS = {
  language: "pantry-watch-language",
  llmModel: "pantry-watch-llm-model"
} as const;

export async function getStoredLanguage(): Promise<Language | null> {
  const { value } = await Preferences.get({ key: STORAGE_KEYS.language });
  if (value === "en" || value === "de") {
    return value;
  }

  return null;
}

export async function setStoredLanguage(language: Language): Promise<void> {
  await Preferences.set({ key: STORAGE_KEYS.language, value: language });
}

export async function getStoredLlmModel(): Promise<string | null> {
  const { value } = await Preferences.get({ key: STORAGE_KEYS.llmModel });
  return value ?? null;
}

export async function setStoredLlmModel(llmModel: string): Promise<void> {
  await Preferences.set({ key: STORAGE_KEYS.llmModel, value: llmModel });
}
