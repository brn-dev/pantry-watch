<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { Household, PantryLocation } from "@shared/models";
import OverviewPage from "./pages/OverviewPage.vue";
import QuickAddPage from "./pages/QuickAddPage.vue";
import AiChefPage from "./pages/AiChefPage.vue";
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
  <main class="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-slate-100 via-sky-50 to-amber-50 text-slate-900">
    <header class="sticky top-0 z-30 border-b border-slate-700 bg-slate-900/95 px-4 py-3 text-slate-100 shadow-sm backdrop-blur">
      <div class="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2">
        <button
          class="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 md:hidden"
          @click="toggleMobileSidebar"
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <h1 class="min-w-0 truncate text-lg font-extrabold tracking-tight text-white sm:text-xl">{{ translate("appTitle") }}</h1>
        <nav class="ml-4 hidden gap-2 md:flex">
          <button
            class="rounded-md border px-3 py-2 text-left text-sm transition"
            :class="
              activePage === 'overview'
                ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
            "
            @click="navigateTo('/overview')"
          >
            {{ translate("overview") }}
          </button>
          <button
            class="rounded-md border px-3 py-2 text-left text-sm transition"
            :class="
              activePage === 'quick-add'
                ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
            "
            @click="navigateTo('/quick-add')"
          >
            {{ translate("quickAdd") }}
          </button>
          <button
            class="rounded-md border px-3 py-2 text-left text-sm transition"
            :class="
              activePage === 'ai-chef'
                ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
            "
            @click="navigateTo('/ai-chef')"
          >
            {{ translate("aiChef") }}
          </button>
        </nav>
        <div class="ml-auto hidden items-center gap-1 md:flex">
          <button
            class="rounded border px-2 py-1 text-sm leading-none transition"
            :class="language === 'en' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'"
            @click="updateLanguage('en')"
            title="English"
            aria-label="English"
          >
            🇬🇧
          </button>
          <button
            class="rounded border px-2 py-1 text-sm leading-none transition"
            :class="language === 'de' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'"
            @click="updateLanguage('de')"
            title="Deutsch"
            aria-label="Deutsch"
          >
            🇩🇪
          </button>
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
          class="pointer-events-auto absolute left-0 top-0 h-full w-72 border-r border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-bold">{{ translate("appTitle") }}</h2>
            <button class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" @click="closeMobileSidebar">✕</button>
          </div>

          <nav class="space-y-2">
            <button
              class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
              :class="
                activePage === 'overview'
                  ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                  : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
              "
              @click="navigateFromMobile('/overview')"
            >
              {{ translate("overview") }}
            </button>
            <button
              class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
              :class="
                activePage === 'quick-add'
                  ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                  : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
              "
              @click="navigateFromMobile('/quick-add')"
            >
              {{ translate("quickAdd") }}
            </button>
            <button
              class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
              :class="
                activePage === 'ai-chef'
                  ? 'border-sky-300 bg-sky-300 text-slate-950 font-semibold'
                  : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
              "
              @click="navigateFromMobile('/ai-chef')"
            >
              {{ translate("aiChef") }}
            </button>
          </nav>

          <div class="mt-6 flex items-center gap-2">
            <button
              class="rounded border px-2 py-1 text-sm leading-none transition"
              :class="language === 'en' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'"
              @click="updateLanguage('en')"
              title="English"
              aria-label="English"
            >
              🇬🇧
            </button>
            <button
              class="rounded border px-2 py-1 text-sm leading-none transition"
              :class="language === 'de' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'"
              @click="updateLanguage('de')"
              title="Deutsch"
              aria-label="Deutsch"
            >
              🇩🇪
            </button>
          </div>
        </aside>
      </Transition>
    </div>

    <section class="mx-auto w-full max-w-7xl p-3 sm:p-4 md:p-6">
      <header class="mb-4">
        <h2 class="text-xl font-semibold tracking-tight sm:text-2xl">
          {{
            activePage === "overview"
              ? translate("overview")
              : activePage === "quick-add"
                ? translate("quickAdd")
                : translate("aiChef")
          }}
        </h2>
      </header>

      <p v-if="loadingHouseholds" class="text-sm text-slate-700">{{ translate("loadingHouseholds") }}</p>
      <p v-else-if="householdsError" class="text-sm font-medium text-rose-700">{{ householdsError }}</p>

      <template v-if="!loadingHouseholds && !householdsError">
        <OverviewPage
          v-if="activePage === 'overview'"
          :households="households"
          :language="language"
          :on-decrease-item="decreaseOverviewItem"
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
