<script setup lang="ts">
import { computed, ref } from "vue";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import HandDrawnIcon from "../components/HandDrawnIcon.vue";
import VoiceRecorderButton from "../components/VoiceRecorderButton.vue";

type ShoppingListItem = {
  id: string;
  name: string;
  amount: string;
  shop: string;
  done: boolean;
};

type ParsedShoppingListItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  shop: string;
};

type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

type RecordingTextResponse = {
  text: string;
};

type ParsedShoppingItemsResponse = {
  items: Omit<ParsedShoppingListItem, "id">[];
};

type ErrorResponse = {
  error?: string;
};

type ActiveItemsByShop = {
  shop: string;
  items: ShoppingListItem[];
};

const props = defineProps<{
  language: Language;
}>();

const nextItemName = ref("");
const nextItemAmount = ref("");
const nextItemShop = ref("");
const shoppingItems = ref<ShoppingListItem[]>([]);
const shoppingInputText = ref("");
const parsedShoppingItems = ref<ParsedShoppingListItem[]>([]);
const shoppingParseStatus = ref("");
const shoppingParseError = ref("");
const recorderMessage = ref("");
const recorderErrorMessage = ref("");
const addMode = ref<"quick" | "manual">("quick");
const copyActiveItemsStatus = ref("");
const copyActiveItemsError = ref("");
const editModalOpen = ref(false);
const editingItemId = ref<string | null>(null);
const editItemName = ref("");
const editItemAmount = ref("");
const editItemShop = ref("");

const activeItems = computed<ShoppingListItem[]>(() => {
  return shoppingItems.value.filter((shoppingItem) => !shoppingItem.done);
});

const activeItemsByShop = computed<ActiveItemsByShop[]>(() => {
  const groupedItems = new Map<string, ShoppingListItem[]>();

  for (const shoppingItem of activeItems.value) {
    const currentItemsForShop = groupedItems.get(shoppingItem.shop) ?? [];
    groupedItems.set(shoppingItem.shop, [...currentItemsForShop, shoppingItem]);
  }

  return Array.from(groupedItems.entries())
    .sort(([leftShop], [rightShop]) => leftShop.localeCompare(rightShop))
    .map(([shop, items]) => ({ shop, items }));
});

const doneItems = computed<ShoppingListItem[]>(() => {
  return shoppingItems.value.filter((shoppingItem) => shoppingItem.done);
});

function createShoppingItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `shopping-item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createParsedShoppingItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `parsed-shopping-item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addShoppingItem(): void {
  const trimmedName = nextItemName.value.trim();
  if (!trimmedName) {
    return;
  }

  shoppingItems.value = [
    ...shoppingItems.value,
    {
      id: createShoppingItemId(),
      name: trimmedName,
      amount: nextItemAmount.value.trim(),
      shop: nextItemShop.value.trim() || "?",
      done: false
    }
  ];

  nextItemName.value = "";
  nextItemAmount.value = "";
  nextItemShop.value = "";
}

function setItemDone(itemId: string, done: boolean): void {
  shoppingItems.value = shoppingItems.value.map((shoppingItem) => {
    if (shoppingItem.id !== itemId) {
      return shoppingItem;
    }

    return {
      ...shoppingItem,
      done
    };
  });
}

function clearDoneItems(): void {
  shoppingItems.value = shoppingItems.value.filter((shoppingItem) => !shoppingItem.done);
}

function removeShoppingItem(itemId: string): void {
  shoppingItems.value = shoppingItems.value.filter((shoppingItem) => shoppingItem.id !== itemId);
}

