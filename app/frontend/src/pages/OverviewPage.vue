<script setup lang="ts">
import { ref } from "vue";
import type { Household, PantryItem } from "@shared/models";
import { t, type Language } from "../i18n";

const processingItemIds = ref<Record<string, boolean>>({});

const props = defineProps<{
  households: Household[];
  language: Language;
  onDecreaseItem: (householdId: string, itemId: string, currentQuantity: number) => Promise<void>;
}>();

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

function sortItemsByExpirationDate(items: PantryItem[]): PantryItem[] {
  return [...items].sort((leftItem, rightItem) => {
    const timestampDifference =
      getExpirationTimestamp(leftItem.expirationDate) - getExpirationTimestamp(rightItem.expirationDate);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    return leftItem.name.localeCompare(rightItem.name);
  });
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

async function handleDecreaseItem(householdId: string, itemId: string, currentQuantity: number): Promise<void> {
  if (processingItemIds.value[itemId]) {
    return;
  }

  processingItemIds.value = {
    ...processingItemIds.value,
    [itemId]: true
  };

  try {
    await props.onDecreaseItem(householdId, itemId, currentQuantity);
  } finally {
    const nextState = { ...processingItemIds.value };
    delete nextState[itemId];
    processingItemIds.value = nextState;
  }
}
</script>

<template>
  <section class="w-full max-w-full space-y-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-200/50 sm:p-5">
    <article
      v-for="household in households"
      :key="household.id"
      class="space-y-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
    >
      <div>
        <h3 class="text-lg font-semibold text-slate-900">{{ household.name }}</h3>
        <p class="text-sm text-slate-500">{{ t(props.language, "idLabel") }}: {{ household.id }}</p>
      </div>

      <div v-if="household.locations.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="location in household.locations" :key="location.id" class="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <h4 class="mb-2 font-semibold text-sky-900">{{ location.name }}</h4>
          <ul v-if="location.items.length" class="space-y-2 text-sm text-slate-800">
            <li
              v-for="item in sortItemsByExpirationDate(location.items)"
              :key="item.id"
              class="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
            >
              <div class="min-w-0">
                <p class="break-words text-lg font-semibold">
                  {{ item.name }}
                  <span class="text-sm font-medium text-slate-500">({{ item.unit }})</span>
                </p>
                <span
                  class="mt-1 inline-flex self-start rounded-full border px-2 py-0.5 text-xs font-medium sm:self-auto"
                  :class="getExpirationClass(item.expirationDate)"
                >
                  {{ getExpirationLabel(item.expirationDate) }}
                </span>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-lg font-bold text-slate-700">{{ item.quantity }}</span>
                <button
                  class="rounded-md border border-slate-300 bg-slate-100 px-3 py-1 text-lg font-bold leading-none text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!!processingItemIds[item.id]"
                  @click="handleDecreaseItem(household.id, item.id, item.quantity)"
                >
                  -
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500">{{ t(props.language, "noItemsYet") }}</p>
        </div>
      </div>
      <p v-else class="text-sm text-slate-500">{{ t(props.language, "noLocationsYet") }}</p>
    </article>
  </section>
</template>
