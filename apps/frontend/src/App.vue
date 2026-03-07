<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

type PantryLocation = {
  id: string;
  name: string;
  items: PantryItem[];
};

type Household = {
  id: string;
  name: string;
  locations: PantryLocation[];
};

type HouseholdsResponse = {
  households: Household[];
};

type RecordingTextResponse = {
  text: string;
};

type ParsedItem = {
  locationName: string;
  name: string;
  quantity: number;
  unit: string;
};

type ParsedItemsResponse = {
  items: ParsedItem[];
};

const households = ref<Household[]>([]);
const loadingHouseholds = ref(false);
const householdsError = ref("");

const routePath = ref(window.location.pathname);
const voiceRecordingText = ref("");
const inputText = ref("");
const parsedItems = ref<ParsedItem[]>([]);
const smartAddStatus = ref("");
const smartAddError = ref("");

const selectedHouseholdId = ref("");

const selectedHousehold = computed<Household | undefined>(() => {
  return households.value.find((household) => household.id === selectedHouseholdId.value);
});

const activePage = computed<"overview" | "smart-add">(() => {
  if (routePath.value.startsWith("/smart-add")) {
    return "smart-add";
  }
  return "overview";
});

const hasParsedItems = computed<boolean>(() => parsedItems.value.length > 0);

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function handlePopState(): void {
  routePath.value = window.location.pathname;
}

function navigateTo(path: "/overview" | "/smart-add"): void {
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
      throw new Error(`Failed to load households (${response.status})`);
    }

    const data = (await response.json()) as HouseholdsResponse;
    households.value = data.households;
    syncSelectionsToState();
  } catch (error) {
    householdsError.value = error instanceof Error ? error.message : "Failed to load households";
  } finally {
    loadingHouseholds.value = false;
  }
}

async function loadVoiceRecordingText(): Promise<void> {
  smartAddError.value = "";
  smartAddStatus.value = "Loading recording text...";

  try {
    const response = await fetch("/api/voice/recording-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ householdId: selectedHouseholdId.value })
    });

    if (!response.ok) {
      throw new Error(`Failed to load recording text (${response.status})`);
    }

    const data = (await response.json()) as RecordingTextResponse;
    voiceRecordingText.value = data.text;
    smartAddStatus.value = "Recording text loaded.";
  } catch (error) {
    smartAddStatus.value = "";
    smartAddError.value = error instanceof Error ? error.message : "Failed to load recording text";
  }
}

async function parseInputText(): Promise<void> {
  if (!inputText.value.trim()) {
    smartAddError.value = "Enter text first.";
    return;
  }

  smartAddError.value = "";
  smartAddStatus.value = "Parsing text...";

  try {
    const response = await fetch("/api/voice/text-to-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: inputText.value })
    });

    if (!response.ok) {
      throw new Error(`Failed to parse text (${response.status})`);
    }

    const data = (await response.json()) as ParsedItemsResponse;
    parsedItems.value = data.items;
    smartAddStatus.value = `Parsed ${data.items.length} item(s).`;
  } catch (error) {
    smartAddStatus.value = "";
    smartAddError.value = error instanceof Error ? error.message : "Failed to parse text";
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
    throw new Error(`Failed to create location '${locationName}' (${createResponse.status})`);
  }

  const createdLocation = (await createResponse.json()) as PantryLocation;
  locationIdsByName.set(normalizedLocationName, createdLocation.id);
  return createdLocation.id;
}