function mapParsedShoppingItemFromApi(item: Omit<ParsedShoppingListItem, "id">): ParsedShoppingListItem {
  return {
    id: createParsedShoppingItemId(),
    ...item
  };
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

function handleRecordingStart(): void {
  recorderErrorMessage.value = "";
  recorderMessage.value = t(props.language, "recordingStarted");
}

async function handleRecordingStop(recordingResult: RecordingResult): Promise<void> {
  recorderErrorMessage.value = "";
  recorderMessage.value = "";
  shoppingParseError.value = "";
  shoppingParseStatus.value = t(props.language, "loadingRecordingText");

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
    shoppingInputText.value = data.text;
    shoppingParseStatus.value = t(props.language, "recordingTextLoaded");
  } catch (error) {
    shoppingParseStatus.value = "";
    shoppingParseError.value = error instanceof Error ? error.message : t(props.language, "failedLoadRecordingTextGeneric");
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

async function parseShoppingListText(): Promise<void> {
  if (!shoppingInputText.value.trim()) {
    shoppingParseError.value = t(props.language, "enterTextFirst");
    return;
  }

  shoppingParseError.value = "";
  shoppingParseStatus.value = t(props.language, "parsingShoppingList");

  try {
    const currentDate = new Date().toISOString().slice(0, 10);
    const response = await fetch("/api/ai/shopping-list/text-to-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: shoppingInputText.value,
        currentDate
      })
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, t(props.language, "failedParseShoppingList", { status: response.status })));
    }

    const data = (await response.json()) as ParsedShoppingItemsResponse;
    parsedShoppingItems.value = data.items.map(mapParsedShoppingItemFromApi);
    shoppingParseStatus.value = t(props.language, "parsedShoppingItemsCount", { count: parsedShoppingItems.value.length });
  } catch (error) {
    shoppingParseStatus.value = "";
    shoppingParseError.value = error instanceof Error ? error.message : t(props.language, "failedParseShoppingListGeneric");
  }
}

function addParsedShoppingItems(): void {
  if (!parsedShoppingItems.value.length) {
    shoppingParseError.value = t(props.language, "noParsedShoppingItemsToAdd");
    return;
  }

  const nextItems = parsedShoppingItems.value.map((parsedItem) => {
    const normalizedShop = parsedItem.shop.trim() || "?";
    const normalizedUnit = parsedItem.unit.trim() || "";
    const amount = `${parsedItem.quantity} ${normalizedUnit}`.trim();

    return {
      id: createShoppingItemId(),
      name: parsedItem.name.trim(),
      amount,
      shop: normalizedShop,
      done: false
    };
  });

  shoppingItems.value = [...shoppingItems.value, ...nextItems];
  shoppingParseStatus.value = t(props.language, "addedShoppingItemsCount", { count: nextItems.length });
  shoppingParseError.value = "";
  parsedShoppingItems.value = [];
  shoppingInputText.value = "";
}

function createCopyTextForActiveItems(): string {
  return activeItemsByShop.value
    .map((shopGroup) => {
      const itemLines = shopGroup.items.map((shoppingItem) =>
        shoppingItem.amount ? `- ${shoppingItem.name} (${shoppingItem.amount})` : `- ${shoppingItem.name}`
      );
      return `${shopGroup.shop}\n${itemLines.join("\n")}`;
    })
    .join("\n\n");
}

async function copyActiveItemsToClipboard(): Promise<void> {
  if (!activeItems.value.length) {
    copyActiveItemsStatus.value = "";
    copyActiveItemsError.value = t(props.language, "noActiveItemsToCopy");
    return;
  }

  copyActiveItemsStatus.value = "";
  copyActiveItemsError.value = "";

  try {
    const textToCopy = createCopyTextForActiveItems();
    await navigator.clipboard.writeText(textToCopy);
    copyActiveItemsStatus.value = t(props.language, "activeItemsCopied");
  } catch {
    copyActiveItemsError.value = t(props.language, "activeItemsCopyFailed");
  }
}

function openEditModal(shoppingItem: ShoppingListItem): void {
  editingItemId.value = shoppingItem.id;
  editItemName.value = shoppingItem.name;
  editItemAmount.value = shoppingItem.amount;
  editItemShop.value = shoppingItem.shop;
  editModalOpen.value = true;
}

function closeEditModal(): void {
  editModalOpen.value = false;
  editingItemId.value = null;
  editItemName.value = "";
  editItemAmount.value = "";
  editItemShop.value = "";
}

function saveEditedShoppingItem(): void {
  const itemId = editingItemId.value;
  if (!itemId) {
    return;
  }

  const name = editItemName.value.trim();
  if (!name) {
    return;
  }

  const amount = editItemAmount.value.trim();
  const shop = editItemShop.value.trim() || "?";

  shoppingItems.value = shoppingItems.value.map((shoppingItem) => {
    if (shoppingItem.id !== itemId) {
      return shoppingItem;
    }

    return {
      ...shoppingItem,
      name,
      amount,
      shop
    };
  });

  closeEditModal();
}
</script>

