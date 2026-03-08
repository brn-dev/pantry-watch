<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t, type Language } from "../i18n";
import RoughButton from "./RoughButton.vue";
import RoughPanel from "./RoughPanel.vue";

const props = defineProps<{
  open: boolean;
  language: Language;
  householdName: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [locationName: string];
}>();

const locationName = ref("");

const modalTitle = computed<string>(() => {
  return `${t(props.language, "addLocation")} - ${props.householdName}`;
});

function closeModal(): void {
  if (props.submitting) {
    return;
  }
  emit("close");
}

function handleSubmit(): void {
  const name = locationName.value.trim();
  if (!name) {
    return;
  }

  emit("submit", name);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      locationName.value = "";
    }
  }
);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-[#2d241b]/45" aria-label="Close add location modal" @click="closeModal" />
    <RoughPanel as="section" class="relative z-10 w-full max-w-md" fill="rgba(255, 248, 232, 0.98)">
      <h3 class="mb-3 text-3xl font-semibold text-[#3f3024]">{{ modalTitle }}</h3>

      <form class="space-y-3" @submit.prevent="handleSubmit">
        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "addLocationPrompt") }}
          <input v-model="locationName" class="mt-1 w-full px-3 py-2 text-sm" autofocus />
        </label>

        <div class="flex items-center justify-end gap-2">
          <RoughButton type="button" class="px-3 py-2 text-sm" :disabled="submitting" @click="closeModal">
            {{ t(props.language, "cancel") }}
          </RoughButton>
          <RoughButton type="submit" class="px-3 py-2 text-sm" :disabled="submitting || !locationName.trim()">
            {{ t(props.language, "addLocation") }}
          </RoughButton>
        </div>
      </form>
    </RoughPanel>
  </div>
</template>
