<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Household } from "@shared/models";
import type { ParsedItem } from "../types/quickAdd";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";
import AddItemModal from "../components/AddItemModal.vue";
import { parseTextToItems, transcribeVoiceToText } from "../api/quickAdd";
import { createHouseholdItem, createHouseholdLocation } from "../api/households";
import { ApiRequestError } from "../api/http";
import { mapParsedItemFromApi, normalizeText, updateParsedItemById, updateParsedItemExpirationDateById } from "../utils/parsedItems";
import type { LlmModel, RecordingResult } from "../types/app";

const props = defineProps<{
  households: Household[];
  language: Language;
  llmModel: LlmModel;
}>();

const emit = defineEmits<{
  "households-updated": [];
}>();

const selectedHouseholdId = ref("");
const inputText = ref("");
const parsedItems = ref<ParsedItem[]>([]);
const quickAddStatus = ref("");
const quickAddError = ref("");
const recorderMessage = ref("");
const recorderErrorMessage = ref("");
const hasParsedItems = computed<boolean>(() => parsedItems.value.length > 0);
const selectedHousehold = computed<Household | undefined>(() => {
  return props.households.find((household) => household.id === selectedHouseholdId.value);
});

const editParsedItemModal = ref<{
  open: boolean;
  parsedItemId: string;
  initialLocationId: string;
  initialLocationName: string;
  initialItem: { name: string; quantity: number; unit: string; expirationDate: string | null } | null;
}>({
  open: false,
  parsedItemId: "",
  initialLocationId: "",
  initialLocationName: "",
  initialItem: null
});

function getSelectedHouseholdLocations(): { id: string; name: string }[] {
  const household = selectedHousehold.value;
  if (!household) {
    return [];
  }

  return household.locations.map((location) => ({
    id: location.id,
    name: location.name
  }));
}

function syncSelectedHouseholdId(): void {
  if (!props.households.length) {
    selectedHouseholdId.value = "";
    return;
  }

  const matchingHousehold = props.households.find((household) => household.id === selectedHouseholdId.value);
  selectedHouseholdId.value = matchingHousehold?.id ?? props.households[0].id;
}

watch(
  () => props.households,
  () => {
    syncSelectedHouseholdId();
  },
  { immediate: true }
);

function onHouseholdChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  selectedHouseholdId.value = target.value;
}

function onParsedItemExpirationDateChange(parsedItemId: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  parsedItems.value = updateParsedItemExpirationDateById(parsedItems.value, parsedItemId, target.value);
}

function openEditParsedItemModal(parsedItem: ParsedItem): void {
  const availableLocations = getSelectedHouseholdLocations();
  const normalizedLocationName = normalizeText(parsedItem.locationName);
  const matchedLocation = availableLocations.find((location) => normalizeText(location.name) === normalizedLocationName);

  editParsedItemModal.value = {
    open: true,
    parsedItemId: parsedItem.id,
    initialLocationId: matchedLocation?.id ?? availableLocations[0]?.id ?? "",
    initialLocationName: parsedItem.locationName,
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
    initialLocationId: "",
    initialLocationName: "",
    initialItem: null
  };
}

function handleEditParsedItemSubmit(
  input: { name: string; quantity: number; unit: string; expirationDate: string | null; locationId: string | null }
): void {
  if (!editParsedItemModal.value.parsedItemId) {
    return;
  }

  const availableLocations = getSelectedHouseholdLocations();
  const locationName =
    availableLocations.find((location) => location.id === input.locationId)?.name || editParsedItemModal.value.initialLocationName;
  if (!locationName) {
    return;
  }

  parsedItems.value = updateParsedItemById(parsedItems.value, editParsedItemModal.value.parsedItemId, {
    name: input.name,
    quantity: input.quantity,
    unit: input.unit,
    expirationDate: input.expirationDate,
    locationName
  });
  closeEditParsedItemModal();
}

function handleRecordingStart(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStarted");
}

