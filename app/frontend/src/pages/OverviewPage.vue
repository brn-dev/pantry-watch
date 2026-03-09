<script setup lang="ts">
import { ref } from "vue";
import type { Household, PantryItem } from "@shared/models";
import { t, type Language } from "../i18n";
import RoughButton from "../components/RoughButton.vue";
import RoughPanel from "../components/RoughPanel.vue";
import AddItemModal from "../components/AddItemModal.vue";
import AddLocationModal from "../components/AddLocationModal.vue";
import EditExpirationModal from "../components/EditExpirationModal.vue";

const processingItemIds = ref<Record<string, boolean>>({});
const processingLocationIds = ref<Record<string, boolean>>({});
const processingHouseholdIds = ref<Record<string, boolean>>({});
const collapsedLocationIds = ref<Record<string, boolean>>({});
const addItemModal = ref<{
  open: boolean;
  householdId: string;
  locationId: string;
  locationName: string;
}>({
  open: false,
  householdId: "",
  locationId: "",
  locationName: ""
});
const editItemModal = ref<{
  open: boolean;
  householdId: string;
  itemId: string;
  initialItem: {
    name: string;
    quantity: number;
    unit: string;
    expirationDate: string | null;
  } | null;
}>({
  open: false,
  householdId: "",
  itemId: "",
  initialItem: null
});
const addLocationModal = ref<{
  open: boolean;
  householdId: string;
  householdName: string;
}>({
  open: false,
  householdId: "",
  householdName: ""
});
const editLocationModal = ref<{
  open: boolean;
  householdId: string;
  householdName: string;
  locationId: string;
  initialLocationName: string;
}>({
  open: false,
  householdId: "",
  householdName: "",
  locationId: "",
  initialLocationName: ""
});
const editExpirationModal = ref<{
  open: boolean;
  householdId: string;
  itemId: string;
  itemName: string;
  expirationDate: string | null;
}>({
  open: false,
  householdId: "",
  itemId: "",
  itemName: "",
  expirationDate: null
});

const props = defineProps<{
  households: Household[];
  language: Language;
  onDecreaseItem: (householdId: string, itemId: string, currentQuantity: number) => Promise<void>;
  onCreateLocation: (householdId: string, locationName: string) => Promise<void>;
  onUpdateLocation: (householdId: string, locationId: string, locationName: string) => Promise<void>;
  onCreateItem: (
    householdId: string,
    locationId: string,
    input: { name: string; quantity: number; unit: string; expirationDate: string | null }
  ) => Promise<void>;
  onUpdateItem: (
    householdId: string,
    itemId: string,
    input: { name: string; quantity: number; unit: string; expirationDate: string | null }
  ) => Promise<void>;
  onUpdateItemExpiration: (householdId: string, itemId: string, expirationDate: string | null) => Promise<void>;
}>();

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

