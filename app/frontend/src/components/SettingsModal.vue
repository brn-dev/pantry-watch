<script setup lang="ts">
import { ref, watch } from "vue";
import type { Language, TranslationKey } from "../i18n";
import { t } from "../i18n";
import { checkHouseholdToken } from "../api/auth";
import type { HouseholdCredential } from "../utils/localPersistence";
import FlagIcon from "./FlagIcon.vue";
import RoughButton from "./RoughButton.vue";
import RoughPanel from "./RoughPanel.vue";

const props = defineProps<{
  open: boolean;
  language: Language;
  selectedLlmModel: string;
  availableLlmModels: string[];
  householdCredentials: HouseholdCredential[];
}>();

const emit = defineEmits<{
  close: [];
  languageChange: [nextLanguage: Language];
  llmModelChange: [nextModel: string];
  householdCredentialsApply: [credentials: HouseholdCredential[]];
}>();

const editableHouseholdCredentials = ref<HouseholdCredential[]>([]);
const shouldSyncEditableCredentials = ref(true);
const applyingCredentials = ref(false);
const credentialValidationStates = ref<Record<number, "checking" | "valid" | "invalid">>({});

watch(
  () => [props.open, props.householdCredentials] as const,
  ([isOpen]) => {
    if (!isOpen) {
      shouldSyncEditableCredentials.value = true;
      return;
    }

    if (!shouldSyncEditableCredentials.value) {
      return;
    }

    editableHouseholdCredentials.value = props.householdCredentials.map((credential) => ({ ...credential }));
  },
  { immediate: true }
);

function closeModal(): void {
  emit("close");
}

function updateLanguage(nextLanguage: Language): void {
  emit("languageChange", nextLanguage);
}

function updateLlmModel(event: Event): void {
  const nextModel = (event.target as HTMLSelectElement | null)?.value;
  if (!nextModel) {
    return;
  }

  emit("llmModelChange", nextModel);
}

function updateCredentialHouseholdId(index: number, event: Event): void {
  shouldSyncEditableCredentials.value = false;
  clearCredentialValidationState(index);
  const householdId = (event.target as HTMLInputElement | null)?.value ?? "";
  editableHouseholdCredentials.value = editableHouseholdCredentials.value.map((credential, credentialIndex) => {
    if (credentialIndex !== index) {
      return credential;
    }

    return {
      ...credential,
      householdId
    };
  });
}

function updateCredentialAccessToken(index: number, event: Event): void {
  shouldSyncEditableCredentials.value = false;
  clearCredentialValidationState(index);
  const accessToken = (event.target as HTMLInputElement | null)?.value ?? "";
  editableHouseholdCredentials.value = editableHouseholdCredentials.value.map((credential, credentialIndex) => {
    if (credentialIndex !== index) {
      return credential;
    }

    return {
      ...credential,
      accessToken
    };
  });
}

function addHouseholdCredential(): void {
  shouldSyncEditableCredentials.value = false;
  editableHouseholdCredentials.value = [...editableHouseholdCredentials.value, { householdId: "", accessToken: "" }];
}

function removeHouseholdCredential(index: number): void {
  shouldSyncEditableCredentials.value = false;
  editableHouseholdCredentials.value = editableHouseholdCredentials.value.filter(
    (_credential, credentialIndex) => credentialIndex !== index
  );
  credentialValidationStates.value = {};
  void applyHouseholdCredentials();
}

function clearCredentialValidationState(index: number): void {
  const nextStates = { ...credentialValidationStates.value };
  delete nextStates[index];
  credentialValidationStates.value = nextStates;
}

async function validateCredential(index: number, credential: HouseholdCredential): Promise<HouseholdCredential | null> {
  const normalizedCredential = {
    householdId: credential.householdId.trim(),
    accessToken: credential.accessToken
  };

  if (!normalizedCredential.householdId && !normalizedCredential.accessToken) {
    return null;
  }

  if (!normalizedCredential.householdId || !normalizedCredential.accessToken) {
    credentialValidationStates.value = {
      ...credentialValidationStates.value,
      [index]: "invalid"
    };
    return null;
  }

  credentialValidationStates.value = {
    ...credentialValidationStates.value,
    [index]: "checking"
  };

  const isValid = await checkHouseholdToken(normalizedCredential);
  credentialValidationStates.value = {
    ...credentialValidationStates.value,
    [index]: isValid ? "valid" : "invalid"
  };

  return isValid ? normalizedCredential : null;
}

async function applyHouseholdCredentials(): Promise<void> {
  if (applyingCredentials.value) {
    return;
  }

  applyingCredentials.value = true;

  try {
    credentialValidationStates.value = {};
    const validationResults = await Promise.all(
      editableHouseholdCredentials.value.map((credential, index) => validateCredential(index, credential))
    );
    emit(
      "householdCredentialsApply",
      validationResults.filter((credential): credential is HouseholdCredential => credential !== null)
    );
  } finally {
    applyingCredentials.value = false;
  }
}

