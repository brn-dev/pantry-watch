<script setup lang="ts">
const props = defineProps<{
  language: "en" | "de";
}>();
</script>

<template>
  <svg
    v-if="props.language === 'en'"
    class="flag-icon"
    viewBox="0 0 60 40"
    aria-hidden="true"
  >
    <path d="M1.2 2.5 Q9.6 1 20.1 2 Q33.4 1 45.1 2.1 Q53.1 1.5 58.6 2.9 Q59.3 10.2 58.5 19.8 Q59 29 58.2 36.9 Q49.6 38.4 39.1 37.8 Q25.9 38.8 12.2 38.1 Q5.8 38.5 1.9 37 Q1 28.8 1.7 19.6 Q0.9 10.2 1.2 2.5 Z" fill="#18427a" stroke="#5c4a3a" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />
    <path d="M0.9 0.7 L7.3 0.8 Q30.4 13.9 59.3 31.5 L59.1 39.3 L52.8 39.2 Q29.8 26.4 0.8 8.3 Z" fill="#f7f5ef" stroke="#5c4a3a" stroke-width="0.5" stroke-linejoin="round" opacity="0.96" />
    <path d="M59.1 0.7 L52.7 0.8 Q29.5 14 0.7 31.8 L0.8 39.3 L7.3 39.2 Q30.1 26.2 59.1 8.3 Z" fill="#f7f5ef" stroke="#5c4a3a" stroke-width="0.5" stroke-linejoin="round" opacity="0.96" />
    <path d="M0.8 0.8 L3.8 0.9 Q30.2 16.1 59.2 33.8 L59.1 39.2 L56 39.1 Q29.6 24.2 0.8 6.4 Z" fill="#ba3030" stroke="#5c4a3a" stroke-width="0.4" stroke-linejoin="round" opacity="0.97" />
    <path d="M59.1 0.8 L56.1 0.9 Q29.9 16.2 0.8 34 L0.9 39.2 L3.8 39.1 Q30.1 24.1 59.1 6.4 Z" fill="#ba3030" stroke="#5c4a3a" stroke-width="0.4" stroke-linejoin="round" opacity="0.97" />
    <path d="M23.2 0.7 Q24.4 10.1 23.4 20.1 Q24.3 30 23.3 39.3 L36.8 39.2 Q35.8 30 36.6 20 Q35.7 10 36.8 0.7 Z" fill="#f7f5ef" stroke="#5c4a3a" stroke-width="0.55" stroke-linejoin="round" opacity="0.98" />
    <path d="M0.8 13.5 Q15.6 14.2 30.1 13.6 Q44.8 14.2 59.2 13.5 L59.2 26.7 Q44.6 26.1 30 26.6 Q15.4 26.1 0.8 26.7 Z" fill="#f7f5ef" stroke="#5c4a3a" stroke-width="0.55" stroke-linejoin="round" opacity="0.98" />
    <path d="M25.8 0.7 Q26.7 10 25.9 20.1 Q26.7 30.1 25.9 39.2 L34.2 39.2 Q33.3 30.1 34.1 20 Q33.4 10 34.2 0.7 Z" fill="#ba3030" stroke="#5c4a3a" stroke-width="0.45" stroke-linejoin="round" opacity="0.99" />
    <path d="M0.8 15.9 Q15.3 16.4 30 16 Q44.9 16.4 59.2 15.9 L59.2 24.3 Q44.8 23.8 30 24.2 Q15.2 23.8 0.8 24.3 Z" fill="#ba3030" stroke="#5c4a3a" stroke-width="0.45" stroke-linejoin="round" opacity="0.99" />
  </svg>

  <svg
    v-else
    class="flag-icon"
    viewBox="0 0 60 40"
    aria-hidden="true"
  >
    <path d="M1.2 2.5 Q9.6 1 20.1 2 Q33.4 1 45.1 2.1 Q53.1 1.5 58.6 2.9 Q59.3 10.2 58.5 19.8 Q59 29 58.2 36.9 Q49.6 38.4 39.1 37.8 Q25.9 38.8 12.2 38.1 Q5.8 38.5 1.9 37 Q1 28.8 1.7 19.6 Q0.9 10.2 1.2 2.5 Z" fill="#1f1f1f" stroke="#5c4a3a" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />
    <path d="M1.4 13.2 Q14.2 14.1 30 13.4 Q45.9 14.2 58.8 13.3 L58.4 27 Q46.1 26.1 30.1 26.8 Q14.3 26.1 1.6 27.1 Z" fill="#b12222" stroke="#5c4a3a" stroke-width="0.58" stroke-linejoin="round" opacity="0.98" />
    <path d="M1.6 26.6 Q14.2 25.9 30 26.5 Q45.8 25.9 58.3 26.7 L58.1 37.1 Q49.5 38.5 39.1 37.8 Q26 38.7 12.1 38.2 Q5.8 38.5 1.9 37.1 Z" fill="#d0a321" stroke="#5c4a3a" stroke-width="0.58" stroke-linejoin="round" opacity="0.98" />
  </svg>
</template>

<style scoped>
.flag-icon {
  width: 1.5rem;
  height: 1rem;
  line-height: 1;
  display: inline-block;
  border-radius: 0.125rem;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
  transform: rotate(-0.8deg);
  transform-origin: center;
}
</style>
