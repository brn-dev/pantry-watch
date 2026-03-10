<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { Household, PantryLocation } from "@shared/models";
import OverviewPage from "./pages/OverviewPage.vue";
import QuickAddPage from "./pages/QuickAddPage.vue";
import AiChefPage from "./pages/AiChefPage.vue";
import ShoppingListPage from "./pages/ShoppingListPage.vue";
import RoughButton from "./components/RoughButton.vue";
import RoughPanel from "./components/RoughPanel.vue";
import HandDrawnIcon from "./components/HandDrawnIcon.vue";
import FlagIcon from "./components/FlagIcon.vue";
import type { ParsedItem } from "./types/quickAdd";
import { t, type Language, type TranslationKey } from "./i18n";

type HouseholdsResponse = {
  households: Household[];
};

type RecordingTextResponse = {
  text: string;
};

type ParsedItemsResponse = {
  items: Omit<ParsedItem, "id">[];
};

type ErrorResponse = {
  error?: string;
};

type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

type CreateOverviewItemInput = {
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

const households = ref<Household[]>([]);
const loadingHouseholds = ref(false);
const householdsError = ref("");
const language = ref<Language>("en");

const routePath = ref(window.location.pathname);
const voiceRecordingText = ref("");
const inputText = ref("");
const parsedItems = ref<ParsedItem[]>([]);
const quickAddStatus = ref("");
const quickAddError = ref("");
const selectedHouseholdId = ref("");
const isSettingsModalOpen = ref(false);

const selectedHousehold = computed<Household | undefined>(() => {
  return households.value.find((household) => household.id === selectedHouseholdId.value);
});

const activePage = computed<"overview" | "quick-add" | "ai-chef" | "shopping-list">(() => {
  if (routePath.value.startsWith("/shopping-list")) {
    return "shopping-list";
  }
  if (routePath.value.startsWith("/ai-chef")) {
    return "ai-chef";
  }
  if (routePath.value.startsWith("/quick-add")) {
    return "quick-add";
  }
  return "overview";
});

const hasParsedItems = computed<boolean>(() => parsedItems.value.length > 0);

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function createParsedItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `parsed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapParsedItemFromApi(parsedItemApi: Omit<ParsedItem, "id">): ParsedItem {
  return {
    id: createParsedItemId(),
    ...parsedItemApi
  };
}

async function getApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = (await response.json()) as ErrorResponse;
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  return t(language.value, key, params);
}

function updateLanguage(nextLanguage: Language): void {
  language.value = nextLanguage;
  window.localStorage.setItem("pantry-watch-language", nextLanguage);
  isSettingsModalOpen.value = false;
}

function openSettingsModal(): void {
  isSettingsModalOpen.value = true;
}

function closeSettingsModal(): void {
  isSettingsModalOpen.value = false;
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && isSettingsModalOpen.value) {
    closeSettingsModal();
  }
}

function handlePopState(): void {
  routePath.value = window.location.pathname;
}

function navigateTo(path: "/overview" | "/quick-add" | "/ai-chef" | "/shopping-list"): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  routePath.value = path;
}

function syncSelectionsToState(): void {
  if (!households.value.length) {
    selectedHouseholdId.value = "";
    return;
  }

  const currentHousehold = households.value.find((household) => household.id === selectedHouseholdId.value);
  const fallbackHousehold = currentHousehold ?? households.value[0];
  selectedHouseholdId.value = fallbackHousehold.id;
}

async function loadHouseholds(): Promise<void> {
  loadingHouseholds.value = true;
  householdsError.value = "";

  try {
    const response = await fetch("/api/households");
    if (!response.ok) {
      throw new Error(translate("failedLoadHouseholds", { status: response.status }));
    }

    const data = (await response.json()) as HouseholdsResponse;
    households.value = data.households;
    syncSelectionsToState();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : translate("failedLoadHouseholdsGeneric");
  } finally {
    loadingHouseholds.value = false;
  }
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

async function transcribeVoiceRecording(recordingResult: RecordingResult): Promise<void> {
  quickAddError.value = "";
  quickAddStatus.value = translate("loadingRecordingText");

  try {
    const audioBase64 = await blobToBase64(recordingResult.audioBlob);
    const response = await fetch("/api/ai/voice-to-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: recordingResult.mimeType,
        language: language.value
      })
    });

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(response, translate("failedLoadRecordingText", { status: response.status }))
      );
    }

    const data = (await response.json()) as RecordingTextResponse;
    voiceRecordingText.value = data.text;
    inputText.value = data.text;
    quickAddStatus.value = translate("recordingTextLoaded");
  } catch (error) {
    quickAddStatus.value = "";
    quickAddError.value = error instanceof Error ? error.message : translate("failedLoadRecordingTextGeneric");
  }
}

async function parseInputText(): Promise<void> {
  if (!inputText.value.trim()) {
    quickAddError.value = translate("enterTextFirst");
    return;
  }
  if (!selectedHousehold.value) {
    quickAddError.value = translate("householdNotFound");
    return;
  }

  quickAddError.value = "";
  quickAddStatus.value = translate("parsingText");

  try {
    const availableLocations = selectedHousehold.value.locations.map((location) => location.name);
    const currentDate = new Date().toISOString().slice(0, 10);

    const response = await fetch("/api/ai/text-to-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: inputText.value,
        availableLocations,
        currentDate
      })
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, translate("failedParseText", { status: response.status })));
    }

    const data = (await response.json()) as ParsedItemsResponse;
    parsedItems.value = data.items.map(mapParsedItemFromApi);
    quickAddStatus.value = translate("parsedItemsCount", { count: parsedItems.value.length });
  } catch (error) {
    quickAddStatus.value = "";
    quickAddError.value = error instanceof Error ? error.message : translate("failedParseTextGeneric");
  }
}

async function ensureLocationIdByName(
  householdId: string,
  locationName: string,
  locationIdsByName: Map<string, string>
): Promise<string> {
  const normalizedLocationName = normalizeText(locationName);
  const existingLocationId = locationIdsByName.get(normalizedLocationName);
  if (existingLocationId) {
    return existingLocationId;
  }

  const createResponse = await fetch(`/api/households/${householdId}/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: locationName.trim() })
  });

  if (!createResponse.ok) {
    throw new Error(translate("failedCreateLocation", { name: locationName, status: createResponse.status }));
  }

  const createdLocation = (await createResponse.json()) as PantryLocation;
  locationIdsByName.set(normalizedLocationName, createdLocation.id);
  return createdLocation.id;
}

