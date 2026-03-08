<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import rough from "roughjs";

const props = withDefaults(
  defineProps<{
    as?: "article" | "aside" | "div" | "section";
    stroke?: string;
    fill?: string;
    roughness?: number;
    bowing?: number;
    strokeWidth?: number;
  }>(),
  {
    as: "section",
    stroke: "#4f4235",
    fill: "rgba(255, 252, 240, 0.9)",
    roughness: 1.25,
    bowing: 1,
    strokeWidth: 1.8
  }
);

const hostElement = ref<HTMLElement | null>(null);
const svgElement = ref<SVGSVGElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const panelTag = computed(() => props.as);

function drawPanelBorder(): void {
  const host = hostElement.value;
  const svg = svgElement.value;
  if (!host || !svg) {
    return;
  }

  const { width, height } = host.getBoundingClientRect();
  const panelWidth = Math.max(Math.floor(width), 0);
  const panelHeight = Math.max(Math.floor(height), 0);
  if (!panelWidth || !panelHeight) {
    return;
  }

  svg.setAttribute("width", `${panelWidth}`);
  svg.setAttribute("height", `${panelHeight}`);
  svg.setAttribute("viewBox", `0 0 ${panelWidth} ${panelHeight}`);
  svg.innerHTML = "";

  const sketch = rough.svg(svg);
  const rectangle = sketch.rectangle(3, 3, Math.max(panelWidth - 6, 1), Math.max(panelHeight - 6, 1), {
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
  drawPanelBorder();

  resizeObserver = new ResizeObserver(() => {
    drawPanelBorder();
  });

  if (hostElement.value) {
    resizeObserver.observe(hostElement.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => [props.stroke, props.fill, props.roughness, props.bowing, props.strokeWidth],
  () => {
    drawPanelBorder();
  }
);
</script>

<template>
  <component :is="panelTag" ref="hostElement" class="rough-panel relative isolate">
    <svg ref="svgElement" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
    <div class="rough-panel-content relative z-10">
      <slot />
    </div>
  </component>
</template>
