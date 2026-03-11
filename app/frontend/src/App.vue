<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { Household } from "@shared/models";
import OverviewPage from "./pages/OverviewPage.vue";
import QuickAddPage from "./pages/QuickAddPage.vue";
import AiChefPage from "./pages/AiChefPage.vue";
import ShoppingListPage from "./pages/ShoppingListPage.vue";
import RoughButton from "./components/RoughButton.vue";
import RoughPanel from "./components/RoughPanel.vue";
import HandDrawnIcon from "./components/HandDrawnIcon.vue";
import SettingsModal from "./components/SettingsModal.vue";
import { t, type Language, type TranslationKey } from "./i18n";
import { getStoredLanguage, getStoredLlmModel, setStoredLanguage, setStoredLlmModel } from "./utils/localPersistence";
import type { LlmModel } from "./types/app";
import { fetchHouseholds } from "./api/households";
import { ApiRequestError } from "./api/http";

const households = ref<Household[]>([]);
const loadingHouseholds = ref(false);
const householdsError = ref("");
const language = ref<Language>("en");

const routePath = ref(window.location.pathname);
const isSettingsModalOpen = ref(false);
const availableLlmModels: LlmModel[] = ["gpt-5.4", "gpt-5", "gpt-5-mini", "gpt-5-nano"];
const selectedLlmModel = ref<LlmModel>("gpt-5-mini");

const activePage = computed<"overview" | "quick-add" | "ai-chef" | "shopping-list">(() => {
  if (routePath.value.startsWith("/shopping-list")) {
    return "shopping-list";
  }
  if (routePath.value.startsWith("/ai-chef")) {
    return "ai-chef";
  }
  if (routePath.value.startsWith("/quick-add")) {
    return "quick-add";
  }
  return "overview";
});

function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  return t(language.value, key, params);
}

function updateLanguage(nextLanguage: Language): void {
  language.value = nextLanguage;
  void setStoredLanguage(nextLanguage);
  isSettingsModalOpen.value = false;
}

function updateLlmModel(nextModel: string): void {
  if (!nextModel || !availableLlmModels.includes(nextModel as LlmModel)) {
    return;
  }

  selectedLlmModel.value = nextModel as LlmModel;
  void setStoredLlmModel(selectedLlmModel.value);
}

function openSettingsModal(): void {
  isSettingsModalOpen.value = true;
}

function closeSettingsModal(): void {
  isSettingsModalOpen.value = false;
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && isSettingsModalOpen.value) {
    closeSettingsModal();
  }
}

function handlePopState(): void {
  routePath.value = window.location.pathname;
}

function navigateTo(path: "/overview" | "/quick-add" | "/ai-chef" | "/shopping-list"): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  routePath.value = path;
}

async function loadHouseholds(): Promise<void> {
  loadingHouseholds.value = true;
  householdsError.value = "";

  try {
    households.value = await fetchHouseholds();
  } catch (error) {
    if (error instanceof ApiRequestError) {
      householdsError.value = translate("failedLoadHouseholds", { status: error.status });
      return;
    }
    householdsError.value = translate("failedLoadHouseholdsGeneric");
  } finally {
    loadingHouseholds.value = false;
  }
}

watch(isSettingsModalOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});

onMounted(() => {
  void (async () => {
    const storedLanguage = await getStoredLanguage();
    if (storedLanguage) {
      language.value = storedLanguage;
    }

    const storedLlmModel = await getStoredLlmModel();
    if (storedLlmModel && availableLlmModels.includes(storedLlmModel as LlmModel)) {
      selectedLlmModel.value = storedLlmModel as LlmModel;
    }
  })();

  if (window.location.pathname === "/") {
    window.history.replaceState({}, "", "/overview");
    routePath.value = "/overview";
  }

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("keydown", handleGlobalKeyDown);
  void loadHouseholds();
});

onUnmounted(() => {
  window.removeEventListener("popstate", handlePopState);
  window.removeEventListener("keydown", handleGlobalKeyDown);
  document.body.style.overflow = "";
});
</script>

