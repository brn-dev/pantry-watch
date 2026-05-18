import { Preferences } from "@capacitor/preferences";
import type { Language } from "../i18n";

const STORAGE_KEYS = {
  language: "pantry-watch-language",
  llmModel: "pantry-watch-llm-model",
  householdCredentials: "pantry-watch-household-credentials"
} as const;

export type HouseholdCredential = {
  householdId: string;
  accessToken: string;
};

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

export async function getStoredHouseholdCredentials(): Promise<HouseholdCredential[]> {
  const { value } = await Preferences.get({ key: STORAGE_KEYS.householdCredentials });
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return null;
        }

        const credential = candidate as Partial<HouseholdCredential>;
        if (typeof credential.householdId !== "string" || typeof credential.accessToken !== "string") {
          return null;
        }

        return {
          householdId: credential.householdId.trim(),
          accessToken: credential.accessToken
        };
      })
      .filter((credential): credential is HouseholdCredential => {
        return !!credential && !!credential.householdId && !!credential.accessToken;
      });
  } catch {
    return [];
  }
}

export async function setStoredHouseholdCredentials(credentials: HouseholdCredential[]): Promise<void> {
  await Preferences.set({
    key: STORAGE_KEYS.householdCredentials,
    value: JSON.stringify(credentials)
  });
}
