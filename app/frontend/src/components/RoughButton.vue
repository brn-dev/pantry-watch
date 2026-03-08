<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import rough from "roughjs";

const props = withDefaults(
  defineProps<{
    stroke?: string;
    fill?: string;
    roughness?: number;
    bowing?: number;
    strokeWidth?: number;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    stroke: "#3e3328",
    fill: "rgba(255, 250, 232, 0.95)",
    roughness: 1.35,
    bowing: 1.2,
    strokeWidth: 1.8,
    disabled: false,
    type: "button"
  }
);

const buttonElement = ref<HTMLButtonElement | null>(null);
const svgElement = ref<SVGSVGElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

function drawButtonBorder(): void {
  const button = buttonElement.value;
  const svg = svgElement.value;
  if (!button || !svg) {
    return;
  }

  const { width, height } = button.getBoundingClientRect();
  const buttonWidth = Math.max(Math.floor(width), 0);
  const buttonHeight = Math.max(Math.floor(height), 0);
  if (!buttonWidth || !buttonHeight) {
    return;
  }

  svg.setAttribute("width", `${buttonWidth}`);
  svg.setAttribute("height", `${buttonHeight}`);
  svg.setAttribute("viewBox", `0 0 ${buttonWidth} ${buttonHeight}`);
  svg.innerHTML = "";

  const sketch = rough.svg(svg);
  const rectangle = sketch.rectangle(2, 2, Math.max(buttonWidth - 4, 1), Math.max(buttonHeight - 4, 1), {
    stroke: props.stroke,
    strokeWidth: props.strokeWidth,
    roughness: props.roughness,
    bowing: props.bowing,
    fill: props.fill,
    fillStyle: "solid"
  });

  svg.append(rectangle);
}

onMounted(async () => {
  await nextTick();
  drawButtonBorder();

  resizeObserver = new ResizeObserver(() => {
    drawButtonBorder();
  });

  if (buttonElement.value) {
    resizeObserver.observe(buttonElement.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => [props.stroke, props.fill, props.roughness, props.bowing, props.strokeWidth, props.disabled],
  () => {
    drawButtonBorder();
  }
);
</script>

<template>
  <button ref="buttonElement" :type="type" class="rough-button relative inline-flex items-center justify-center" :disabled="disabled">
    <svg ref="svgElement" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
    <span class="relative z-10">
      <slot />
    </span>
  </button>
</template>