<template>
  <main class="min-h-screen w-full max-w-full overflow-x-hidden text-[var(--ink-main)]">
    <header class="fixed inset-x-0 top-0 z-30 border-b border-[#6f5a47]/40 bg-[#f8efda]/94 px-3 py-2 shadow-sm backdrop-blur md:sticky md:px-4 md:py-3">
      <div class="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2">
        <h1 class="inline-flex min-w-0 items-center gap-1 truncate text-2xl font-bold tracking-tight text-[#3e3023] sm:gap-2 sm:text-4xl">
          <HandDrawnIcon name="clipboard" :size="32" :stroke-width="2" class="sm:hidden" />
          <HandDrawnIcon name="clipboard" :size="44" :stroke-width="2" class="hidden sm:block" />
          <span class="truncate">{{ translate("appTitle") }}</span>
        </h1>
        <nav class="ml-4 hidden gap-2 md:flex">
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/overview')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="notebook" :size="20" />
              <span>{{ translate("overview") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/quick-add')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="microphone" :size="20" />
              <span>{{ translate("quickAdd") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/ai-chef')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="chef-hat" :size="20" />
              <span>{{ translate("aiChef") }}</span>
            </span>
          </RoughButton>
          <RoughButton
            class="text-left text-sm"
            :fill="activePage === 'shopping-list' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
            @click="navigateTo('/shopping-list')"
          >
            <span class="inline-flex items-center gap-1">
              <HandDrawnIcon name="checkmark" :size="20" />
              <span>{{ translate("shoppingList") }}</span>
            </span>
          </RoughButton>
        </nav>
        <div class="ml-auto flex items-center gap-1">
          <RoughButton
            class="px-1.5 py-0.5 text-xs leading-none sm:px-2 sm:py-1 sm:text-sm"
            :fill="'rgba(255, 251, 238, 0.95)'"
            @click="openSettingsModal"
            :title="translate('settings')"
            :aria-label="translate('settings')"
          >
            <HandDrawnIcon name="cog" :size="20" />
          </RoughButton>
        </div>
      </div>
    </header>

    <SettingsModal
      :open="isSettingsModalOpen"
      :language="language"
      :selected-llm-model="selectedLlmModel"
      :available-llm-models="availableLlmModels"
      @close="closeSettingsModal"
      @language-change="updateLanguage"
      @llm-model-change="updateLlmModel"
    />

    <div class="page-transition-stage">
      <Transition name="page-rip">
        <section :key="activePage" class="page-transition-layer">
          <div class="mx-auto w-full max-w-7xl p-3 pb-24 pt-20 sm:p-4 sm:pb-24 md:p-6 md:pb-6 md:pt-6">
            <RoughPanel class="mb-4">
              <h2 class="inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                <HandDrawnIcon
                  :name="
                    activePage === 'overview'
                      ? 'notebook'
                      : activePage === 'quick-add'
                        ? 'microphone'
                        : activePage === 'ai-chef'
                          ? 'chef-hat'
                          : 'checkmark'
                  "
                  :size="36"
                  :stroke-width="1.8"
                />
                <span>
                  {{
                    activePage === "overview"
                      ? translate("overview")
                      : activePage === "quick-add"
                        ? translate("quickAdd")
                        : activePage === "ai-chef"
                          ? translate("aiChef")
                          : translate("shoppingList")
                  }}
                </span>
              </h2>
            </RoughPanel>

            <p v-if="loadingHouseholds && !households.length" class="scribble-text">{{ translate("loadingHouseholds") }}</p>
            <p v-if="householdsError && !households.length" class="scribble-text text-[#8f2e2e]">{{ householdsError }}</p>
            <p v-if="householdsError && households.length" class="scribble-text text-[#8f2e2e]">{{ householdsError }}</p>

            <template v-if="households.length">
              <OverviewPage
                v-if="activePage === 'overview'"
                :households="households"
                :language="language"
                @households-updated="loadHouseholds"
              />

              <QuickAddPage
                v-else-if="activePage === 'quick-add'"
                :households="households"
                :language="language"
                :llm-model="selectedLlmModel"
                @households-updated="loadHouseholds"
              />

              <AiChefPage v-else-if="activePage === 'ai-chef'" :households="households" :language="language" />
              <ShoppingListPage v-else :language="language" />
            </template>
          </div>
        </section>
      </Transition>
    </div>

    <nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-[#6f5a47]/40 bg-[#f8efda]/95 px-2 py-0.5 shadow-[0_-4px_12px_rgba(62,48,35,0.15)] backdrop-blur md:hidden">
      <div class="mx-auto grid w-full max-w-7xl grid-cols-4 gap-1">
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'overview' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/overview')"
          :aria-label="translate('overview')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="notebook" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'quick-add' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/quick-add')"
          :aria-label="translate('quickAdd')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="microphone" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'ai-chef' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/ai-chef')"
          :aria-label="translate('aiChef')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="chef-hat" :size="24" />
          </span>
        </RoughButton>
        <RoughButton
          class="h-10 w-full px-0 py-0"
          :fill="activePage === 'shopping-list' ? 'rgba(229, 199, 138, 0.95)' : 'rgba(255, 251, 238, 0.95)'"
          @click="navigateTo('/shopping-list')"
          :aria-label="translate('shoppingList')"
        >
          <span class="inline-flex h-10 items-center justify-center">
            <HandDrawnIcon name="checkmark" :size="24" />
          </span>
        </RoughButton>
      </div>
    </nav>
  </main>
</template>

<style scoped>
.page-transition-stage {
  position: relative;
  overflow: hidden;
  min-height: calc(100vh - 5rem);
  --notebook-line-start: 2.05rem;
  --notebook-line-end: 2.14rem;
  --notebook-line-repeat: 4.22rem;
}

.page-transition-layer {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 5rem);
  background-color: var(--paper-base);
  background-image:
    radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.7) 0, rgba(255, 255, 255, 0) 42%),
    linear-gradient(to right, transparent 0 3.8rem, var(--line-red) 3.8rem 4.05rem, transparent 4.05rem 100%),
    repeating-linear-gradient(
      to bottom,
      transparent 0 var(--notebook-line-start),
      var(--line-blue) var(--notebook-line-start) var(--notebook-line-end),
      transparent var(--notebook-line-end) var(--notebook-line-repeat)
    ),
    linear-gradient(180deg, var(--paper-base) 0%, var(--paper-shadow) 100%);
}

.page-rip-enter-active,
.page-rip-leave-active {
  transition:
    transform 1500ms cubic-bezier(0.2, 0.85, 0.25, 1),
    opacity 1500ms ease,
    filter 1500ms ease;
}

.page-rip-leave-active {
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  box-shadow:
    -10px 0 18px rgba(61, 49, 37, 0.2),
    0 4px 24px rgba(61, 49, 37, 0.18);
  will-change: transform, opacity, filter;
}

.page-rip-leave-active::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2rem;
  width: 2.15rem;
  background-image:
    repeating-linear-gradient(
      to bottom,
      transparent 0 var(--notebook-line-start),
      var(--line-blue) var(--notebook-line-start) var(--notebook-line-end),
      transparent var(--notebook-line-end) var(--notebook-line-repeat)
    ),
    linear-gradient(180deg, #fff6e7 0%, #f6e8cb 100%);
  clip-path: polygon(
    100% 0%,
    34% 1%,
    82% 4%,
    26% 7%,
    90% 11%,
    31% 14%,
    87% 19%,
    24% 23%,
    92% 29%,
    35% 33%,
    80% 38%,
    28% 46%,
    94% 51%,
    33% 54%,
    86% 63%,
    22% 69%,
    91% 71%,
    37% 78%,
    76% 83%,
    25% 91%,
    88% 94%,
    31% 97%,
    100% 100%
  );
  filter: drop-shadow(-3px 0 3px rgba(48, 37, 26, 0.22));
}

.page-rip-leave-from {
  transform: translateX(0) rotate(0deg);
  opacity: 1;
  filter: brightness(1);
}

.page-rip-leave-to {
  transform: translateX(110%) rotate(2.2deg);
  opacity: 0.96;
  filter: brightness(0.96);
}

@media (max-width: 767px) {
  .page-transition-stage,
  .page-transition-layer {
    min-height: calc(100vh - 1rem);
  }

  .page-rip-enter-active,
  .page-rip-leave-active {
    transition:
      transform 800ms cubic-bezier(0.2, 0.85, 0.25, 1),
      opacity 800ms ease,
      filter 800ms ease;
  }

  .page-rip-leave-active {
    clip-path: inset(5rem 0 0 -3.5rem);
  }
}
</style>