function sortItemsByExpirationDate(items: PantryItem[]): PantryItem[] {
  return [...items].sort((leftItem, rightItem) => {
    const timestampDifference =
      getExpirationTimestamp(leftItem.expirationDate) - getExpirationTimestamp(rightItem.expirationDate);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    return leftItem.name.localeCompare(rightItem.name);
  });
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

function isLocationCollapsed(locationId: string): boolean {
  return !!collapsedLocationIds.value[locationId];
}

function toggleLocationCollapsed(locationId: string): void {
  collapsedLocationIds.value = {
    ...collapsedLocationIds.value,
    [locationId]: !isLocationCollapsed(locationId)
  };
}

async function handleDecreaseItem(householdId: string, itemId: string, currentQuantity: number): Promise<void> {
  if (processingItemIds.value[itemId]) {
    return;
  }

  processingItemIds.value = {
    ...processingItemIds.value,
    [itemId]: true
  };

  try {
    await props.onDecreaseItem(householdId, itemId, currentQuantity);
  } finally {
    const nextState = { ...processingItemIds.value };
    delete nextState[itemId];
    processingItemIds.value = nextState;
  }
}

async function handleAddLocation(householdId: string): Promise<void> {
  const household = props.households.find((candidate) => candidate.id === householdId);
  if (!household) {
    return;
  }

  addLocationModal.value = {
    open: true,
    householdId,
    householdName: household.name
  };
}

function closeAddLocationModal(): void {
  if (processingHouseholdIds.value[addLocationModal.value.householdId]) {
    return;
  }

  addLocationModal.value = {
    open: false,
    householdId: "",
    householdName: ""
  };
}

async function handleAddLocationSubmit(locationName: string): Promise<void> {
  const householdId = addLocationModal.value.householdId;
  if (!householdId || processingHouseholdIds.value[householdId]) {
    return;
  }

  processingHouseholdIds.value = {
    ...processingHouseholdIds.value,
    [householdId]: true
  };

  try {
    await props.onCreateLocation(householdId, locationName.trim());
    closeAddLocationModal();
  } finally {
    const nextState = { ...processingHouseholdIds.value };
    delete nextState[householdId];
    processingHouseholdIds.value = nextState;
  }
}

function openEditLocationModal(householdId: string, locationId: string): void {
  if (processingLocationIds.value[locationId]) {
    return;
  }

  const household = props.households.find((candidate) => candidate.id === householdId);
  const location = household?.locations.find((candidate) => candidate.id === locationId);
  if (!household || !location) {
    return;
  }

  editLocationModal.value = {
    open: true,
    householdId,
    householdName: household.name,
    locationId,
    initialLocationName: location.name
  };
}

function closeEditLocationModal(): void {
  if (processingLocationIds.value[editLocationModal.value.locationId]) {
    return;
  }

  editLocationModal.value = {
    open: false,
    householdId: "",
    householdName: "",
    locationId: "",
    initialLocationName: ""
  };
}

async function handleEditLocationSubmit(locationName: string): Promise<void> {
  const householdId = editLocationModal.value.householdId;
  const locationId = editLocationModal.value.locationId;
  if (!householdId || !locationId || processingLocationIds.value[locationId]) {
    return;
  }

  processingLocationIds.value = {
    ...processingLocationIds.value,
    [locationId]: true
  };

  try {
    await props.onUpdateLocation(householdId, locationId, locationName.trim());
    closeEditLocationModal();
  } finally {
    const nextState = { ...processingLocationIds.value };
    delete nextState[locationId];
    processingLocationIds.value = nextState;
  }
}

async function handleAddItem(householdId: string, locationId: string): Promise<void> {
  const household = props.households.find((candidate) => candidate.id === householdId);
  const location = household?.locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    return;
  }

  addItemModal.value = {
    open: true,
    householdId,
    locationId,
    locationName: location.name
  };
}

function closeAddItemModal(): void {
  if (processingLocationIds.value[addItemModal.value.locationId]) {
    return;
  }

  addItemModal.value = {
    open: false,
    householdId: "",
    locationId: "",
    locationName: ""
  };
}

async function handleAddItemSubmit(
  input: { name: string; quantity: number; unit: string; expirationDate: string | null }
): Promise<void> {
  const householdId = addItemModal.value.householdId;
  const locationId = addItemModal.value.locationId;

  if (!householdId || !locationId || processingLocationIds.value[locationId]) {
    return;
  }

  if (processingLocationIds.value[locationId]) {
    return;
  }

  processingLocationIds.value = {
    ...processingLocationIds.value,
    [locationId]: true
  };

  try {
    await props.onCreateItem(householdId, locationId, {
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      expirationDate: input.expirationDate
    });
    closeAddItemModal();
  } finally {
    const nextState = { ...processingLocationIds.value };
    delete nextState[locationId];
    processingLocationIds.value = nextState;
  }
}