function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  return t(props.language, key, params);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-[#3e3023]/35 p-3 pt-20 sm:items-center sm:p-6 sm:pt-6"
    @click.self="closeModal"
  >
    <RoughPanel
      as="section"
      class="settings-modal-panel h-[calc(100dvh-6rem)] w-full max-w-sm overflow-hidden p-0 sm:h-[min(42rem,calc(100dvh-3rem))]"
      fill="rgba(255, 252, 240, 0.98)"
      role="dialog"
      aria-modal="true"
      :aria-label="translate('settings')"
    >
      <div class="flex h-full min-h-0 flex-col p-4 sm:p-5">
        <div class="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h3 class="text-xl font-semibold tracking-tight text-[#3e3023]">
            {{ translate("settings") }}
          </h3>
          <RoughButton class="px-2 py-1 text-sm leading-none" @click="closeModal">
            {{ translate("cancel") }}
          </RoughButton>
        </div>

        <div class="mobile-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <p class="mb-2 text-sm font-semibold text-[#4f4134]">
            {{ translate("language") }}
          </p>
          <div class="flex gap-2">
            <RoughButton
              class="min-w-[7.5rem] px-2 py-1 text-sm"
              :fill="language === 'en' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="updateLanguage('en')"
              :aria-label="translate('english')"
            >
              <span class="inline-flex items-center gap-2">
                <FlagIcon language="en" />
                <span>{{ translate("english") }}</span>
              </span>
            </RoughButton>
            <RoughButton
              class="min-w-[7.5rem] px-2 py-1 text-sm"
              :fill="language === 'de' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
              @click="updateLanguage('de')"
              :aria-label="translate('german')"
            >
              <span class="inline-flex items-center gap-2">
                <FlagIcon language="de" />
                <span>{{ translate("german") }}</span>
              </span>
            </RoughButton>
          </div>
          <label class="mt-4 block text-sm font-semibold text-[#4f4134]" for="llm-model-select">LLM</label>
          <select
            id="llm-model-select"
            class="mt-2 w-full rounded-md border border-[#6f5a47]/45 bg-[#fffdf5] px-3 py-2 text-sm text-[#3e3023] outline-none focus:border-[#6f5a47]"
            :value="selectedLlmModel"
            @change="updateLlmModel"
          >
            <option v-for="model in availableLlmModels" :key="model" :value="model">
              {{ model }}
            </option>
          </select>

          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-[#4f4134]">
                {{ translate("accessTokens") }}
              </p>
              <RoughButton class="px-2 py-1 text-sm" @click="addHouseholdCredential">
                {{ translate("add") }}
              </RoughButton>
            </div>

            <div v-if="editableHouseholdCredentials.length" class="space-y-3">
              <div
                v-for="(credential, index) in editableHouseholdCredentials"
                :key="index"
                class="space-y-2 rounded-md border border-[#6f5a47]/35 bg-[#fffaf0]/80 p-2"
              >
                <label class="block text-xs font-semibold text-[#4f4134]" :for="`household-id-${index}`">
                  {{ translate("householdId") }}
                </label>
                <input
                  :id="`household-id-${index}`"
                  class="w-full rounded-md border border-[#6f5a47]/45 bg-[#fffdf5] px-3 py-2 text-sm text-[#3e3023] outline-none focus:border-[#6f5a47]"
                  :value="credential.householdId"
                  autocomplete="username"
                  @input="updateCredentialHouseholdId(index, $event)"
                  @keydown.enter.prevent="applyHouseholdCredentials"
                />

                <label class="block text-xs font-semibold text-[#4f4134]" :for="`access-token-${index}`">
                  {{ translate("accessToken") }}
                </label>
                <input
                  :id="`access-token-${index}`"
                  class="w-full rounded-md border border-[#6f5a47]/45 bg-[#fffdf5] px-3 py-2 text-sm text-[#3e3023] outline-none focus:border-[#6f5a47]"
                  :value="credential.accessToken"
                  type="password"
                  autocomplete="current-password"
                  @input="updateCredentialAccessToken(index, $event)"
                  @keydown.enter.prevent="applyHouseholdCredentials"
                />

                <div class="flex items-center justify-between gap-2">
                  <RoughButton class="px-2 py-1 text-sm" @click="removeHouseholdCredential(index)">
                    {{ translate("remove") }}
                  </RoughButton>
                  <span
                    v-if="credentialValidationStates[index] === 'valid'"
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#5b8f6a]/45 bg-[#dff0e3] text-base font-bold text-[#2f6040]"
                    :title="translate('tokenValid')"
                    :aria-label="translate('tokenValid')"
                  >
                    &#10003;
                  </span>
                  <span
                    v-else-if="credentialValidationStates[index] === 'invalid'"
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#8e3f37]/45 bg-[#f4d9d5] text-base font-bold text-[#6e2f28]"
                    :title="translate('tokenInvalid')"
                    :aria-label="translate('tokenInvalid')"
                  >
                    &#10005;
                  </span>
                  <span
                    v-else-if="credentialValidationStates[index] === 'checking'"
                    class="scribble-text text-sm text-[#1f5872]"
                  >
                    {{ translate("checkingToken") }}
                  </span>
                </div>
              </div>
            </div>

            <p v-else class="scribble-text text-sm">
              {{ translate("noAccessTokens") }}
            </p>
          </div>
        </div>

        <div class="mt-3 flex shrink-0 items-center gap-2">
          <RoughButton class="min-w-0 flex-1 px-3 py-2 text-sm font-semibold" :disabled="applyingCredentials" @click="applyHouseholdCredentials">
            {{ translate("applyTokens") }}
          </RoughButton>
        </div>
      </div>
    </RoughPanel>
  </div>
</template>

<style scoped>
:deep(.settings-modal-panel > .rough-panel-content) {
  height: 100%;
  min-height: 0;
}
</style>
