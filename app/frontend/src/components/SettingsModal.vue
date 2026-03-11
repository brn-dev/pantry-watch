<script setup lang="ts">
import type { Language, TranslationKey } from "../i18n";
import { t } from "../i18n";
import FlagIcon from "./FlagIcon.vue";
import RoughButton from "./RoughButton.vue";
import RoughPanel from "./RoughPanel.vue";

const props = defineProps<{
  open: boolean;
  language: Language;
  selectedLlmModel: string;
  availableLlmModels: string[];
}>();

const emit = defineEmits<{
  close: [];
  languageChange: [nextLanguage: Language];
  llmModelChange: [nextModel: string];
}>();

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

function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  return t(props.language, key, params);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-[#3e3023]/35 p-3 pt-20 sm:items-center sm:p-6"
    @click.self="closeModal"
  >
    <RoughPanel
      as="section"
      class="w-full max-w-sm p-4 sm:p-5"
      fill="rgba(255, 252, 240, 0.98)"
      role="dialog"
      aria-modal="true"
      :aria-label="translate('settings')"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h3 class="text-xl font-semibold tracking-tight text-[#3e3023]">
          {{ translate("settings") }}
        </h3>
        <RoughButton class="px-2 py-1 text-sm leading-none" @click="closeModal">
          {{ translate("cancel") }}
        </RoughButton>
      </div>
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
    </RoughPanel>
  </div>
</template>
