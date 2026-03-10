<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Household } from "@shared/models";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AiChefResponse = {
  reply: string;
};

type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

type RecordingTextResponse = {
  text: string;
};

type ErrorResponse = {
  error?: string;
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
const recorderMessage = ref("");
const recorderErrorMessage = ref("");

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
    return "border-[#7f6a55]/40 bg-[#f3ead2] text-[#574739]";
  }

  const dayDifference = getDayDifferenceFromToday(expirationDate);
  if (dayDifference < 0) {
    return "border-[#8e3f37]/45 bg-[#f4d9d5] text-[#6e2f28]";
  }
  if (dayDifference < 3) {
    return "border-[#b75f3f]/45 bg-[#fae2d5] text-[#7f432d]";
  }
  if (dayDifference < 7) {
    return "border-[#b08a43]/45 bg-[#f7ecd2] text-[#745a2b]";
  }
  return "border-[#5b8f6a]/45 bg-[#dff0e3] text-[#2f6040]";
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

function handleRecordingStart(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStarted");
}

async function handleRecordingStop(recordingResult: RecordingResult): Promise<void> {
  recorderErrorMessage.value = "";
  recorderMessage.value = "";
  aiChefError.value = "";
  aiChefStatus.value = t(props.language, "loadingRecordingText");

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
        language: props.language
      })
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, t(props.language, "failedLoadRecordingText", { status: response.status })));
    }

    const data = (await response.json()) as RecordingTextResponse;
    const trimmedText = data.text.trim();
    if (trimmedText) {
      userMessage.value = userMessage.value.trim()
        ? `${userMessage.value.trim()}\n${trimmedText}`
        : trimmedText;
    }

    aiChefStatus.value = t(props.language, "recordingTextLoaded");
  } catch (error) {
    aiChefStatus.value = "";
    aiChefError.value = error instanceof Error ? error.message : t(props.language, "failedLoadRecordingTextGeneric");
  }
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
  <RoughPanel class="w-full max-w-full space-y-4">
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="min-w-0 space-y-3">
        <div>
          <p class="mb-2 text-base font-semibold text-[#4f4134]">{{ t(props.language, "households") }}</p>
          <div class="space-y-2 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-2">
            <label
              v-for="household in households"
              :key="household.id"
              class="flex cursor-pointer items-center gap-2 rounded border border-[#7f6a55]/35 bg-[#fffdf4] p-2 text-sm"
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
          <RoughButton
            class="w-full px-3 py-2 text-xs font-medium sm:w-auto"
            @click="selectAllItems"
          >
            {{ t(props.language, "selectAll") }}
          </RoughButton>
          <RoughButton
            class="w-full px-3 py-2 text-xs font-medium sm:w-auto"
            @click="clearSelectedItems"
          >
            {{ t(props.language, "clearSelection") }}
          </RoughButton>
        </div>

        <div class="rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80">
          <RoughButton
            class="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-[#4f4134]"
            @click="toggleItemsSection"
          >
            <span>{{ t(props.language, "selectItems") }} ({{ selectedItemIds.length }}/{{ householdItems.length }})</span>
            <span class="text-xs">{{ itemsSectionOpen ? "▲" : "▼" }}</span>
          </RoughButton>

          <div v-if="itemsSectionOpen" class="max-h-56 space-y-2 overflow-auto border-t border-[#7f6a55]/25 p-2 sm:max-h-64">
            <label
              v-for="item in householdItems"
              :key="item.id"
              class="flex cursor-pointer items-start gap-2 rounded border border-[#7f6a55]/35 bg-[#fffdf4] p-2 text-sm"
            >
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4"
                :checked="isItemSelected(item.id)"
                @change="toggleItem(item.id)"
              />
              <span class="break-words">
                <strong>{{ item.quantity }} {{ item.unit }} {{ item.name }}</strong>
                <span class="text-[#6a5b4c]"> ({{ item.householdName }} / {{ item.locationName }})</span>
                <span
                  class="notebook-pill ml-1 inline-flex border px-2 py-0.5 text-xs font-medium"
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
        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "extraIngredients") }}
          <input
            v-model="extraIngredients"
            class="mt-1 w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'extraIngredientsPlaceholder')"
          />
        </label>

        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "additionalContext") }}
          <textarea
            v-model="additionalContext"
            rows="4"
            class="mt-1 w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'additionalContextPlaceholder')"
          />
        </label>
      </div>
    </div>

    <RoughPanel class="space-y-3" fill="rgba(255, 250, 239, 0.78)">
      <h3 class="text-2xl font-semibold text-[#3f3225]">{{ t(props.language, "aiChefChat") }}</h3>

      <div class="max-h-64 space-y-2 overflow-auto sm:max-h-80">
        <div
          v-for="(message, index) in chatMessages"
          :key="index"
          class="rounded-md border p-2 text-sm"
          :class="
            message.role === 'assistant'
              ? 'border-[#8da6b8] bg-[#ecf6ff]'
              : 'border-[#7f6a55]/35 bg-[#fffdf4]'
          "
        >
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6a5b4c]">
            {{ message.role === "assistant" ? t(props.language, "aiChefAssistant") : t(props.language, "you") }}
          </p>
          <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
        </div>
      </div>

      <label class="block text-base font-semibold text-[#4f4134]">
        {{ t(props.language, "aiChefMessage") }}
        <textarea
          v-model="userMessage"
          rows="3"
          class="mt-1 w-full px-3 py-2 text-sm"
          :placeholder="t(props.language, 'aiChefMessagePlaceholder')"
        />
      </label>

      <div class="flex items-center justify-between gap-3">
        <VoiceRecorderButton
          :idle-label="t(props.language, 'startRecording')"
          :recording-label="t(props.language, 'stopRecording')"
          :disabled="sendingMessage"
          @recording-start="handleRecordingStart"
          @recording-stop="handleRecordingStop"
          @recording-error="handleRecordingError"
        />

        <RoughButton
          class="ml-auto px-3 py-2 text-sm font-medium"
          :disabled="sendingMessage"
          @click="sendMessage"
        >
          {{ t(props.language, "sendToAiChef") }}
        </RoughButton>
      </div>

      <p v-if="recorderMessage" class="scribble-text text-[#1f5872]">{{ recorderMessage }}</p>
      <p v-if="recorderErrorMessage" class="scribble-text font-medium text-[#8f2e2e]">{{ recorderErrorMessage }}</p>

      <p v-if="aiChefStatus" class="scribble-text text-[#1f5872]">{{ aiChefStatus }}</p>
      <p v-if="aiChefError" class="scribble-text font-medium text-[#8f2e2e]">{{ aiChefError }}</p>
    </RoughPanel>
  </RoughPanel>
</template>