function openEditItemModal(householdId: string, item: PantryItem): void {
  if (processingItemIds.value[item.id]) {
    return;
  }

  editItemModal.value = {
    open: true,
    householdId,
    itemId: item.id,
    initialItem: {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expirationDate: item.expirationDate
    }
  };
}

function closeEditItemModal(): void {
  if (processingItemIds.value[editItemModal.value.itemId]) {
    return;
  }

  editItemModal.value = {
    open: false,
    householdId: "",
    itemId: "",
    initialItem: null
  };
}

async function handleEditItemSubmit(
  input: { name: string; quantity: number; unit: string; expirationDate: string | null }
): Promise<void> {
  const householdId = editItemModal.value.householdId;
  const itemId = editItemModal.value.itemId;
  if (!householdId || !itemId || processingItemIds.value[itemId]) {
    return;
  }

  processingItemIds.value = {
    ...processingItemIds.value,
    [itemId]: true
  };

  try {
    await props.onUpdateItem(householdId, itemId, input);
    closeEditItemModal();
  } finally {
    const nextState = { ...processingItemIds.value };
    delete nextState[itemId];
    processingItemIds.value = nextState;
  }
}

function openEditExpirationModal(householdId: string, item: PantryItem): void {
  if (processingItemIds.value[item.id]) {
    return;
  }

  editExpirationModal.value = {
    open: true,
    householdId,
    itemId: item.id,
    itemName: item.name,
    expirationDate: item.expirationDate
  };
}

function closeEditExpirationModal(): void {
  if (processingItemIds.value[editExpirationModal.value.itemId]) {
    return;
  }

  editExpirationModal.value = {
    open: false,
    householdId: "",
    itemId: "",
    itemName: "",
    expirationDate: null
  };
}

async function handleEditExpirationSubmit(expirationDate: string | null): Promise<void> {
  const householdId = editExpirationModal.value.householdId;
  const itemId = editExpirationModal.value.itemId;
  if (!householdId || !itemId || processingItemIds.value[itemId]) {
    return;
  }

  processingItemIds.value = {
    ...processingItemIds.value,
    [itemId]: true
  };

  try {
    await props.onUpdateItemExpiration(householdId, itemId, expirationDate);
    closeEditExpirationModal();
  } finally {
    const nextState = { ...processingItemIds.value };
    delete nextState[itemId];
    processingItemIds.value = nextState;
  }
}
</script>