async function addParsedItemsByLocation(): Promise<void> {
  if (!selectedHouseholdId.value) {
    quickAddError.value = translate("selectHousehold");
    return;
  }

  if (!parsedItems.value.length) {
    quickAddError.value = translate("noParsedItemsToAdd");
    return;
  }

  const household = selectedHousehold.value;
  if (!household) {
    quickAddError.value = translate("householdNotFound");
    return;
  }

  quickAddError.value = "";
  quickAddStatus.value = translate("addingParsedItems");

  const locationIdsByName = new Map<string, string>(
    household.locations.map((location) => [normalizeText(location.name), location.id])
  );

  try {
    for (const parsedItem of parsedItems.value) {
      const locationId = await ensureLocationIdByName(
        selectedHouseholdId.value,
        parsedItem.locationName,
        locationIdsByName
      );

      const response = await fetch(`/api/households/${selectedHouseholdId.value}/locations/${locationId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: parsedItem.name,
          quantity: parsedItem.quantity,
          unit: parsedItem.unit,
          expirationDate: parsedItem.expirationDate || null
        })
      });

      if (!response.ok) {
        throw new Error(translate("failedAddItem", { name: parsedItem.name, status: response.status }));
      }
    }

    quickAddStatus.value = translate("addedItemsCount", { count: parsedItems.value.length });
    parsedItems.value = [];
    inputText.value = "";
    await loadHouseholds();
  } catch (error) {
    quickAddStatus.value = "";
    quickAddError.value = error instanceof Error ? error.message : translate("failedAddParsedItemsGeneric");
  }
}

async function decreaseOverviewItem(householdId: string, itemId: string, currentQuantity: number): Promise<void> {
  try {
    if (currentQuantity <= 1) {
      const deleteResponse = await fetch(`/api/households/${householdId}/items/${itemId}`, {
        method: "DELETE"
      });
      if (!deleteResponse.ok) {
        throw new Error(`Failed to remove item (${deleteResponse.status})`);
      }
    } else {
      const patchResponse = await fetch(`/api/households/${householdId}/items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          quantity: currentQuantity - 1
        })
      });
      if (!patchResponse.ok) {
        throw new Error(`Failed to update item quantity (${patchResponse.status})`);
      }
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : "Failed to update item";
  }
}