<template>
  <div class="space-y-4">
    <RoughPanel class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <RoughButton
          class="px-3 py-2 text-sm font-medium"
          :fill="addMode === 'quick' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="addMode = 'quick'"
        >
          {{ t(props.language, "quickAdd") }}
        </RoughButton>
        <RoughButton
          class="px-3 py-2 text-sm font-medium"
          :fill="addMode === 'manual' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="addMode = 'manual'"
        >
          {{ t(props.language, "manualAdd") }}
        </RoughButton>
      </div>

      <template v-if="addMode === 'quick'">
        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "shoppingListTextInput") }}
          <textarea
            v-model="shoppingInputText"
            rows="5"
            class="mt-1 w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'shoppingListTextPlaceholder')"
          />
        </label>

        <div class="flex items-center justify-between gap-2">
          <VoiceRecorderButton
            :idle-label="t(props.language, 'startRecording')"
            :recording-label="t(props.language, 'stopRecording')"
            @recording-start="handleRecordingStart"
            @recording-stop="handleRecordingStop"
            @recording-error="handleRecordingError"
          />

          <RoughButton class="px-3 py-2 text-sm font-medium" @click="parseShoppingListText">
            {{ t(props.language, "parseText") }}
          </RoughButton>
        </div>

        <p v-if="recorderMessage" class="scribble-text text-[#1f5872]">{{ recorderMessage }}</p>
        <p v-if="recorderErrorMessage" class="scribble-text font-medium text-[#8f2e2e]">{{ recorderErrorMessage }}</p>
        <p v-if="shoppingParseStatus" class="scribble-text text-[#1f5872]">{{ shoppingParseStatus }}</p>
        <p v-if="shoppingParseError" class="scribble-text font-medium text-[#8f2e2e]">{{ shoppingParseError }}</p>

        <ul v-if="parsedShoppingItems.length" class="space-y-2 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/80 p-2 text-sm text-[#3d3228] sm:p-3">
          <li
            v-for="parsedItem in parsedShoppingItems"
            :key="parsedItem.id"
            class="rounded-md border border-[#7f6a55]/35 bg-[#fffdf4] p-2"
          >
            <p class="break-words font-semibold">{{ parsedItem.name }}</p>
            <p class="text-xs text-[#5e5143]">{{ parsedItem.quantity }} {{ parsedItem.unit }} - {{ parsedItem.shop }}</p>
          </li>
        </ul>

        <RoughButton
          class="w-full px-3 text-sm font-medium sm:w-auto"
          style="margin-top: 0.5rem"
          :disabled="!parsedShoppingItems.length"
          @click="addParsedShoppingItems"
        >
          {{ t(props.language, "addParsedShoppingItems") }}
        </RoughButton>
      </template>

      <template v-else>
        <div class="mt-2 grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            v-model="nextItemName"
            type="text"
            class="w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'name')"
          />
          <input
            v-model="nextItemAmount"
            type="text"
            class="w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'amount')"
          />
          <input
            v-model="nextItemShop"
            type="text"
            class="w-full px-3 py-2 text-sm"
            :placeholder="t(props.language, 'shop')"
          />
          <RoughButton class="px-3 py-2 text-sm font-medium" @click="addShoppingItem">
            +
          </RoughButton>
        </div>
      </template>
    </RoughPanel>

    <div class="grid gap-4 lg:grid-cols-2">
      <RoughPanel class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-2xl font-semibold text-[#3f3024]">{{ t(props.language, "activeShoppingItems") }}</h3>
          <RoughButton
            class="px-3 h-10 text-sm font-medium"
            :disabled="!activeItems.length"
            :title="t(props.language, 'copyActiveItems')"
            :aria-label="t(props.language, 'copyActiveItems')"
            @click="copyActiveItemsToClipboard"
          >
            ⧉
          </RoughButton>
        </div>
        <p v-if="copyActiveItemsStatus" class="scribble-text text-[#1f5872]">{{ copyActiveItemsStatus }}</p>
        <p v-if="copyActiveItemsError" class="scribble-text font-medium text-[#8f2e2e]">{{ copyActiveItemsError }}</p>
        <div v-if="activeItemsByShop.length" class="space-y-3">
          <section
            v-for="shopGroup in activeItemsByShop"
            :key="shopGroup.shop"
            class="space-y-2"
          >
            <h4 class="text-lg font-semibold text-[#4f4134]">{{ shopGroup.shop }}</h4>
            <ul class="space-y-2">
              <li
                v-for="shoppingItem in shopGroup.items"
                :key="shoppingItem.id"
                class="flex items-center justify-between gap-3 rounded-md border border-[#7f6a55]/35 bg-[#fffaf0]/90 px-3 py-2"
              >
                <div class="min-w-0 text-sm text-[#3a2f25]">
                  <p class="break-words font-semibold">{{ shoppingItem.name }}</p>
                  <p v-if="shoppingItem.amount" class="text-xs text-[#5e5143]">{{ t(props.language, "amount") }}: {{ shoppingItem.amount }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <RoughButton
                    class="px-3 h-9 text-sm"
                    :title="t(props.language, 'editItem')"
                    :aria-label="t(props.language, 'editItem')"
                    @click="openEditModal(shoppingItem)"
                  >
                    ✎
                  </RoughButton>
                  <RoughButton class="px-3 h-9 text-sm" @click="setItemDone(shoppingItem.id, true)">✓</RoughButton>
                </div>
              </li>
            </ul>
          </section>
        </div>
        <p v-else class="scribble-text">{{ t(props.language, "noShoppingItems") }}</p>
      </RoughPanel>

      <RoughPanel class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3">
          <h3 class="text-2xl font-semibold text-[#3f3024]">{{ t(props.language, "doneShoppingItems") }}</h3>
          <RoughButton
            class="px-3  h-10 text-sm font-medium"
            :disabled="!doneItems.length"
            :title="t(props.language, 'clearDoneItems')"
            :aria-label="t(props.language, 'clearDoneItems')"
            @click="clearDoneItems"
          >
            <HandDrawnIcon name="trashbin" :size="17" />
          </RoughButton>
        </div>
        <ul v-if="doneItems.length" class="space-y-2">
          <li
            v-for="shoppingItem in doneItems"
            :key="shoppingItem.id"
            class="flex items-center justify-between gap-3 rounded-md border border-[#7f6a55]/35 bg-[#f4ecdc]/80 px-3 py-2"
          >
            <div class="min-w-0 text-sm text-[#3a2f25]">
              <p class="break-words font-semibold line-through decoration-[#7f6a55]/80">{{ shoppingItem.name }}</p>
              <p v-if="shoppingItem.amount" class="text-xs text-[#5e5143]">{{ t(props.language, "amount") }}: {{ shoppingItem.amount }}</p>
              <p class="text-xs text-[#5e5143]">{{ t(props.language, "shop") }}: {{ shoppingItem.shop }}</p>
            </div>
            <div class="flex items-center gap-2">
              <RoughButton
                class="px-3 text-sm h-9"
                :title="t(props.language, 'clearDoneItems')"
                :aria-label="t(props.language, 'clearDoneItems')"
                @click="removeShoppingItem(shoppingItem.id)"
              >
                <HandDrawnIcon name="trashbin" :size="17" />
              </RoughButton>
              <RoughButton class="px-3 h-9 text-sm" @click="setItemDone(shoppingItem.id, false)">↺</RoughButton>
            </div>
          </li>
        </ul>
        <p v-else class="scribble-text">{{ t(props.language, "noShoppingItems") }}</p>
      </RoughPanel>
    </div>

    <div v-if="editModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button class="absolute inset-0 bg-[#2d241b]/45" aria-label="Close shopping item edit modal" @click="closeEditModal" />
      <RoughPanel as="section" class="relative z-10 w-full max-w-md" fill="rgba(255, 248, 232, 0.98)">
        <h3 class="mb-3 text-3xl font-semibold text-[#3f3024]">{{ t(props.language, "editItem") }}</h3>
        <form class="space-y-3" @submit.prevent="saveEditedShoppingItem">
          <label class="block text-base font-semibold text-[#4f4134]">
            {{ t(props.language, "name") }}
            <input v-model="editItemName" type="text" class="mt-1 w-full px-3 py-2 text-sm" autofocus />
          </label>

          <label class="block text-base font-semibold text-[#4f4134]">
            {{ t(props.language, "amount") }}
            <input v-model="editItemAmount" type="text" class="mt-1 w-full px-3 py-2 text-sm" />
          </label>

          <label class="block text-base font-semibold text-[#4f4134]">
            {{ t(props.language, "shop") }}
            <input v-model="editItemShop" type="text" class="mt-1 w-full px-3 py-2 text-sm" />
          </label>

          <div class="flex items-center justify-end gap-2">
            <RoughButton type="button" class="px-3 py-2 text-sm" @click="closeEditModal">
              {{ t(props.language, "cancel") }}
            </RoughButton>
            <RoughButton type="submit" class="px-3 py-2 text-sm" :disabled="!editItemName.trim()">
              {{ t(props.language, "save") }}
            </RoughButton>
          </div>
        </form>
      </RoughPanel>
    </div>
  </div>
</template>
