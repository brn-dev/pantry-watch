<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Household } from "@shared/models";
import { t, type Language } from "../i18n";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AiChefResponse = {
  reply: string;
};

type HouseholdItem = {
  householdId: string;
  householdName: string;
  id: string;
  name: string;
  quantity: number;
  unit: string;
  locationName: string;
  expirationDate: string | null;
};

const props = defineProps<{
  households: Household[];
  language: Language;
}>();

const selectedHouseholdIds = ref<string[]>([]);
const selectedItemIds = ref<string[]>([]);
const extraIngredients = ref("");
const additionalContext = ref("");
const userMessage = ref("");
const chatMessages = ref<ChatMessage[]>([]);
const aiChefStatus = ref("");
const aiChefError = ref("");
const sendingMessage = ref(false);
const itemsSectionOpen = ref(false);

const householdItems = computed<HouseholdItem[]>(() => {
  const selectedIdSet = new Set(selectedHouseholdIds.value);
  const selectedHouseholds = props.households.filter((household) => selectedIdSet.has(household.id));
  if (!selectedHouseholds.length) {
    return [];
  }

  return selectedHouseholds
    .flatMap((household) => {
    return household.locations.flatMap((location) => {
      return location.items.map((item) => ({
        householdId: household.id,
        householdName: household.name,
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        locationName: location.name,
        expirationDate: item.expirationDate
      }));
    });
    })
    .sort((leftItem, rightItem) => {
      const leftTimestamp = getExpirationTimestamp(leftItem.expirationDate);
      const rightTimestamp = getExpirationTimestamp(rightItem.expirationDate);
      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
      }

      return leftItem.name.localeCompare(rightItem.name);
    });
});

function parseDateOnly(value: string): Date {
  const [yearValue, monthValue, dayValue] = value.split("-").map((part) => Number(part));
  return new Date(yearValue, monthValue - 1, dayValue);
}

function getExpirationTimestamp(expirationDate: string | null): number {
  if (!expirationDate) {
    return Number.POSITIVE_INFINITY;
  }

  return parseDateOnly(expirationDate).getTime();
}

function getDayDifferenceFromToday(expirationDate: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = parseDateOnly(expirationDate);
  return Math.floor((targetDay.getTime() - today.getTime()) / 86_400_000);
}

function getExpirationLabel(expirationDate: string | null): string {
  if (!expirationDate) {
    return t(props.language, "noExpirationDate");
  }

  const dayDifference = getDayDifferenceFromToday(expirationDate);
  if (dayDifference < 0) {
    return t(props.language, "expiredDaysAgo", { days: Math.abs(dayDifference) });
  }
  if (dayDifference === 0) {
    return t(props.language, "expiresToday");
  }
  if (dayDifference === 1) {
    return t(props.language, "expiresTomorrow");
  }
  return t(props.language, "expiresInDays", { days: dayDifference });
}

function getExpirationClass(expirationDate: string | null): string {
  if (!expirationDate) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  const dayDifference = getDayDifferenceFromToday(expirationDate);
  if (dayDifference < 0) {
    return "border-purple-200 bg-purple-100 text-purple-800";
  }
  if (dayDifference < 3) {
    return "border-rose-200 bg-rose-100 text-rose-800";
  }
  if (dayDifference < 7) {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }
  return "border-emerald-200 bg-emerald-100 text-emerald-800";
}

watch(
  () => props.households,
  (nextHouseholds) => {
    if (!nextHouseholds.length) {
      selectedHouseholdIds.value = [];
      selectedItemIds.value = [];
      return;
    }

    const availableIds = new Set(nextHouseholds.map((household) => household.id));
    const retainedIds = selectedHouseholdIds.value.filter((id) => availableIds.has(id));
    selectedHouseholdIds.value = retainedIds.length ? retainedIds : nextHouseholds.map((household) => household.id);
  },
  { immediate: true }
);

watch(
  () => selectedHouseholdIds.value,
  () => {
    selectedItemIds.value = householdItems.value.map((item) => item.id);
  },
  { deep: true }
);

function toggleHousehold(householdId: string): void {
  if (selectedHouseholdIds.value.includes(householdId)) {
    selectedHouseholdIds.value = selectedHouseholdIds.value.filter((id) => id !== householdId);
    return;
  }

  selectedHouseholdIds.value = [...selectedHouseholdIds.value, householdId];
}

function isHouseholdSelected(householdId: string): boolean {
  return selectedHouseholdIds.value.includes(householdId);
}

function isItemSelected(itemId: string): boolean {
  return selectedItemIds.value.includes(itemId);
}

function toggleItem(itemId: string): void {
  if (isItemSelected(itemId)) {
    selectedItemIds.value = selectedItemIds.value.filter((id) => id !== itemId);
    return;
  }

  selectedItemIds.value = [...selectedItemIds.value, itemId];
}

function selectAllItems(): void {
  selectedItemIds.value = householdItems.value.map((item) => item.id);
}

function clearSelectedItems(): void {
  selectedItemIds.value = [];
}

function toggleItemsSection(): void {
  itemsSectionOpen.value = !itemsSectionOpen.value;
}