function handleRecordingStop(recordingResult: RecordingResult): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = "";
  void transcribeVoiceRecording(recordingResult);
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

async function transcribeVoiceRecording(recordingResult: RecordingResult): Promise<void> {
  quickAddError.value = "";
  quickAddStatus.value = t(props.language, "loadingRecordingText");

  try {
    const transcript = await transcribeVoiceToText(recordingResult, props.language);
    if (!transcript.trim()) {
      quickAddStatus.value = "";
      quickAddError.value = t(props.language, "failedLoadRecordingTextGeneric");
      return;
    }
    inputText.value = transcript;
    quickAddStatus.value = t(props.language, "recordingTextLoaded");
  } catch (error) {
    quickAddStatus.value = "";
    if (error instanceof ApiRequestError) {
      quickAddError.value = t(props.language, "failedLoadRecordingText", { status: error.status });
      return;
    }
    quickAddError.value = t(props.language, "failedLoadRecordingTextGeneric");
  }
}

async function parseInputText(): Promise<void> {
  if (!inputText.value.trim()) {
    quickAddError.value = t(props.language, "enterTextFirst");
    return;
  }
  if (!selectedHousehold.value) {
    quickAddError.value = t(props.language, "householdNotFound");
    return;
  }

  quickAddError.value = "";
  quickAddStatus.value = t(props.language, "parsingText");

  try {
    const parsedItemValues = await parseTextToItems({
      text: inputText.value,
      availableLocations: selectedHousehold.value.locations.map((location) => location.name),
      currentDate: new Date().toISOString().slice(0, 10),
      llmModel: props.llmModel
    });
    parsedItems.value = parsedItemValues.map(mapParsedItemFromApi);
    quickAddStatus.value = t(props.language, "parsedItemsCount", { count: parsedItems.value.length });
  } catch (error) {
    quickAddStatus.value = "";
    if (error instanceof ApiRequestError) {
      quickAddError.value = t(props.language, "failedParseText", { status: error.status });
      return;
    }
    quickAddError.value = t(props.language, "failedParseTextGeneric");
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

  const createdLocation = await createHouseholdLocation(householdId, locationName);
  locationIdsByName.set(normalizedLocationName, createdLocation.id);
  return createdLocation.id;
}

async function addParsedItemsByLocation(): Promise<void> {
  if (!selectedHouseholdId.value) {
    quickAddError.value = t(props.language, "selectHousehold");
    return;
  }

  if (!parsedItems.value.length) {
    quickAddError.value = t(props.language, "noParsedItemsToAdd");
    return;
  }

  const household = selectedHousehold.value;
  if (!household) {
    quickAddError.value = t(props.language, "householdNotFound");
    return;
  }

  quickAddError.value = "";
  quickAddStatus.value = t(props.language, "addingParsedItems");

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

      await createHouseholdItem(selectedHouseholdId.value, locationId, {
        name: parsedItem.name,
        quantity: parsedItem.quantity,
        unit: parsedItem.unit,
        expirationDate: parsedItem.expirationDate || null
      });
    }

    quickAddStatus.value = t(props.language, "addedItemsCount", { count: parsedItems.value.length });
    parsedItems.value = [];
    inputText.value = "";
    emit("households-updated");
  } catch {
    quickAddStatus.value = "";
    quickAddError.value = t(props.language, "failedAddParsedItemsGeneric");
  }
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
          v-model="inputText"
          rows="7"
          class="mt-1 w-full px-3 py-2 text-sm"
          :placeholder="t(props.language, 'voiceTextPlaceholder')"
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
          @click="parseInputText"
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
        @click="addParsedItemsByLocation"
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
    :available-locations="getSelectedHouseholdLocations()"
    :initial-location-id="editParsedItemModal.initialLocationId"
    :submitting="false"
    @close="closeEditParsedItemModal"
    @submit="handleEditParsedItemSubmit"
  />
</template>
