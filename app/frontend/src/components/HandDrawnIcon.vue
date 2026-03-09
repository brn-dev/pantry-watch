<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: "notebook" | "microphone" | "chef-hat" | "checkmark";
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 16,
    strokeWidth: 1.9
  }
);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    class="shrink-0 text-[#4f4134]"
  >
    <template v-if="props.name === 'notebook'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" :stroke-width="props.strokeWidth" stroke="currentColor" />
      <path d="M8 3.8V20.2" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M10.8 8H17" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M10.8 12H17" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M10.8 16H15.8" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
    </template>

    <template v-else-if="props.name === 'microphone'">
      <rect x="8" y="3.5" width="8" height="11.5" rx="4" :stroke-width="props.strokeWidth" stroke="currentColor" />
      <path d="M5.5 11.2V11.9C5.5 15.5 8.4 18.4 12 18.4C15.6 18.4 18.5 15.5 18.5 11.9V11.2" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M12 18.4V21" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M9.3 21H14.7" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
    </template>

    <template v-else-if="props.name === 'chef-hat'">
      <path d="M6.5 13.8H17.5V19.8H6.5V13.8Z" :stroke-width="props.strokeWidth" stroke="currentColor" />
      <path d="M6.5 13.8C5 13.8 3.8 12.6 3.8 11.1C3.8 9.6 5 8.4 6.5 8.4C6.9 6.4 8.7 5 10.8 5C12.2 5 13.5 5.6 14.4 6.7C14.9 6.4 15.5 6.2 16.1 6.2C17.9 6.2 19.3 7.6 19.3 9.4C20.5 9.8 21.3 10.9 21.3 12.1C21.3 13.2 20.4 13.8 19.4 13.8H6.5Z" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linejoin="round" />
      <path d="M9.5 16.8H14.5" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
    </template>

    <template v-else>
      <path d="M4.5 12.7L9.7 17.5L19.5 7.5" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>
