<script setup lang="ts">
import type { Household } from "@shared/models";
import type { ParsedItem } from "../types/quickAdd";
import { t, type Language } from "../i18n";

const props = defineProps<{
  households: Household[];
  selectedHouseholdId: string;
  language: Language;
  voiceRecordingText: string;
  inputText: string;
  parsedItems: ParsedItem[];
  hasParsedItems: boolean;
  quickAddStatus: string;
  quickAddError: string;
}>();

const emit = defineEmits<{
  "household-change": [nextHouseholdId: string];
  "parsed-item-expiration-date-change": [parsedItemId: string, value: string];
  "input-text-change": [value: string];
  "load-recording-text": [];
  "parse-text": [];
  "add-items": [];
}>();

function onHouseholdChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  emit("household-change", target.value);
}

function onInputTextChange(event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  emit("input-text-change", target.value);
}

function onParsedItemExpirationDateChange(parsedItemId: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  emit("parsed-item-expiration-date-change", parsedItemId, target.value);
}
</script>

<template>
  <section class="grid w-full max-w-full gap-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-200/50 sm:p-5 lg:grid-cols-2">
    <div class="min-w-0 space-y-3">
      <label class="block text-sm font-semibold text-slate-700">
        {{ t(props.language, "household") }}
        <select
          class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          :value="selectedHouseholdId"
          @change="onHouseholdChange"
        >
          <option v-for="household in households" :key="household.id" :value="household.id">
            {{ household.name }}
          </option>
        </select>
      </label>

      <button
        class="rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        @click="emit('load-recording-text')"
        :disabled="!selectedHouseholdId"
      >
        {{ t(props.language, "getRecordingText") }}
      </button>

      <p v-if="voiceRecordingText" class="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700">
        {{ voiceRecordingText }}
      </p>
    </div>

    <div class="min-w-0 space-y-3">
      <label class="block text-sm font-semibold text-slate-700">
        {{ t(props.language, "voiceTextInput") }}
        <textarea
          :value="props.inputText"
          rows="7"
          class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          :placeholder="t(props.language, 'voiceTextPlaceholder')"
          @input="onInputTextChange"
        />
      </label>

      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          class="w-full rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 sm:w-auto"
          @click="emit('parse-text')"
        >
          {{ t(props.language, "parseText") }}
        </button>
        <button
          class="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          @click="emit('add-items')"
          :disabled="!hasParsedItems || !selectedHouseholdId"
        >
          {{ t(props.language, "addParsedItems") }}
        </button>
      </div>

      <p v-if="quickAddStatus" class="text-sm text-sky-700">{{ quickAddStatus }}</p>
      <p v-if="quickAddError" class="text-sm font-medium text-rose-700">{{ quickAddError }}</p>

      <ul v-if="parsedItems.length" class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800 sm:p-3">
        <li
          v-for="parsedItem in parsedItems"
          :key="parsedItem.id"
          class="rounded-md border border-slate-200 bg-white p-2"
        >
          <p class="break-words">{{ parsedItem.locationName }}: {{ parsedItem.quantity }} {{ parsedItem.unit }} {{ parsedItem.name }}</p>
          <label class="mt-2 block text-xs font-semibold text-slate-700">
            {{ t(props.language, "expirationDate") }}
            <input
              type="date"
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              :value="parsedItem.expirationDate ?? ''"
              @input="onParsedItemExpirationDateChange(parsedItem.id, $event)"
            />
          </label>
        </li>
      </ul>
    </div>
  </section>
</template>