async function createOverviewLocation(householdId: string, locationName: string): Promise<void> {
  householdsError.value = "";

  try {
    const response = await fetch(`/api/households/${householdId}/locations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: locationName.trim() })
    });

    if (!response.ok) {
      throw new Error(translate("failedCreateLocation", { name: locationName, status: response.status }));
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : translate("failedLoadHouseholdsGeneric");
  }
}

async function updateOverviewLocation(householdId: string, locationId: string, locationName: string): Promise<void> {
  householdsError.value = "";

  try {
    const response = await fetch(`/api/households/${householdId}/locations/${locationId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: locationName.trim() })
    });

    if (!response.ok) {
      throw new Error(translate("failedUpdateLocation", { name: locationName, status: response.status }));
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : translate("failedLoadHouseholdsGeneric");
  }
}

async function createOverviewItem(
  householdId: string,
  locationId: string,
  input: CreateOverviewItemInput
): Promise<void> {
  householdsError.value = "";

  try {
    const response = await fetch(`/api/households/${householdId}/locations/${locationId}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: input.name.trim(),
        quantity: input.quantity,
        unit: input.unit.trim() || "pcs",
        expirationDate: input.expirationDate
      })
    });

    if (!response.ok) {
      throw new Error(translate("failedAddItem", { name: input.name, status: response.status }));
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : translate("failedLoadHouseholdsGeneric");
  }
}

async function updateOverviewItem(
  householdId: string,
  itemId: string,
  input: CreateOverviewItemInput
): Promise<void> {
  householdsError.value = "";

  try {
    const response = await fetch(`/api/households/${householdId}/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: input.name.trim(),
        quantity: input.quantity,
        unit: input.unit.trim() || "pcs",
        expirationDate: input.expirationDate
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update item (${response.status})`);
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : "Failed to update item";
  }
}

async function updateOverviewItemExpiration(
  householdId: string,
  itemId: string,
  expirationDate: string | null
): Promise<void> {
  householdsError.value = "";

  try {
    const response = await fetch(`/api/households/${householdId}/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expirationDate
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update expiration date (${response.status})`);
    }

    await loadHouseholds();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : "Failed to update expiration date";
  }
}

function updateSelectedHouseholdId(nextHouseholdId: string): void {
  selectedHouseholdId.value = nextHouseholdId;
}

function updateInputText(value: string): void {
  inputText.value = value;
}

function updateParsedItemExpirationDate(parsedItemId: string, value: string): void {
  parsedItems.value = parsedItems.value.map((parsedItem) => {
    if (parsedItem.id !== parsedItemId) {
      return parsedItem;
    }

    return {
      ...parsedItem,
      expirationDate: value || null
    };
  });
}

function updateParsedItem(
  parsedItemId: string,
  input: { name: string; quantity: number; unit: string; expirationDate: string | null }
): void {
  parsedItems.value = parsedItems.value.map((parsedItem) => {
    if (parsedItem.id !== parsedItemId) {
      return parsedItem;
    }

    return {
      ...parsedItem,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      expirationDate: input.expirationDate
    };
  });
}

watch(isSettingsModalOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});

onMounted(() => {
  const storedLanguage = window.localStorage.getItem("pantry-watch-language");
  if (storedLanguage === "en" || storedLanguage === "de") {
    language.value = storedLanguage;
  }

  if (window.location.pathname === "/") {
    window.history.replaceState({}, "", "/overview");
    routePath.value = "/overview";
  }

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("keydown", handleGlobalKeyDown);
  void loadHouseholds();
});

onUnmounted(() => {
  window.removeEventListener("popstate", handlePopState);
  window.removeEventListener("keydown", handleGlobalKeyDown);
  document.body.style.overflow = "";
});
</script>

<template>
  <main class="min-h-screen w-full max-w-full overflow-x-hidden text-[var(--ink-main)]">
    <header class="fixed inset-x-0 top-0 z-30 border-b border-[#6f5a47]/40 bg-[#f8efda]/94 px-3 py-2 shadow-sm backdrop-blur md:sticky md:px-4 md:py-3">
      <div class="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2">
        <h1 class="inline-flex min-w-0 items-center gap-1 truncate text-2xl font-bold tracking-tight text-[#3e3023] sm:gap-2 sm:text-4xl">
          <HandDrawnIcon name="clipboard" :size="32" :stroke-width="2" class="sm:hidden" />
          <HandDrawnIcon name="clipboard" :size="44" :stroke-width="2" class="hidden sm:block" />
          <span class="truncate">{{ translate("appTitle") }}</span>
        </h1>
        <nav class="ml-4 hidden gap-2 md:flex">
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/overview')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="notebook" :size="20" />
              <span>{{ translate("overview") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/quick-add')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="microphone" :size="20" />
              <span>{{ translate("quickAdd") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/ai-chef')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="chef-hat" :size="20" />
              <span>{{ translate("aiChef") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'shopping-list' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/shopping-list')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="checkmark" :size="20" />
              <span>{{ translate("shoppingList") }}</span>
            </span>
          </RoughButton>
        </nav>
        <div class="ml-auto flex items-center gap-1">
          <RoughButton
            class="px-1.5 py-0.5 text-xs leading-none sm:px-2 sm:py-1 sm:text-sm"
            :fill="'rgba(255, 251, 238, 0.95)'"
            @click="openSettingsModal"
            :title="translate('settings')"
            :aria-label="translate('settings')"
          >
            <HandDrawnIcon name="cog" :size="20" />
          </RoughButton>
        </div>
      </div>
    </header>

    <div
      v-if="isSettingsModalOpen"
      class="fixed inset-0 z-50 flex items-start justify-center bg-[#3e3023]/35 p-3 pt-20 sm:items-center sm:p-6"
      @click.self="closeSettingsModal"
    >
      <RoughPanel
        as="section"
        class="w-full max-w-sm p-4 sm:p-5"
        fill="rgba(255, 252, 240, 0.98)"
        role="dialog"
        aria-modal="true"
        :aria-label="translate('settings')"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h3 class="text-xl font-semibold tracking-tight text-[#3e3023]">
            {{ translate("settings") }}
          </h3>
          <RoughButton class="px-2 py-1 text-sm leading-none" @click="closeSettingsModal">
            {{ translate("cancel") }}
          </RoughButton>
        </div>
        <p class="mb-2 text-sm font-semibold text-[#4f4134]">
          {{ translate("language") }}
        </p>
        <div class="flex gap-2">
          <RoughButton
            class="min-w-[7.5rem] px-2 py-1 text-sm"
            :fill="language === 'en' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="updateLanguage('en')"
            :aria-label="translate('english')"
          >
            <span class="inline-flex items-center gap-2">
              <FlagIcon language="en" />
              <span>{{ translate("english") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="min-w-[7.5rem] px-2 py-1 text-sm"
            :fill="language === 'de' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="updateLanguage('de')"
            :aria-label="translate('german')"
          >
            <span class="inline-flex items-center gap-2">
              <FlagIcon language="de" />
              <span>{{ translate("german") }}</span>
            </span>
          </RoughButton>
        </div>
      </RoughPanel>
    </div>

    <div class="page-transition-stage">
      <Transition name="page-rip">
        <section :key="activePage" class="page-transition-layer">
          <div class="mx-auto w-full max-w-7xl p-3 pb-24 pt-20 sm:p-4 sm:pb-24 md:p-6 md:pb-6 md:pt-6">
            <RoughPanel class="mb-4">
              <h2 class="inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                <HandDrawnIcon
                  :name="
                    activePage === 'overview'
                      ? 'notebook'
                      : activePage === 'quick-add'
                        ? 'microphone'
                        : activePage === 'ai-chef'
                          ? 'chef-hat'
                          : 'checkmark'
                  "
                  :size="36"
                  :stroke-width="1.8"
                />
                <span>
                  {{
                    activePage === "overview"
                      ? translate("overview")
                      : activePage === "quick-add"
                        ? translate("quickAdd")
                        : activePage === "ai-chef"
                          ? translate("aiChef")
                          : translate("shoppingList")
                  }}
                </span>
              </h2>
            </RoughPanel>

            <p v-if="loadingHouseholds && !households.length" class="scribble-text">{{ translate("loadingHouseholds") }}</p>
            <p v-if="householdsError && !households.length" class="scribble-text text-[#8f2e2e]">{{ householdsError }}</p>
            <p v-if="householdsError && households.length" class="scribble-text text-[#8f2e2e]">{{ householdsError }}</p>

            <template v-if="households.length">
              <OverviewPage
                v-if="activePage === 'overview'"
                :households="households"
                :language="language"
                :on-decrease-item="decreaseOverviewItem"
                :on-create-location="createOverviewLocation"
                :on-update-location="updateOverviewLocation"
                :on-create-item="createOverviewItem"
                :on-update-item="updateOverviewItem"
                :on-update-item-expiration="updateOverviewItemExpiration"
              />

              <QuickAddPage
                v-else-if="activePage === 'quick-add'"
                :households="households"
                :selected-household-id="selectedHouseholdId"
                :language="language"
                :voice-recording-text="voiceRecordingText"
                :input-text="inputText"
                :parsed-items="parsedItems"
                :has-parsed-items="hasParsedItems"
                :quick-add-status="quickAddStatus"
                :quick-add-error="quickAddError"
                @household-change="updateSelectedHouseholdId"
                @parsed-item-expiration-date-change="updateParsedItemExpirationDate"
                @parsed-item-update="updateParsedItem"
                @input-text-change="updateInputText"
                @load-recording-text="transcribeVoiceRecording"
                @parse-text="parseInputText"
                @add-items="addParsedItemsByLocation"
              />

              <AiChefPage v-else-if="activePage === 'ai-chef'" :households="households" :language="language" />
              <ShoppingListPage v-else :language="language" />
            </template>
          </div>
        </section>
      </Transition>
    </div>

    <nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-[#6f5a47]/40 bg-[#f8efda]/95 px-2 py-0.5 shadow-[0_-4px_12px_rgba(62,48,35,0.15)] backdrop-blur md:hidden">
      <div class="mx-auto grid w-full max-w-7xl grid-cols-4 gap-1">
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/overview')"
          :aria-label="translate('overview')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="notebook" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/quick-add')"
          :aria-label="translate('quickAdd')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="microphone" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/ai-chef')"
          :aria-label="translate('aiChef')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="chef-hat" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'shopping-list' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/shopping-list')"
          :aria-label="translate('shoppingList')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="checkmark" :size="24" />
          </span>
        </RoughButton>
      </div>
    </nav>
  </main>
</template>

<style scoped>
.page-transition-stage {
  position: relative;
  overflow: hidden;
  min-height: calc(100vh - 5rem);
  --notebook-line-start: 2.05rem;
  --notebook-line-end: 2.14rem;
  --notebook-line-repeat: 4.22rem;
}

.page-transition-layer {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 5rem);
  background-color: var(--paper-base);
  background-image:
    radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.7) 0, rgba(255, 255, 255, 0) 42%),
    linear-gradient(to right, transparent 0 3.8rem, var(--line-red) 3.8rem 4.05rem, transparent 4.05rem 100%),
    repeating-linear-gradient(
      to bottom,
      transparent 0 var(--notebook-line-start),
      var(--line-blue) var(--notebook-line-start) var(--notebook-line-end),
      transparent var(--notebook-line-end) var(--notebook-line-repeat)
    ),
    linear-gradient(180deg, var(--paper-base) 0%, var(--paper-shadow) 100%);
}

.page-rip-enter-active,
.page-rip-leave-active {
  transition:
    transform 1500ms cubic-bezier(0.2, 0.85, 0.25, 1),
    opacity 1500ms ease,
    filter 1500ms ease;
}

.page-rip-leave-active {
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  box-shadow:
    -10px 0 18px rgba(61, 49, 37, 0.2),
    0 4px 24px rgba(61, 49, 37, 0.18);
  will-change: transform, opacity, filter;
}

.page-rip-leave-active::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2rem;
  width: 2.15rem;
  background-image:
    repeating-linear-gradient(
      to bottom,
      transparent 0 var(--notebook-line-start),
      var(--line-blue) var(--notebook-line-start) var(--notebook-line-end),
      transparent var(--notebook-line-end) var(--notebook-line-repeat)
    ),
    linear-gradient(180deg, #fff6e7 0%, #f6e8cb 100%);
  clip-path: polygon(
    100% 0%,
    34% 1%,
    82% 4%,
    26% 7%,
    90% 11%,
    31% 14%,
    87% 19%,
    24% 23%,
    92% 29%,
    35% 33%,
    80% 38%,
    28% 46%,
    94% 51%,
    33% 54%,
    86% 63%,
    22% 69%,
    91% 71%,
    37% 78%,
    76% 83%,
    25% 91%,
    88% 94%,
    31% 97%,
    100% 100%
  );
  filter: drop-shadow(-3px 0 3px rgba(48, 37, 26, 0.22));
}

.page-rip-leave-from {
  transform: translateX(0) rotate(0deg);
  opacity: 1;
  filter: brightness(1);
}

.page-rip-leave-to {
  transform: translateX(110%) rotate(2.2deg);
  opacity: 0.96;
  filter: brightness(0.96);
}

@media (max-width: 767px) {
  .page-transition-stage,
  .page-transition-layer {
    min-height: calc(100vh - 1rem);
  }

  .page-rip-enter-active,
  .page-rip-leave-active {
    transition:
      transform 800ms cubic-bezier(0.2, 0.85, 0.25, 1),
      opacity 800ms ease,
      filter 800ms ease;
  }

  .page-rip-leave-active {
    clip-path: inset(5rem 0 0 -3.5rem);
  }
}
</style>