async function sendMessage(): Promise<void> {
  const prompt = userMessage.value.trim();
  if (!prompt) {
    aiChefError.value = t(props.language, "aiChefEnterMessage");
    return;
  }

  if (!selectedHouseholdIds.value.length) {
    aiChefError.value = t(props.language, "aiChefSelectAtLeastOneHousehold");
    return;
  }

  aiChefError.value = "";
  aiChefStatus.value = t(props.language, "aiChefThinking");
  sendingMessage.value = true;

  const nextHistory: ChatMessage[] = [...chatMessages.value, { role: "user", content: prompt }];
  chatMessages.value = nextHistory;
  userMessage.value = "";

  try {
    const response = await fetch("/api/ai-chef/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        householdIds: selectedHouseholdIds.value,
        selectedItemIds: selectedItemIds.value,
        extraIngredients: extraIngredients.value,
        context: additionalContext.value,
        message: prompt,
        history: nextHistory
      })
    });

    if (!response.ok) {
      throw new Error(t(props.language, "aiChefRequestFailed", { status: response.status }));
    }

    const data = (await response.json()) as AiChefResponse;
    chatMessages.value = [...chatMessages.value, { role: "assistant", content: data.reply }];
    aiChefStatus.value = "";
  } catch (error) {
    aiChefStatus.value = "";
    aiChefError.value = error instanceof Error ? error.message : t(props.language, "aiChefRequestFailedGeneric");
  } finally {
    sendingMessage.value = false;
  }
}
</script>

<template>
  <section class="w-full max-w-full space-y-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-200/50 sm:p-5">
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="min-w-0 space-y-3">
        <div>
          <p class="mb-2 text-sm font-semibold text-slate-700">{{ t(props.language, "households") }}</p>
          <div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            <label
              v-for="household in households"
              :key="household.id"
              class="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white p-2 text-sm"
            >
              <input
                type="checkbox"
                class="h-4 w-4"
                :checked="isHouseholdSelected(household.id)"
                @change="toggleHousehold(household.id)"
              />
              <span>{{ household.name }}</span>
            </label>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            class="w-full rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800 sm:w-auto"
            @click="selectAllItems"
          >
            {{ t(props.language, "selectAll") }}
          </button>
          <button
            class="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-200 sm:w-auto"
            @click="clearSelectedItems"
          >
            {{ t(props.language, "clearSelection") }}
          </button>
        </div>

        <div class="rounded-md border border-slate-200 bg-slate-50">
          <button
            class="flex w-full items-center justify-between rounded-t-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
            @click="toggleItemsSection"
          >
            <span>{{ t(props.language, "selectItems") }} ({{ selectedItemIds.length }}/{{ householdItems.length }})</span>
            <span class="text-xs">{{ itemsSectionOpen ? "▲" : "▼" }}</span>
          </button>

          <div v-if="itemsSectionOpen" class="max-h-56 space-y-2 overflow-auto border-t border-slate-200 p-2 sm:max-h-64">
            <label
              v-for="item in householdItems"
              :key="item.id"
              class="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm"
            >
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4"
                :checked="isItemSelected(item.id)"
                @change="toggleItem(item.id)"
              />
              <span class="break-words">
                <strong>{{ item.quantity }} {{ item.unit }} {{ item.name }}</strong>
                <span class="text-slate-500"> ({{ item.householdName }} / {{ item.locationName }})</span>
                <span
                  class="ml-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
                  :class="getExpirationClass(item.expirationDate)"
                >
                  {{ getExpirationLabel(item.expirationDate) }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div class="min-w-0 space-y-3">
        <label class="block text-sm font-semibold text-slate-700">
          {{ t(props.language, "extraIngredients") }}
          <input
            v-model="extraIngredients"
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            :placeholder="t(props.language, 'extraIngredientsPlaceholder')"
          />
        </label>

        <label class="block text-sm font-semibold text-slate-700">
          {{ t(props.language, "additionalContext") }}
          <textarea
            v-model="additionalContext"
            rows="4"
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            :placeholder="t(props.language, 'additionalContextPlaceholder')"
          />
        </label>
      </div>
    </div>

    <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <h3 class="text-sm font-semibold text-slate-800">{{ t(props.language, "aiChefChat") }}</h3>

      <div class="max-h-64 space-y-2 overflow-auto sm:max-h-80">
        <div
          v-for="(message, index) in chatMessages"
          :key="index"
          class="rounded-md border p-2 text-sm"
          :class="message.role === 'assistant' ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'"
        >
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {{ message.role === "assistant" ? t(props.language, "aiChefAssistant") : t(props.language, "you") }}
          </p>
          <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
        </div>
      </div>

      <label class="block text-sm font-semibold text-slate-700">
        {{ t(props.language, "aiChefMessage") }}
        <textarea
          v-model="userMessage"
          rows="3"
          class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          :placeholder="t(props.language, 'aiChefMessagePlaceholder')"
        />
      </label>

      <button
        class="w-full rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        :disabled="sendingMessage"
        @click="sendMessage"
      >
        {{ t(props.language, "sendToAiChef") }}
      </button>

      <p v-if="aiChefStatus" class="text-sm text-sky-700">{{ aiChefStatus }}</p>
      <p v-if="aiChefError" class="text-sm font-medium text-rose-700">{{ aiChefError }}</p>
    </div>
  </section>
</template>