async function addParsedItemsByLocation(): Promise<void> {
  if (!selectedHouseholdId.value) {
    smartAddError.value = "Select household.";
    return;
  }

  if (!parsedItems.value.length) {
    smartAddError.value = "No parsed items to add.";
    return;
  }

  const household = selectedHousehold.value;
  if (!household) {
    smartAddError.value = "Household not found.";
    return;
  }

  smartAddError.value = "";
  smartAddStatus.value = "Adding parsed items...";

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
          unit: parsedItem.unit
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to add item '${parsedItem.name}' (${response.status})`);
      }
    }

    smartAddStatus.value = `Added ${parsedItems.value.length} item(s) to parsed locations.`;
    parsedItems.value = [];
    inputText.value = "";
    await loadHouseholds();
  } catch (error) {
    smartAddStatus.value = "";
    smartAddError.value = error instanceof Error ? error.message : "Failed to add parsed items";
  }
}

function onHouseholdChange(nextHouseholdId: string): void {
  selectedHouseholdId.value = nextHouseholdId;
}

onMounted(() => {
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
  <main class="min-h-screen bg-gradient-to-br from-emerald-50 via-lime-50 to-stone-100 text-slate-900 md:grid md:grid-cols-[240px_1fr]">
    <aside class="bg-emerald-900/95 px-4 py-5 text-emerald-50 md:min-h-screen">
      <h1 class="mb-4 text-xl font-bold tracking-tight">Pantry Watch</h1>
      <div class="flex gap-2 md:flex-col">
        <button
          class="rounded-md border px-3 py-2 text-left text-sm transition"
          :class="activePage === 'overview' ? 'border-lime-300 bg-lime-300 text-emerald-950 font-semibold' : 'border-emerald-700 bg-emerald-800 text-emerald-100 hover:bg-emerald-700'"
          @click="navigateTo('/overview')"
        >
          Overview
        </button>
        <button
          class="rounded-md border px-3 py-2 text-left text-sm transition"
          :class="activePage === 'smart-add' ? 'border-lime-300 bg-lime-300 text-emerald-950 font-semibold' : 'border-emerald-700 bg-emerald-800 text-emerald-100 hover:bg-emerald-700'"
          @click="navigateTo('/smart-add')"
        >
          Smart Add
        </button>
      </div>
    </aside>

    <section class="p-4 md:p-6">
      <header class="mb-4">
        <h2 class="text-2xl font-semibold tracking-tight">{{ activePage === "overview" ? "Overview" : "Smart Add" }}</h2>
      </header>

      <p v-if="loadingHouseholds" class="text-sm text-slate-700">Loading households...</p>
      <p v-else-if="householdsError" class="text-sm font-medium text-rose-700">{{ householdsError }}</p>

      <template v-if="!loadingHouseholds && !householdsError">
        <section v-if="activePage === 'overview'" class="space-y-4 rounded-xl border border-emerald-100 bg-white/95 p-4 shadow-sm">
          <article v-for="household in households" :key="household.id" class="space-y-3 border-b border-emerald-100 pb-4 last:border-b-0 last:pb-0">
            <div>
              <h3 class="text-lg font-semibold text-slate-900">{{ household.name }}</h3>
              <p class="text-sm text-slate-500">ID: {{ household.id }}</p>
            </div>

            <div v-if="household.locations.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div v-for="location in household.locations" :key="location.id" class="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                <h4 class="mb-2 font-semibold text-emerald-900">{{ location.name }}</h4>
                <ul v-if="location.items.length" class="list-disc space-y-1 pl-5 text-sm text-slate-800">
                  <li v-for="item in location.items" :key="item.id">
                    {{ item.quantity }} {{ item.unit }} {{ item.name }}
                  </li>
                </ul>
                <p v-else class="text-sm text-slate-500">No items yet.</p>
              </div>
            </div>
            <p v-else class="text-sm text-slate-500">No locations yet.</p>
          </article>
        </section>

        <section v-else class="grid gap-4 rounded-xl border border-emerald-100 bg-white/95 p-4 shadow-sm lg:grid-cols-2">
          <div class="space-y-3">
            <label class="block text-sm font-semibold text-slate-700">
              Household
              <select
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                :value="selectedHouseholdId"
                @change="onHouseholdChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="household in households" :key="household.id" :value="household.id">
                  {{ household.name }}
                </option>
              </select>
            </label>

            <button
              class="rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              @click="loadVoiceRecordingText"
              :disabled="!selectedHouseholdId"
            >
              Get Recording Text
            </button>

            <p v-if="voiceRecordingText" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
              {{ voiceRecordingText }}
            </p>
          </div>

          <div class="space-y-3">
            <label class="block text-sm font-semibold text-slate-700">
              Voice text input
              <textarea
                v-model="inputText"
                rows="7"
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Example: Fridge: 2 pcs tomatoes, Pantry: 3 packs pasta, 1 liter milk in Fridge"
              />
            </label>

            <div class="flex flex-wrap gap-2">
              <button
                class="rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                @click="parseInputText"
              >
                Parse Text
              </button>
              <button
                class="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                @click="addParsedItemsByLocation"
                :disabled="!hasParsedItems || !selectedHouseholdId"
              >
                Add Parsed Items
              </button>
            </div>

            <p v-if="smartAddStatus" class="text-sm text-emerald-700">{{ smartAddStatus }}</p>
            <p v-if="smartAddError" class="text-sm font-medium text-rose-700">{{ smartAddError }}</p>

            <ul v-if="parsedItems.length" class="list-disc space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 pl-8 text-sm text-slate-800">
              <li v-for="parsedItem in parsedItems" :key="`${parsedItem.locationName}-${parsedItem.name}-${parsedItem.unit}-${parsedItem.quantity}`">
                {{ parsedItem.locationName }}: {{ parsedItem.quantity }} {{ parsedItem.unit }} {{ parsedItem.name }}
              </li>
            </ul>
          </div>
        </section>
      </template>
    </section>
  </main>
</template>
