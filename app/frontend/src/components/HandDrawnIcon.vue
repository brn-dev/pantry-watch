<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: "notebook" | "microphone" | "chef-hat" | "checkmark" | "pencil" | "clipboard" | "cog" | "trashbin";
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

    <template v-else-if="props.name === 'pencil'">
      <path d="M5.3 18.6L6.6 14L15.3 5.3C16 4.6 17.2 4.6 17.9 5.3L18.7 6.1C19.4 6.8 19.4 8 18.7 8.7L10 17.4L5.3 18.6Z" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linejoin="round" />
      <path d="M14 6.6L17.4 10" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M7.4 15.2L9.7 17.5" :stroke-width="Math.max(props.strokeWidth - 0.55, 1.05)" stroke="currentColor" stroke-linecap="round" />
      <path d="M5.9 18L6.8 17.1" :stroke-width="Math.max(props.strokeWidth - 0.55, 1.05)" stroke="currentColor" stroke-linecap="round" />
    </template>

    <template v-else-if="props.name === 'clipboard'">
      <rect x="6.2" y="4.8" width="11.6" height="15.8" rx="2.2" :stroke-width="props.strokeWidth" stroke="currentColor" />
      <path d="M10 4.8C10 3.9 10.8 3.2 11.7 3.2H12.3C13.2 3.2 14 3.9 14 4.8V6H10V4.8Z" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linejoin="round" />
      <path d="M9.1 9.6H14.9" :stroke-width="Math.max(props.strokeWidth - 0.35, 1.1)" stroke="currentColor" stroke-linecap="round" />
      <path d="M9.1 12H14.9" :stroke-width="Math.max(props.strokeWidth - 0.35, 1.1)" stroke="currentColor" stroke-linecap="round" />
      <path d="M9.3 16.1L11.2 17.9L14.9 14.2" :stroke-width="Math.max(props.strokeWidth - 0.2, 1.2)" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="props.name === 'cog'">
      <g transform="scale(0.046875)">
        <path
          d="m301.9,501h-91.7c-11.3,0-20.4-9.1-20.4-20.4v-34.7c-7.2-2.5-14.2-5.4-21.1-8.8l-24.6,24.6c-8,8-20.9,8-28.9,0l-64.8-64.8c-8-8-8-20.9 0-28.9l24.6-24.6c-3.3-6.9-6.3-13.9-8.8-21.1h-34.8c-11.3,0-20.4-9.1-20.4-20.4v-91.7c0-11.3 9.1-20.4 20.4-20.4h34.7c2.5-7.2 5.4-14.2 8.8-21.1l-24.5-24.7c-8-8-8-20.9 0-28.9l64.8-64.8c8-8 20.9-8 28.9,0l24.6,24.6c6.9-3.3 13.9-6.3 21.1-8.8v-34.7c0-11.3 9.1-20.4 20.4-20.4h91.7c11.3,0 20.4,9.1 20.4,20.4v34.7c7.2,2.5 14.2,5.4 21.1,8.8l24.6-24.5c8-8 20.9-8 28.9,0l64.8,64.8c3.8,3.8 6,9 6,14.4 0,5.4-2.2,10.6-6,14.4l-24.6,24.6c3.3,6.9 6.3,13.9 8.8,21.1h34.7c11.3,0 20.4,9.1 20.4,20.4v91.7c0,11.3-9.1,20.4-20.4,20.4h-34.7c-2.5,7.2-5.4,14.2-8.8,21.1l24.6,24.6c3.8,3.8 6,9 6,14.4 0,5.4-2.2,10.6-6,14.4l-64.8,64.8c-8,8-20.9,8-28.9,0l-24.6-24.6c-6.9,3.3-13.9,6.3-21.1,8.8v34.7c5.68434e-14,11.5-9.2,20.6-20.4,20.6zm-71.3-40.8h50.8v-29.4c0-9.3 6.3-17.4 15.3-19.8 14-3.7 27.5-9.3 40.1-16.7 8-4.7 18.2-3.4 24.7,3.2l20.8,20.8 35.9-35.9-20.8-20.8c-6.6-6.6-7.9-16.7-3.2-24.8 7.4-12.6 13-26.1 16.7-40.1 2.3-9 10.5-15.2 19.7-15.2h29.4v-50.8h-29.4c-9.3,0-17.4-6.3-19.7-15.2-3.7-14-9.3-27.5-16.7-40.1-4.7-8-3.4-18.2 3.2-24.7l20.8-20.8-35.9-35.9-20.8,20.8c-6.6,6.6-16.7,7.9-24.7,3.2-12.6-7.4-26.1-13-40.1-16.7-9-2.4-15.3-10.5-15.3-19.8v-29.7h-50.8v29.4c0,9.3-6.3,17.4-15.3,19.8-14,3.7-27.5,9.3-40.1,16.7-8,4.7-18.2,3.4-24.7-3.2l-20.8-20.8-35.9,35.9 20.8,20.8c6.6,6.6 7.9,16.7 3.2,24.7-7.4,12.6-13,26.1-16.7,40.1-2.4,9-10.5,15.3-19.8,15.3h-29.4v50.8h29.4c9.3,0 17.4,6.3 19.8,15.3 3.7,14 9.3,27.5 16.7,40.1 4.7,8 3.4,18.2-3.2,24.7l-20.8,20.8 35.9,35.9 20.8-20.8c6.6-6.6 16.8-7.9 24.7-3.2 12.6,7.4 26.1,13 40.1,16.7 9,2.4 15.3,10.5 15.3,19.8v29.6z"
          fill="currentColor"
        />
        <path
          d="m256,376.2c-66.3,0-120.2-53.9-120.2-120.2s53.9-120.2 120.2-120.2 120.3,53.9 120.3,120.2-54,120.2-120.3,120.2zm0-199.6c-43.8,0-79.4,35.6-79.4,79.4s35.6,79.4 79.4,79.4c43.8,0 79.4-35.6 79.4-79.4s-35.6-79.4-79.4-79.4z"
          fill="currentColor"
        />
      </g>
    </template>

    <template v-else-if="props.name === 'trashbin'">
      <path d="M5.2 6.9H18.8" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M9 6.9V5.2C9 4.4 9.6 3.8 10.4 3.8H13.6C14.4 3.8 15 4.4 15 5.2V6.9" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" />
      <path d="M6.9 6.9L7.9 19.1C8 20.1 8.8 20.8 9.8 20.8H14.2C15.2 20.8 16 20.1 16.1 19.1L17.1 6.9" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linejoin="round" />
      <path d="M10 10.3V16.9" :stroke-width="Math.max(props.strokeWidth - 0.35, 1.1)" stroke="currentColor" stroke-linecap="round" />
      <path d="M14 10.3V16.9" :stroke-width="Math.max(props.strokeWidth - 0.35, 1.1)" stroke="currentColor" stroke-linecap="round" />
    </template>

    <template v-else>
      <path d="M4.5 12.7L9.7 17.5L19.5 7.5" :stroke-width="props.strokeWidth" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>
