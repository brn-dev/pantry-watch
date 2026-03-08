<script setup lang="ts">
import { ref } from "vue";
import type { Household } from "@shared/models";
import type { ParsedItem } from "../types/quickAdd";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";

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

const recorderMessage = ref("");
const recorderErrorMessage = ref("");

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

function handleRecordingStart(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStarted");
}

function handleRecordingStop(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStopped");
  emit("load-recording-text");
}

function handleRecordingError(code: "not_supported" | "permission_denied" | "recording_failed"): void {
  recorderMessage.value = "";

  if (code === "not_supported") {
    recorderErrorMessage.value = t(props.language, "recordingNotSupported");
    return;
  }

  if (code === "permission_denied") {
    recorderErrorMessage.value = t(props.language, "recordingPermissionDenied");
    return;
  }

  recorderErrorMessage.value = t(props.language, "recordingFailed");
}
</script>

<template>
  <RoughPanel class="grid w-full max-w-full gap-4 lg:grid-cols-2">
    <div class="min-w-0 space-y-3">
      <label class="block text-base font-semibold text-[#4f4134]">
        {{ t(props.language, "household") }}
        <select
          class="mt-1 w-full px-3 py-2 text-sm"
          :value="selectedHouseholdId"
          @change="onHouseholdChange"
        >
          <option v-for="household in households" :key="household.id" :value="household.id">
            {{ household.name }}
          </option>
        </select>
      </label>

      <p v-if="voiceRecordingText" class="rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/90 p-3 text-sm text-[#3e3227]">
        {{ voiceRecordingText }}
      </p>
    </div>

    <div class="min-w-0 space-y-3">
      <label class="block text-base font-semibold text-[#4f4134]">
        {{ t(props.language, "voiceTextInput") }}
        <textarea
          :value="props.inputText"
          rows="7"
          class="mt-1 w-full px-3 py-2 text-sm"
          :placeholder="t(props.language, 'voiceTextPlaceholder')"
          @input="onInputTextChange"
        />
      </label>

      <VoiceRecorderButton
        :idle-label="t(props.language, 'startRecording')"
        :recording-label="t(props.language, 'stopRecording')"
        :disabled="!selectedHouseholdId"
        @recording-start="handleRecordingStart"
        @recording-stop="handleRecordingStop"
        @recording-error="handleRecordingError"
      />

      <p v-if="recorderMessage" class="scribble-text text-[#1f5872]">{{ recorderMessage }}</p>
      <p v-if="recorderErrorMessage" class="scribble-text font-medium text-[#8f2e2e]">{{ recorderErrorMessage }}</p>

      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <RoughButton
          class="w-full px-3 py-2 text-sm font-medium sm:w-auto"
          @click="emit('parse-text')"
        >
          {{ t(props.language, "parseText") }}
        </RoughButton>
        <RoughButton
          class="w-full px-3 py-2 text-sm font-medium sm:w-auto"
          @click="emit('add-items')"
          :disabled="!hasParsedItems || !selectedHouseholdId"
        >
          {{ t(props.language, "addParsedItems") }}
        </RoughButton>
      </div>

      <p v-if="quickAddStatus" class="scribble-text text-[#1f5872]">{{ quickAddStatus }}</p>
      <p v-if="quickAddError" class="scribble-text font-medium text-[#8f2e2e]">{{ quickAddError }}</p>

      <ul v-if="parsedItems.length" class="space-y-2 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-2 text-sm text-[#3d3228] sm:p-3">
        <li
          v-for="parsedItem in parsedItems"
          :key="parsedItem.id"
          class="rounded-md border border-[#7f6a55]/35 bg-[#fffdf4] p-2"
        >
          <p class="break-words">{{ parsedItem.locationName }}: {{ parsedItem.quantity }} {{ parsedItem.unit }} {{ parsedItem.name }}</p>
          <label class="mt-2 block text-xs font-semibold text-[#4f4134]">
            {{ t(props.language, "expirationDate") }}
            <input
              type="date"
              class="mt-1 w-full px-2 py-1 text-sm"
              :value="parsedItem.expirationDate ?? ''"
              @input="onParsedItemExpirationDateChange(parsedItem.id, $event)"
            />
          </label>
        </li>
      </ul>
    </div>
  </RoughPanel>
</template>
