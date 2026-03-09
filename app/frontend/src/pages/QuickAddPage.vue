<script setup lang="ts">
import { ref, watch } from "vue";
import type { Household } from "@shared/models";
import type { ParsedItem } from "../types/quickAdd";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";
import AddItemModal from "../components/AddItemModal.vue";

type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

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
  "parsed-item-update": [
    parsedItemId: string,
    input: { name: string; quantity: number; unit: string; expirationDate: string | null }
  ];
  "input-text-change": [value: string];
  "load-recording-text": [recordingResult: RecordingResult];
  "parse-text": [];
  "add-items": [];
}>();

const recorderMessage = ref("");
const recorderErrorMessage = ref("");
const editParsedItemModal = ref<{
  open: boolean;
  parsedItemId: string;
  initialItem: { name: string; quantity: number; unit: string; expirationDate: string | null } | null;
}>({
  open: false,
  parsedItemId: "",
  initialItem: null
});

watch(
  () => props.voiceRecordingText,
  (nextVoiceRecordingText, previousVoiceRecordingText) => {
    if (
      !nextVoiceRecordingText ||
      nextVoiceRecordingText === previousVoiceRecordingText ||
      nextVoiceRecordingText === props.inputText
    ) {
      return;
    }

    emit("input-text-change", nextVoiceRecordingText);
  },
);

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

function openEditParsedItemModal(parsedItem: ParsedItem): void {
  editParsedItemModal.value = {
    open: true,
    parsedItemId: parsedItem.id,
    initialItem: {
      name: parsedItem.name,
      quantity: parsedItem.quantity,
      unit: parsedItem.unit,
      expirationDate: parsedItem.expirationDate
    }
  };
}

function closeEditParsedItemModal(): void {
  editParsedItemModal.value = {
    open: false,
    parsedItemId: "",
    initialItem: null
  };
}

function handleEditParsedItemSubmit(input: { name: string; quantity: number; unit: string; expirationDate: string | null }): void {
  if (!editParsedItemModal.value.parsedItemId) {
    return;
  }

  emit("parsed-item-update", editParsedItemModal.value.parsedItemId, input);
  closeEditParsedItemModal();
}

function handleRecordingStart(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStarted");
}

function handleRecordingStop(recordingResult: RecordingResult): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = "";
  emit("load-recording-text", recordingResult);
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

      <div class="flex items-center justify-between gap-2">
        <VoiceRecorderButton
          :idle-label="t(props.language, 'startRecording')"
          :recording-label="t(props.language, 'stopRecording')"
          :disabled="!selectedHouseholdId"
          @recording-start="handleRecordingStart"
          @recording-stop="handleRecordingStop"
          @recording-error="handleRecordingError"
        />

        <RoughButton
          class="px-3 py-2 text-sm font-medium"
          @click="emit('parse-text')"
        >
          {{ t(props.language, "parseText") }}
        </RoughButton>
      </div>

      <p v-if="recorderMessage" class="scribble-text text-[#1f5872]">{{ recorderMessage }}</p>
      <p v-if="recorderErrorMessage" class="scribble-text font-medium text-[#8f2e2e]">{{ recorderErrorMessage }}</p>

      <p v-if="quickAddStatus" class="scribble-text text-[#1f5872]">{{ quickAddStatus }}</p>
      <p v-if="quickAddError" class="scribble-text font-medium text-[#8f2e2e]">{{ quickAddError }}</p>

      <ul v-if="parsedItems.length" class="space-y-2 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-2 text-sm text-[#3d3228] sm:p-3">
        <li
          v-for="parsedItem in parsedItems"
          :key="parsedItem.id"
          class="rounded-md border border-[#7f6a55]/35 bg-[#fffdf4] p-2"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="break-words">{{ parsedItem.locationName }}: {{ parsedItem.quantity }} {{ parsedItem.unit }} {{ parsedItem.name }}</p>
            <RoughButton
              class="px-2 py-1 text-base leading-none"
              :title="t(props.language, 'editItem')"
              @click="openEditParsedItemModal(parsedItem)"
            >
              ✎
            </RoughButton>
          </div>
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

      <RoughButton
        class="w-full px-3 py-2 text-sm font-medium sm:w-auto"
        @click="emit('add-items')"
        :disabled="!hasParsedItems || !selectedHouseholdId"
      >
        {{ t(props.language, "addParsedItems") }}
      </RoughButton>
    </div>
  </RoughPanel>

  <AddItemModal
    :open="editParsedItemModal.open"
    :language="props.language"
    mode="edit"
    :initial-item="editParsedItemModal.initialItem"
    :submitting="false"
    @close="closeEditParsedItemModal"
    @submit="handleEditParsedItemSubmit"
  />
</template>
