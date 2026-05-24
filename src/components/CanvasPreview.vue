<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  previewReady: boolean
}>()

const emit = defineEmits<{
  download: []
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

defineExpose({
  canvasEl,
})
</script>

<template>
  <section class="preview preview-panel">
    <div class="canvas-shell">
      <p v-if="!props.previewReady" class="placeholder">请选择图片后开始预览</p>
      <canvas v-show="props.previewReady" ref="canvasEl" @click="emit('download')"></canvas>
      <!-- <p v-if="props.previewReady" class="canvas-tip">点击图片本身也可以直接下载</p> -->
    </div>
  </section>
</template>
