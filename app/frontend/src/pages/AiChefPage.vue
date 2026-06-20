<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { AiChefChat, Household } from "@shared/models";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";
import { apiFetch } from "../api/http";
import { appendAiChefChatMessages, createAiChefChat, fetchAiChefChats } from "../api/aiChefChats";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatSelectedItemPayload = {
  name: string;
  quantity: number;
  unit: string;
  locationName: string;
  householdName: string;
  expirationDate: string | null;
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

type AiChefStreamRequest = {
  selectedItems: ChatSelectedItemPayload[];
  language: Language;
  llmModel: string;
  message: string;
  history: ChatMessage[];
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
  llmModel: string;
}>();

const selectedHouseholdIds = ref<string[]>([]);
const selectedItemIds = ref<string[]>([]);
const userMessage = ref("");
const chatMessages = ref<ChatMessage[]>([]);
const savedChats = ref<AiChefChat[]>([]);
const activeChatId = ref<string | null>(null);
const loadingSavedChats = ref(false);
const savedChatsError = ref("");
const aiChefStatus = ref("");
const aiChefError = ref("");
const sendingMessage = ref(false);
const itemsSectionOpen = ref(false);
const recorderMessage = ref("");
const recorderErrorMessage = ref("");
const initializedDefaultItemSelection = ref(false);

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
}

function renderChatMarkdown(value: string): string {
  const lines = value.split(/\r?\n/u);
  const htmlParts: string[] = [];
  let activeList: "ol" | "ul" | null = null;

  const closeList = (): void => {
    if (!activeList) {
      return;
    }

    htmlParts.push(`</${activeList}>`);
    activeList = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      closeList();
      continue;
    }

    const headingMatch = /^(?<marks>#{1,4})\s+(?<content>.+)$/u.exec(trimmedLine);
    if (headingMatch?.groups?.marks && headingMatch.groups.content) {
      closeList();
      const headingLevel = headingMatch.groups.marks.length;
      htmlParts.push(`<h${headingLevel}>${renderInlineMarkdown(headingMatch.groups.content)}</h${headingLevel}>`);
      continue;
    }

    const numberedListMatch = /^(?<number>\d+)\.\s+(?<content>.+)$/u.exec(trimmedLine);
    if (numberedListMatch?.groups?.content) {
      if (activeList !== "ol") {
        closeList();
        htmlParts.push("<ol>");
        activeList = "ol";
      }

      htmlParts.push(`<li>${renderInlineMarkdown(numberedListMatch.groups.content)}</li>`);
      continue;
    }

    const bulletListMatch = /^[-*]\s+(?<content>.+)$/u.exec(trimmedLine);
    if (bulletListMatch?.groups?.content) {
      if (activeList !== "ul") {
        closeList();
        htmlParts.push("<ul>");
        activeList = "ul";
      }

      htmlParts.push(`<li>${renderInlineMarkdown(bulletListMatch.groups.content)}</li>`);
      continue;
    }

    closeList();
    htmlParts.push(`<p>${renderInlineMarkdown(trimmedLine)}</p>`);
  }

  closeList();
  return htmlParts.join("");
}

const activeChat = computed(() => {
  if (!activeChatId.value) {
    return null;
  }

  return savedChats.value.find((chat) => chat.id === activeChatId.value) ?? null;
});

function getChatTitle(chat: AiChefChat): string {
  const firstUserMessage = chat.messages.find((message) => message.role === "user") ?? chat.messages[0];
  const title = firstUserMessage?.content.trim() ?? "";
  if (!title) {
    return t(props.language, "aiChefNewChatTitle");
  }

  return title.length > 54 ? `${title.slice(0, 51)}...` : title;
}

