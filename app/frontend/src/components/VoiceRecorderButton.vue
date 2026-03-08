<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import RoughButton from "./RoughButton.vue";

type RecordingResult = {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
};

type RecordingErrorCode = "not_supported" | "permission_denied" | "recording_failed";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    idleLabel?: string;
    recordingLabel?: string;
  }>(),
  {
    disabled: false,
    idleLabel: "Start recording",
    recordingLabel: "Stop recording"
  }
);

const emit = defineEmits<{
  "recording-start": [];
  "recording-stop": [result: RecordingResult];
  "recording-error": [code: RecordingErrorCode];
}>();

const isRecording = ref(false);

const mediaRecorder = ref<MediaRecorder | null>(null);
const activeStream = ref<MediaStream | null>(null);
const chunks = ref<BlobPart[]>([]);
const recordingStartedAt = ref<number | null>(null);

const buttonLabel = computed<string>(() => {
  return isRecording.value ? props.recordingLabel : props.idleLabel;
});

const icon = computed<string>(() => {
  return isRecording.value ? "●" : "🎤";
});

const buttonFill = computed<string>(() => {
  return isRecording.value ? "rgba(240, 137, 118, 0.9)" : "rgba(255, 250, 232, 0.95)";
});

function cleanupStream(): void {
  if (!activeStream.value) {
    return;
  }

  for (const track of activeStream.value.getTracks()) {
    track.stop();
  }

  activeStream.value = null;
}

function emitRecordingError(code: RecordingErrorCode): void {
  emit("recording-error", code);
}

function handleRecorderStop(): void {
  const mimeType = mediaRecorder.value?.mimeType || "audio/webm";
  const durationMs = recordingStartedAt.value ? Date.now() - recordingStartedAt.value : 0;
  const audioBlob = new Blob(chunks.value, { type: mimeType });

  chunks.value = [];
  recordingStartedAt.value = null;
  cleanupStream();
  mediaRecorder.value = null;

  emit("recording-stop", {
    audioBlob,
    mimeType,
    durationMs
  });
}

async function startRecording(): Promise<void> {
  if (isRecording.value || props.disabled) {
    return;
  }

  if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
    emitRecordingError("not_supported");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeStream.value = stream;

    const recorder = new MediaRecorder(stream);
    mediaRecorder.value = recorder;
    chunks.value = [];

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.value.push(event.data);
      }
    };

    recorder.onerror = () => {
      emitRecordingError("recording_failed");
    };

    recorder.onstop = () => {
      handleRecorderStop();
    };

    recorder.start();
    recordingStartedAt.value = Date.now();
    isRecording.value = true;
    emit("recording-start");
  } catch {
    cleanupStream();
    mediaRecorder.value = null;
    chunks.value = [];
    emitRecordingError("permission_denied");
  }
}

function stopRecording(): void {
  if (!isRecording.value) {
    return;
  }

  isRecording.value = false;
  mediaRecorder.value?.stop();
}

async function toggleRecording(): Promise<void> {
  if (isRecording.value) {
    stopRecording();
    return;
  }

  await startRecording();
}

watch(
  () => props.disabled,
  (isDisabled) => {
    if (isDisabled && isRecording.value) {
      stopRecording();
    }
  }
);

onUnmounted(() => {
  if (isRecording.value) {
    stopRecording();
  } else {
    cleanupStream();
  }
});
</script>

<template>
  <RoughButton
    class="flex items-center gap-2 px-3 py-2 text-sm font-medium"
    :disabled="disabled"
    :fill="buttonFill"
    @click="toggleRecording"
  >
    <span class="text-lg leading-none" :class="isRecording ? 'animate-pulse' : ''">{{ icon }}</span>
    <span>{{ buttonLabel }}</span>
  </RoughButton>
</template>
