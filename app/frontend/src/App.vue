<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { Household, PantryLocation } from "@shared/models";
import OverviewPage from "./pages/OverviewPage.vue";
import QuickAddPage from "./pages/QuickAddPage.vue";
import AiChefPage from "./pages/AiChefPage.vue";
import RoughButton from "./components/RoughButton.vue";
import RoughPanel from "./components/RoughPanel.vue";
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
const isMobileSidebarOpen = ref(false);

const selectedHouseholdId = ref("");

const selectedHousehold = computed<Household | undefined>(() => {
  return households.value.find((household) => household.id === selectedHouseholdId.value);
});

const activePage = computed<"overview" | "quick-add" | "ai-chef">(() => {
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

function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  return t(language.value, key, params);
}

function updateLanguage(nextLanguage: Language): void {
  language.value = nextLanguage;
  window.localStorage.setItem("pantry-watch-language", nextLanguage);
}

function handlePopState(): void {
  routePath.value = window.location.pathname;
}

function navigateTo(path: "/overview" | "/quick-add" | "/ai-chef"): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  routePath.value = path;
}

function toggleMobileSidebar(): void {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
}

function closeMobileSidebar(): void {
  isMobileSidebarOpen.value = false;
}

function navigateFromMobile(path: "/overview" | "/quick-add" | "/ai-chef"): void {
  navigateTo(path);
  closeMobileSidebar();
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

async function loadVoiceRecordingText(): Promise<void> {
  quickAddError.value = "";
  quickAddStatus.value = translate("loadingRecordingText");

  try {
    const response = await fetch("/api/voice/recording-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ householdId: selectedHouseholdId.value })
    });

    if (!response.ok) {
      throw new Error(translate("failedLoadRecordingText", { status: response.status }));
    }

    const data = (await response.json()) as RecordingTextResponse;
    voiceRecordingText.value = data.text;
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

  quickAddError.value = "";
  quickAddStatus.value = translate("parsingText");

  try {
    const response = await fetch("/api/voice/text-to-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: inputText.value })
    });

    if (!response.ok) {
      throw new Error(translate("failedParseText", { status: response.status }));
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
  void loadHouseholds();
});

onUnmounted(() => {
  window.removeEventListener("popstate", handlePopState);
});
</script>

<template>
  <main class="min-h-screen w-full max-w-full overflow-x-hidden text-[var(--ink-main)]">
    <header class="sticky top-0 z-30 border-b border-[#6f5a47]/40 bg-[#f8efda]/94 px-4 py-3 shadow-sm backdrop-blur">
      <div class="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2">
        <RoughButton
          class="md:hidden"
          @click="toggleMobileSidebar"
          aria-label="Toggle navigation"
        >
          ☰
        </RoughButton>
        <h1 class="min-w-0 truncate text-3xl font-bold tracking-tight text-[#3e3023] sm:text-4xl">{{ translate("appTitle") }}</h1>
        <nav class="ml-4 hidden gap-2 md:flex">
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/overview')"
          >
            {{ translate("overview") }}
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/quick-add')"
          >
            {{ translate("quickAdd") }}
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/ai-chef')"
          >
            {{ translate("aiChef") }}
          </RoughButton>
        </nav>
        <div class="ml-auto hidden items-center gap-1 md:flex">
          <RoughButton
            class="px-2 py-1 text-sm leading-none"
            :fill="language === 'en' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="updateLanguage('en')"
            title="English"
            aria-label="English"
          >
            🇬🇧
          </RoughButton>
          <RoughButton
            class="px-2 py-1 text-sm leading-none"
            :fill="language === 'de' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="updateLanguage('de')"
            title="Deutsch"
            aria-label="Deutsch"
          >
            🇩🇪
          </RoughButton>
        </div>
      </div>
    </header>

    <div class="fixed inset-0 z-40 md:hidden pointer-events-none">
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <button
          v-if="isMobileSidebarOpen"
          class="pointer-events-auto absolute inset-0 bg-slate-950/45"
          @click="closeMobileSidebar"
          aria-label="Close navigation"
        />
      </Transition>

      <Transition
        enter-active-class="transition-transform duration-250 ease-out"
        enter-from-class="-translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition-transform duration-200 ease-in"
        leave-from-class="translate-x-0"
        leave-to-class="-translate-x-full"
      >
        <aside
          v-if="isMobileSidebarOpen"
          class="pointer-events-auto absolute left-0 top-0 h-full w-72 border-r border-[#6f5a47]/50 bg-[#f6ecd5] p-4 shadow-2xl"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-3xl font-bold">{{ translate("appTitle") }}</h2>
            <RoughButton class="px-2 py-1 text-sm" @click="closeMobileSidebar">✕</RoughButton>
          </div>

          <nav class="space-y-2">
            <RoughButton
              class="w-full text-left text-sm"
              :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="navigateFromMobile('/overview')"
            >
              {{ translate("overview") }}
            </RoughButton>
            <RoughButton
              class="w-full text-left text-sm"
              :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="navigateFromMobile('/quick-add')"
            >
              {{ translate("quickAdd") }}
            </RoughButton>
            <RoughButton
              class="w-full text-left text-sm"
              :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="navigateFromMobile('/ai-chef')"
            >
              {{ translate("aiChef") }}
            </RoughButton>
          </nav>

          <div class="mt-6 flex items-center gap-2">
            <RoughButton
              class="px-2 py-1 text-sm leading-none"
              :fill="language === 'en' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="updateLanguage('en')"
              title="English"
              aria-label="English"
            >
              🇬🇧
            </RoughButton>
            <RoughButton
              class="px-2 py-1 text-sm leading-none"
              :fill="language === 'de' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="updateLanguage('de')"
              title="Deutsch"
              aria-label="Deutsch"
            >
              🇩🇪
            </RoughButton>
          </div>
        </aside>
      </Transition>
    </div>

    <section class="mx-auto w-full max-w-7xl p-3 sm:p-4 md:p-6">
      <RoughPanel class="mb-4">
        <h2 class="text-3xl font-semibold tracking-tight sm:text-4xl">
          {{
            activePage === "overview"
              ? translate("overview")
              : activePage === "quick-add"
                ? translate("quickAdd")
                : translate("aiChef")
          }}
        </h2>
      </RoughPanel>

      <p v-if="loadingHouseholds" class="scribble-text">{{ translate("loadingHouseholds") }}</p>
      <p v-else-if="householdsError" class="scribble-text text-[#8f2e2e]">{{ householdsError }}</p>

      <template v-if="!loadingHouseholds && !householdsError">
        <OverviewPage
          v-if="activePage === 'overview'"
          :households="households"
          :language="language"
          :on-decrease-item="decreaseOverviewItem"
          :on-create-location="createOverviewLocation"
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
          @input-text-change="updateInputText"
          @load-recording-text="loadVoiceRecordingText"
          @parse-text="parseInputText"
          @add-items="addParsedItemsByLocation"
        />

        <AiChefPage v-else :households="households" :language="language" />
      </template>
    </section>
  </main>
</template>