<template>
  <RoughPanel class="w-full max-w-full space-y-4">
    <article
      v-for="household in households"
      :key="household.id"
      class="space-y-3 border-b border-[#7f6a55]/20 pb-4 last:border-b-0 last:pb-0"
    >
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-3xl font-semibold text-[#3f3024]">{{ household.name }}</h3>
        <RoughButton
          class="ml-auto px-2 py-1 text-xl leading-none"
          :disabled="!!processingHouseholdIds[household.id]"
          :title="t(props.language, 'addLocation')"
          @click="handleAddLocation(household.id)"
        >
          +
        </RoughButton>
      </div>
      <div>
        <p class="scribble-text">{{ t(props.language, "idLabel") }}: {{ household.id }}</p>
      </div>

      <div v-if="household.locations.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <RoughPanel v-for="location in household.locations" :key="location.id" class="p-1" fill="rgba(255, 251, 241, 0.78)">
          <div class="mb-2 flex items-start justify-between gap-2">
            <h4
              class="text-2xl font-semibold text-[#3c3127]"
              :title="t(props.language, 'editLocation')"
              @dblclick="openEditLocationModal(household.id, location.id)"
            >
              {{ location.name }}
            </h4>
            <div class="ml-auto flex items-center gap-1">
              <RoughButton
                class="px-2 py-1 text-xl leading-none"
                :title="isLocationCollapsed(location.id) ? 'Expand items' : 'Collapse items'"
                @click="toggleLocationCollapsed(location.id)"
              >
                {{ isLocationCollapsed(location.id) ? "▸" : "▾" }}
              </RoughButton>
              <RoughButton
                class="px-2 py-1 text-xl leading-none"
                :disabled="!!processingLocationIds[location.id]"
                :title="t(props.language, 'addItem')"
                @click="handleAddItem(household.id, location.id)"
              >
                +
              </RoughButton>
            </div>
          </div>
          <ul v-if="!isLocationCollapsed(location.id) && location.items.length" class="space-y-2 text-sm text-[#3a2f25]">
            <li
              v-for="item in sortItemsByExpirationDate(location.items)"
              :key="item.id"
              class="flex items-start justify-between gap-2 rounded-lg border border-[#7c6854]/35 bg-[#fffaf0]/90 px-2 py-1.5"
              :title="t(props.language, 'editItem')"
              @dblclick="openEditItemModal(household.id, item)"
            >
              <div class="min-w-0">
                <p class="break-words text-lg font-semibold">
                  {{ item.name }}
                  <span class="text-sm font-medium text-[#65584a]">({{ item.unit }})</span>
                </p>
                <button
                  type="button"
                  class="notebook-pill mt-1 inline-flex self-start border px-2 py-0.5 text-xs font-medium sm:self-auto"
                  :class="getExpirationClass(item.expirationDate)"
                  :disabled="!!processingItemIds[item.id]"
                  :title="t(props.language, 'editExpirationDate')"
                  @click="openEditExpirationModal(household.id, item)"
                >
                  {{ getExpirationLabel(item.expirationDate) }}
                </button>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-lg font-bold text-[#4f4234]">{{ item.quantity }}</span>
                <RoughButton
                  class="px-3 py-1 text-lg font-bold leading-none"
                  :disabled="!!processingItemIds[item.id]"
                  @dblclick.stop
                  @click="handleDecreaseItem(household.id, item.id, item.quantity)"
                >
                  -
                </RoughButton>
              </div>
            </li>
          </ul>
          <p v-else-if="!isLocationCollapsed(location.id)" class="scribble-text">{{ t(props.language, "noItemsYet") }}</p>
        </RoughPanel>
      </div>
      <p v-else class="scribble-text">{{ t(props.language, "noLocationsYet") }}</p>
    </article>
  </RoughPanel>

  <AddItemModal
    :open="addItemModal.open"
    :language="language"
    :location-name="addItemModal.locationName"
    :submitting="!!processingLocationIds[addItemModal.locationId]"
    @close="closeAddItemModal"
    @submit="handleAddItemSubmit"
  />

  <AddItemModal
    :open="editItemModal.open"
    :language="language"
    mode="edit"
    :initial-item="editItemModal.initialItem"
    :submitting="!!processingItemIds[editItemModal.itemId]"
    @close="closeEditItemModal"
    @submit="handleEditItemSubmit"
  />

  <AddLocationModal
    :open="addLocationModal.open"
    :language="language"
    :household-name="addLocationModal.householdName"
    :submitting="!!processingHouseholdIds[addLocationModal.householdId]"
    @close="closeAddLocationModal"
    @submit="handleAddLocationSubmit"
  />

  <AddLocationModal
    :open="editLocationModal.open"
    :language="language"
    mode="edit"
    :household-name="editLocationModal.householdName"
    :initial-location-name="editLocationModal.initialLocationName"
    :submitting="!!processingLocationIds[editLocationModal.locationId]"
    @close="closeEditLocationModal"
    @submit="handleEditLocationSubmit"
  />
  <EditExpirationModal
    :open="editExpirationModal.open"
    :language="language"
    :item-name="editExpirationModal.itemName"
    :initial-expiration-date="editExpirationModal.expirationDate"
    :submitting="!!processingItemIds[editExpirationModal.itemId]"
    @close="closeEditExpirationModal"
    @submit="handleEditExpirationSubmit"
  />
</template>

