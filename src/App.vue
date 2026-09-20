<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
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
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewRef = ref<{ canvasEl: HTMLCanvasElement | null } | null>(null)
const {
  previewReady,
  imageType,
  outputSize,
  imageInfo,
  loadImage,
  scheduleDraw,
  downloadCanvas,
  shareCanvas,
  clearImage,
} = useWatermarkCanvas(canvasRef)

const hasWatermarkText = computed(() => options.text.trim().length > 0)
const canDownload = computed(() => previewReady.value && hasWatermarkText.value)
const outputSizeLabel = computed(() => {
  if (!outputSize.value) return ''
  const kb = outputSize.value / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
})
const supportsShare = typeof navigator !== 'undefined' && !!navigator.canShare

// 新版本就绪时不自动刷新（registerType: 'prompt'），交给用户挑时机。
// 原因：用户往往正载着图片、调好参数准备导出，此时 reload 会丢掉当前工作。
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW()
const pwaDismissed = ref(false)

const pwaNotice = computed(() => {
  if (pwaDismissed.value) return null
  if (needRefresh.value) {
    return {
      title: '有新版本可用',
      text: '刷新后生效。刷新会清空当前已载入的图片，图片本身从未离开你的设备。',
    }
  }
  if (offlineReady.value) {
    return {
      title: '已可离线使用',
      text: '以后没有网络也能打开本工具，图片依然只在本地处理。',
    }
  }
  return null
})

async function applyUpdate() {
  // 通知等待中的 SW 立即接管，然后重载页面
  await updateServiceWorker()
}

function dismissPwaNotice() {
  pwaDismissed.value = true
}

watchEffect(() => {
  canvasRef.value = previewRef.value?.canvasEl ?? null
})

function onFileSelected(file: File) {
  loadImage(file, options)
}

function refreshPreview() {
  scheduleDraw(options)
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
    refreshPreview()
  },
)

function handleDownload() {
  if (!canDownload.value) return
  downloadCanvas()
}

async function handleShare() {
  if (!canDownload.value) return
  const shared = await shareCanvas()
  if (!shared) {
    // Fall back to download when share is unsupported or cancelled
    downloadCanvas()
  }
}

function handleCanvasClick() {
  // Click on preview canvas: share if supported, else download
  if (supportsShare) {
    handleShare()
  } else {
    handleDownload()
  }
}

function formatDimensions(width: number, height: number) {
  return `${width} × ${height}`
}

onMounted(() => {
  window.addEventListener('paste', (e: ClipboardEvent) => {
    // Don't hijack paste when user is typing in an input
    const active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return

    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    )
    if (!item) return

    const file = item.getAsFile()
    if (file) {
      onFileSelected(file)
    }
  })
})
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
          />
        </div>

        <div class="tool-card tool-card--preview">
          <div class="panel-heading preview-heading">
            <h2>实时预览与下载</h2>
            <div class="preview-actions" v-if="previewReady">
              <button type="button" class="ghost-button clear-button" @click="clearImage">
                <svg viewBox="0 0 24 24" class="clear-button__icon" aria-hidden="true">
                  <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
                </svg>
                <span class="clear-button__label">清空</span>
              </button>
              <button
                v-if="supportsShare"
                type="button"
                class="ghost-button share-button"
                :disabled="!canDownload"
                :title="!hasWatermarkText ? '请先输入水印文字' : '分享图片'"
                @click="handleShare"
              >
                <svg viewBox="0 0 24 24" class="share-button__icon" aria-hidden="true">
                  <path d="M12 3v12m0 0-4-4m4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
                <span class="share-button__label">分享</span>
              </button>
              <button
                type="button"
                class="ghost-button download-button"
                :disabled="!canDownload"
                :title="!hasWatermarkText ? '请先输入水印文字' : '下载图片'"
                @click="handleDownload"
              >
                <svg viewBox="0 0 24 24" class="download-button__icon" aria-hidden="true">
                  <path d="M12 3v9m0 0 3.5-3.5M12 12 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M5 15.5V17a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 17v-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
                <span class="download-button__label">下载</span>
              </button>
            </div>
          </div>

          <CanvasPreview
            ref="previewRef"
            :preview-ready="previewReady"
            @download="handleCanvasClick"
          />

          <div v-if="previewReady && imageInfo" class="image-meta">
            <span class="image-meta__name">{{ imageInfo.name }}</span>
            <span class="image-meta__dims">{{ formatDimensions(imageInfo.width, imageInfo.height) }}</span>
            <span v-if="outputSizeLabel" class="image-meta__size">约 {{ outputSizeLabel }}</span>
          </div>
        </div>
      </section>
    </section>

    <Transition name="pwa-toast">
      <div v-if="pwaNotice" class="pwa-toast" role="status" aria-live="polite">
        <div class="pwa-toast__body">
          <p class="pwa-toast__title">{{ pwaNotice.title }}</p>
          <p class="pwa-toast__text">{{ pwaNotice.text }}</p>
        </div>
        <div class="pwa-toast__actions">
          <button
            v-if="needRefresh"
            type="button"
            class="pwa-toast__primary"
            @click="applyUpdate"
          >
            立即刷新
          </button>
          <button type="button" class="pwa-toast__dismiss" @click="dismissPwaNotice">
            {{ needRefresh ? '稍后' : '知道了' }}
          </button>
        </div>
      </div>
    </Transition>
  </main>
</template>