function getChatTimestamp(chat: AiChefChat): string {
  const timestamp = new Date(chat.updatedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  return timestamp.toLocaleString(props.language);
}

function toChatMessages(chat: AiChefChat): ChatMessage[] {
  return chat.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function setSavedChat(chat: AiChefChat): void {
  savedChats.value = [
    chat,
    ...savedChats.value.filter((savedChat) => savedChat.id !== chat.id)
  ].sort((leftChat, rightChat) => rightChat.updatedAt.localeCompare(leftChat.updatedAt));
}

async function loadSavedChats(): Promise<void> {
  loadingSavedChats.value = true;
  savedChatsError.value = "";

  try {
    savedChats.value = await fetchAiChefChats();
  } catch (error) {
    savedChatsError.value = error instanceof Error ? error.message : t(props.language, "failedLoadAiChefChatsGeneric");
  } finally {
    loadingSavedChats.value = false;
  }
}

function startNewChat(): void {
  activeChatId.value = null;
  chatMessages.value = [];
  userMessage.value = "";
  aiChefError.value = "";
  aiChefStatus.value = "";
}

function openSavedChat(chat: AiChefChat): void {
  activeChatId.value = chat.id;
  chatMessages.value = toChatMessages(chat);
  userMessage.value = "";
  aiChefError.value = "";
  aiChefStatus.value = "";
}

async function persistCompletedChatExchange(prompt: string, assistantReply: string): Promise<void> {
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  const trimmedAssistantReply = assistantReply.trim();

  if (trimmedAssistantReply) {
    messages.push({ role: "assistant", content: trimmedAssistantReply });
  }

  const savedChat = activeChatId.value
    ? await appendAiChefChatMessages(activeChatId.value, messages)
    : await createAiChefChat(messages);

  activeChatId.value = savedChat.id;
  setSavedChat(savedChat);
  chatMessages.value = toChatMessages(savedChat);
}

onMounted(() => {
  void loadSavedChats();
});

watch(
  () => props.households,
  (nextHouseholds) => {
    if (!nextHouseholds.length) {
      selectedHouseholdIds.value = [];
      selectedItemIds.value = [];
      initializedDefaultItemSelection.value = false;
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
    const itemIds = householdItems.value.map((item) => item.id);
    selectedItemIds.value = itemIds;
    initializedDefaultItemSelection.value = itemIds.length > 0;
  },
  { deep: true }
);

watch(
  () => householdItems.value.map((item) => item.id),
  (itemIds) => {
    if (initializedDefaultItemSelection.value || !itemIds.length) {
      return;
    }

    selectedItemIds.value = itemIds;
    initializedDefaultItemSelection.value = true;
  },
  { immediate: true }
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
    const response = await apiFetch("/api/ai/voice-to-text", {
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

function parseSseEvent(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/u);
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join("\n")
  };
}

async function streamAiChefReply(payload: AiChefStreamRequest, onDelta: (delta: string) => void): Promise<string> {
  const response = await apiFetch("/api/ai/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, t(props.language, "aiChefRequestFailed", { status: response.status })));
  }

  if (!response.body) {
    throw new Error(t(props.language, "aiChefRequestFailedGeneric"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawBuffer = "";
  let accumulatedReply = "";
  let doneReply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    rawBuffer += decoder.decode(value, { stream: true });
    const blocks = rawBuffer.split("\n\n");
    rawBuffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsedEvent = parseSseEvent(block);
      if (!parsedEvent) {
        continue;
      }

      let parsedData: unknown;
      try {
        parsedData = JSON.parse(parsedEvent.data);
      } catch {
        continue;
      }

      if (parsedEvent.event === "token") {
        const delta = (parsedData as { delta?: unknown }).delta;
        if (typeof delta === "string" && delta.length > 0) {
          accumulatedReply += delta;
          onDelta(delta);
        }
        continue;
      }

      if (parsedEvent.event === "done") {
        const reply = (parsedData as { reply?: unknown }).reply;
        if (typeof reply === "string") {
          doneReply = reply;
        }
        continue;
      }

      if (parsedEvent.event === "error") {
        const errorMessage = (parsedData as { error?: unknown }).error;
        throw new Error(typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : t(props.language, "aiChefRequestFailedGeneric"));
      }
    }
  }

  if (doneReply && !accumulatedReply) {
    return doneReply;
  }

  return accumulatedReply;
}

async function sendMessage(): Promise<void> {
  const prompt = userMessage.value.trim();
  if (!prompt) {
    aiChefError.value = t(props.language, "aiChefEnterMessage");
    return;
  }

  if (!props.llmModel) {
    aiChefError.value = t(props.language, "aiModelUnavailable");
    return;
  }

  if (!selectedHouseholdIds.value.length) {
    aiChefError.value = t(props.language, "aiChefSelectAtLeastOneHousehold");
    return;
  }

  aiChefError.value = "";
  aiChefStatus.value = t(props.language, "aiChefThinking");
  sendingMessage.value = true;

  const previousHistory: ChatMessage[] = [...chatMessages.value];
  const nextHistory: ChatMessage[] = [...previousHistory, { role: "user", content: prompt }];
  const selectedIdSet = new Set(selectedItemIds.value);
  const selectedItemsPayload: ChatSelectedItemPayload[] = householdItems.value
    .filter((item) => selectedIdSet.has(item.id))
    .map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      locationName: item.locationName,
      householdName: item.householdName,
      expirationDate: item.expirationDate
    }));

  chatMessages.value = [...nextHistory, { role: "assistant", content: "" }];
  userMessage.value = "";

  try {
    let currentAssistantReply = "";
    const finalReply = await streamAiChefReply(
      {
        selectedItems: selectedItemsPayload,
        language: props.language,
        llmModel: props.llmModel,
        message: prompt,
        history: previousHistory
      },
      (delta) => {
        currentAssistantReply += delta;
        chatMessages.value = [...nextHistory, { role: "assistant", content: currentAssistantReply }];
      }
    );

    if (!currentAssistantReply && finalReply) {
      currentAssistantReply = finalReply;
    }

    chatMessages.value = [...nextHistory, { role: "assistant", content: currentAssistantReply }];
    try {
      await persistCompletedChatExchange(prompt, currentAssistantReply);
    } catch (error) {
      aiChefError.value = error instanceof Error ? error.message : t(props.language, "failedSaveAiChefChatGeneric");
    }
    aiChefStatus.value = "";
  } catch (error) {
    chatMessages.value = nextHistory;
    aiChefStatus.value = "";
    aiChefError.value = error instanceof Error ? error.message : t(props.language, "aiChefRequestFailedGeneric");
  } finally {
    sendingMessage.value = false;
  }
}
</script>

<template>
  <RoughPanel class="w-full max-w-full">
    <div class="space-y-4">
    <div class="space-y-3 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-lg font-semibold text-[#3f3225]">{{ t(props.language, "aiChefPastChats") }}</h3>
          <p class="text-xs text-[#6a5b4c]">
            {{ activeChat ? t(props.language, "aiChefContinuingSelectedChat") : t(props.language, "aiChefStartingNewChat") }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <RoughButton
            class="px-3 py-2 text-xs font-medium"
            :disabled="sendingMessage"
            @click="startNewChat"
          >
            {{ t(props.language, "aiChefNewChat") }}
          </RoughButton>
          <RoughButton
            class="px-3 py-2 text-xs font-medium"
            :disabled="loadingSavedChats || sendingMessage"
            @click="loadSavedChats"
          >
            {{ t(props.language, "aiChefRefreshChats") }}
          </RoughButton>
        </div>
      </div>

      <p v-if="loadingSavedChats" class="scribble-text text-[#1f5872]">{{ t(props.language, "aiChefLoadingChats") }}</p>
      <p v-if="savedChatsError" class="scribble-text font-medium text-[#8f2e2e]">{{ savedChatsError }}</p>

      <div v-if="savedChats.length" class="mobile-scrollbar flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="chat in savedChats"
          :key="chat.id"
          type="button"
          class="min-w-52 max-w-72 rounded-md border px-3 py-2 text-left text-sm transition"
          :class="
            chat.id === activeChatId
              ? 'border-[#536f84] bg-[#ecf6ff] text-[#274357]'
              : 'border-[#7f6a55]/35 bg-[#fffdf4] text-[#4f4134]'
          "
          :disabled="sendingMessage"
          @click="openSavedChat(chat)"
        >
          <span class="block truncate font-semibold">{{ getChatTitle(chat) }}</span>
          <span class="block truncate text-xs text-[#6a5b4c]">{{ getChatTimestamp(chat) }}</span>
          <span class="block text-xs text-[#6a5b4c]">{{ t(props.language, "aiChefMessageCount", { count: chat.messages.length }) }}</span>
        </button>
      </div>

      <p v-else-if="!loadingSavedChats" class="scribble-text text-[#6a5b4c]">{{ t(props.language, "aiChefNoSavedChats") }}</p>
    </div>

    <div class="rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-2">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <p class="mb-1 text-sm font-semibold text-[#4f4134]">{{ t(props.language, "households") }}</p>
          <div class="flex flex-wrap gap-1.5">
            <label
              v-for="household in households"
              :key="household.id"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#7f6a55]/35 bg-[#fffdf4] px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                class="h-3.5 w-3.5"
                :checked="isHouseholdSelected(household.id)"
                @change="toggleHousehold(household.id)"
              />
              <span class="max-w-36 truncate">{{ household.name }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="mt-2 border-t border-[#7f6a55]/25 pt-2">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <RoughButton
            class="flex flex-1 items-center justify-between px-2.5 py-1.5 text-left text-sm font-semibold text-[#4f4134]"
            @click="toggleItemsSection"
          >
            <span>{{ t(props.language, "selectItems") }} ({{ selectedItemIds.length }}/{{ householdItems.length }})</span>
            <span class="text-xs">{{ itemsSectionOpen ? "▲" : "▼" }}</span>
          </RoughButton>

          <div class="flex flex-wrap gap-2">
            <RoughButton
              class="px-2.5 py-1.5 text-xs font-medium"
              @click="selectAllItems"
            >
              {{ t(props.language, "selectAll") }}
            </RoughButton>
            <RoughButton
              class="px-2.5 py-1.5 text-xs font-medium"
              @click="clearSelectedItems"
            >
              {{ t(props.language, "clearSelection") }}
            </RoughButton>
          </div>
        </div>

        <div v-if="itemsSectionOpen" class="mobile-scrollbar mt-2 grid max-h-48 gap-1.5 overflow-auto sm:max-h-56 sm:grid-cols-2 xl:grid-cols-3">
          <label
            v-for="item in householdItems"
            :key="item.id"
            class="flex cursor-pointer items-start gap-1.5 rounded border border-[#7f6a55]/35 bg-[#fffdf4] px-2 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              class="mt-0.5 h-3.5 w-3.5 shrink-0"
              :checked="isItemSelected(item.id)"
              @change="toggleItem(item.id)"
            />
            <span class="min-w-0">
              <span class="block truncate font-semibold">{{ item.quantity }} {{ item.unit }} {{ item.name }}</span>
              <span class="block truncate text-[#6a5b4c]">{{ item.householdName }} / {{ item.locationName }}</span>
              <span
                class="notebook-pill mt-1 inline-flex max-w-full border px-1.5 py-0.5 text-[0.68rem] font-medium"
                :class="getExpirationClass(item.expirationDate)"
              >
                {{ getExpirationLabel(item.expirationDate) }}
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>

    <RoughPanel class="space-y-3" fill="rgba(255, 250, 239, 0.78)">
      <h3 class="text-2xl font-semibold text-[#3f3225]">{{ t(props.language, "aiChefChat") }}</h3>

      <div
        class="mobile-scrollbar max-h-64 space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-[#7f6a55]/35 bg-[#fffdf4]/80 p-2 sm:max-h-80"
      >
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
          <div
            class="chat-markdown break-words"
            v-html="renderChatMarkdown(message.content)"
          />
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
          :disabled="sendingMessage || !llmModel"
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
    </div>
  </RoughPanel>
</template>

<style scoped>
.chat-markdown :deep(p) {
  margin: 0 0 0.6rem;
}

.chat-markdown :deep(p:last-child),
.chat-markdown :deep(ol:last-child),
.chat-markdown :deep(ul:last-child),
.chat-markdown :deep(h1:last-child),
.chat-markdown :deep(h2:last-child),
.chat-markdown :deep(h3:last-child),
.chat-markdown :deep(h4:last-child) {
  margin-bottom: 0;
}

.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  margin: 0.7rem 0 0.35rem;
  color: #3f3225;
  font-weight: 700;
  line-height: 1.25;
}

.chat-markdown :deep(h1) {
  font-size: 1.15rem;
}

.chat-markdown :deep(h2) {
  font-size: 1.05rem;
}

.chat-markdown :deep(h3) {
  font-size: 1rem;
}

.chat-markdown :deep(h4) {
  font-size: 0.95rem;
}

.chat-markdown :deep(ol),
.chat-markdown :deep(ul) {
  margin: 0 0 0.6rem 1.25rem;
}

.chat-markdown :deep(ol) {
  list-style: decimal;
}

.chat-markdown :deep(ul) {
  list-style: disc;
}

.chat-markdown :deep(li) {
  margin: 0.2rem 0;
  padding-left: 0.15rem;
}

.chat-markdown :deep(strong) {
  font-weight: 700;
}

.chat-markdown :deep(code) {
  border: 1px solid rgba(127, 106, 85, 0.35);
  border-radius: 4px;
  background: rgba(255, 250, 240, 0.8);
  padding: 0.05rem 0.25rem;
  font-size: 0.92em;
}
</style>
