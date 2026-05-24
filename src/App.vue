<script setup lang="ts">
import { reactive, ref, watch, watchEffect } from 'vue'
import CanvasPreview from './components/CanvasPreview.vue'
import WatermarkControls from './components/WatermarkControls.vue'
import { useWatermarkCanvas } from './composables/useWatermarkCanvas'
import type { WatermarkOptions } from './types/watermark'

const options = reactive<WatermarkOptions>({
  text: '仅供参考',
  color: '#666666',
  alpha: 0.16,
  angle: 45,
  space: 4,
  size: 1.15,
  autoRefresh: true,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewRef = ref<{ canvasEl: HTMLCanvasElement | null } | null>(null)
const { previewReady, loadImage, drawWatermark, downloadCanvas, clearImage } = useWatermarkCanvas(canvasRef)

watchEffect(() => {
  canvasRef.value = previewRef.value?.canvasEl ?? null
})

function onFileSelected(file: File) {
  loadImage(file, options)
}

function refreshPreview() {
  drawWatermark(options)
}

watch(
  [
    () => options.text,
    () => options.color,
    () => options.alpha,
    () => options.angle,
    () => options.space,
    () => options.size,
  ],
  () => {
    if (options.autoRefresh) {
      refreshPreview()
    }
  },
)

watch(
  () => options.autoRefresh,
  (enabled) => {
    if (enabled) {
      refreshPreview()
    }
  },
)
</script>

<template>
  <main class="page-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <section class="workspace-shell workspace-shell--single">
      <section class="tool-panel">
        <div class="tool-card tool-card--controls">
          <div class="panel-heading">
            <div>
              <h2>上传图片并调整水印</h2>
              <p class="tool-note">纯浏览器本地处理，不上传、不留存，绝不保留用户信息。</p>
            </div>
          </div>

          <WatermarkControls
            v-model:options="options"
            :preview-ready="previewReady"
            @file-selected="onFileSelected"
            @refresh="refreshPreview"
            @clear="clearImage"
          />
        </div>

        <div class="tool-card tool-card--preview">
          <div class="panel-heading preview-heading">
            <h2>实时预览与下载</h2>
            <button v-if="previewReady" type="button" class="ghost-button download-button" @click="downloadCanvas">
              <svg viewBox="0 0 24 24" class="download-button__icon" aria-hidden="true">
                <path d="M12 3v9m0 0 3.5-3.5M12 12 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 15.5V17a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 17v-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              <span class="download-button__label">下载</span>
            </button>
          </div>

          <CanvasPreview
            ref="previewRef"
            :preview-ready="previewReady"
          />
        </div>
      </section>
    </section>
  </main>
</template>
