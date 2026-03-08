<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t, type Language } from "../i18n";
import RoughButton from "./RoughButton.vue";
import RoughPanel from "./RoughPanel.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    language: Language;
    locationName?: string;
    submitting: boolean;
    mode?: "create" | "edit";
    initialItem?: {
      name: string;
      quantity: number;
      unit: string;
      expirationDate: string | null;
    } | null;
  }>(),
  {
    locationName: "",
    mode: "create",
    initialItem: null
  }
);

const emit = defineEmits<{
  close: [];
  submit: [input: { name: string; quantity: number; unit: string; expirationDate: string | null }];
}>();

const itemName = ref("");
const quantityInput = ref("1");
const unit = ref("pcs");
const expirationDate = ref("");

const modalTitle = computed<string>(() => {
  if (props.mode === "edit") {
    return `${t(props.language, "editItem")} - ${props.initialItem?.name ?? ""}`;
  }

  return `${t(props.language, "addItem")} - ${props.locationName}`;
});

function resetForm(): void {
  itemName.value = "";
  quantityInput.value = "1";
  unit.value = "pcs";
  expirationDate.value = "";
}

function closeModal(): void {
  if (props.submitting) {
    return;
  }
  emit("close");
}

function handleSubmit(): void {
  const name = itemName.value.trim();
  if (!name) {
    return;
  }

  const parsedQuantity = Number(quantityInput.value);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const normalizedUnit = unit.value.trim() || "pcs";

  emit("submit", {
    name,
    quantity,
    unit: normalizedUnit,
    expirationDate: expirationDate.value || null
  });
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.mode === "edit" && props.initialItem) {
        itemName.value = props.initialItem.name;
        quantityInput.value = String(props.initialItem.quantity);
        unit.value = props.initialItem.unit;
        expirationDate.value = props.initialItem.expirationDate ?? "";
        return;
      }

      resetForm();
    }
  }
);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-[#2d241b]/45" aria-label="Close add item modal" @click="closeModal" />
    <RoughPanel as="section" class="relative z-10 w-full max-w-md" fill="rgba(255, 248, 232, 0.98)">
      <h3 class="mb-3 text-3xl font-semibold text-[#3f3024]">{{ modalTitle }}</h3>

      <form class="space-y-3" @submit.prevent="handleSubmit">
        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "addItemNamePrompt") }}
          <input v-model="itemName" class="mt-1 w-full px-3 py-2 text-sm" autofocus />
        </label>

        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "addItemQuantityPrompt") }}
          <input v-model="quantityInput" type="number" min="1" step="1" class="mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "addItemUnitPrompt") }}
          <input v-model="unit" class="mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <label class="block text-base font-semibold text-[#4f4134]">
          {{ t(props.language, "expirationDate") }}
          <input v-model="expirationDate" type="date" class="mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <div class="flex items-center justify-end gap-2">
          <RoughButton type="button" class="px-3 py-2 text-sm" :disabled="submitting" @click="closeModal">
            {{ t(props.language, "cancel") }}
          </RoughButton>
          <RoughButton type="submit" class="px-3 py-2 text-sm" :disabled="submitting || !itemName.trim()">
            {{ props.mode === "edit" ? t(props.language, "save") : t(props.language, "addItem") }}
          </RoughButton>
        </div>
      </form>
    </RoughPanel>
  </div>
</template>
