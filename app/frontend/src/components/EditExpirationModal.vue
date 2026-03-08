<script setup lang="ts">
import { ref, watch } from "vue";
import { t, type Language } from "../i18n";
import RoughButton from "./RoughButton.vue";
import RoughPanel from "./RoughPanel.vue";

const props = defineProps<{
  open: boolean;
  language: Language;
  itemName: string;
  initialExpirationDate: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [expirationDate: string | null];
}>();

const expirationDate = ref("");

function closeModal(): void {
  if (props.submitting) {
    return;
  }
  emit("close");
}

function handleSubmit(): void {
  emit("submit", expirationDate.value || null);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      expirationDate.value = props.initialExpirationDate ?? "";
    }
  }
);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-[#2d241b]/45" aria-label="Close expiration date modal" @click="closeModal" />
    <RoughPanel as="section" class="relative z-10 w-full max-w-md" fill="rgba(255, 248, 232, 0.98)">
      <h3 class="mb-1 text-3xl font-semibold text-[#3f3024]">{{ t(props.language, "editExpirationDate") }}</h3>
      <p class="mb-3 scribble-text">{{ props.itemName }}</p>

      <form class="space-y-3" @submit.prevent="handleSubmit">
        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "expirationDate") }}
          <input v-model="expirationDate" type="date" class="mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <div class="flex items-center justify-end gap-2">
          <RoughButton type="button" class="px-3 py-2 text-sm" :disabled="submitting" @click="closeModal">
            {{ t(props.language, "cancel") }}
          </RoughButton>
          <RoughButton type="submit" class="px-3 py-2 text-sm" :disabled="submitting">
            {{ t(props.language, "save") }}
          </RoughButton>
        </div>
      </form>
    </RoughPanel>
  </div>
</template>
