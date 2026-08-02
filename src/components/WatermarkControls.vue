<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { WatermarkOptions } from '../types/watermark'

const TEXT_PRESETS = [
  '仅供办理业务使用',
  '仅用于身份认证',
  '仅供XX备案使用',
  '复印件无效',
  '再次复印无效',
]

const COLOR_PRESETS = [
  { label: '印章红', value: '#CC0000' },
  { label: '深灰', value: '#333333' },
  { label: '纯黑', value: '#000000' },
  { label: '白色', value: '#FFFFFF' },
]

const STORAGE_KEY = 'watermark-last-text'

const options = defineModel<WatermarkOptions>('options', { required: true })

const props = defineProps<{
  previewReady: boolean
}>()

const emit = defineEmits<{
  'file-selected': [File]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const cameraInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const showAdvanced = ref(false)
let dragDepth = 0

// Restore last used watermark text
onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && options.value.text === '仅供参考') {
      options.value.text = saved
    }
  } catch {
    // localStorage unavailable — ignore
  }
})

function saveLastText() {
  try {
    localStorage.setItem(STORAGE_KEY, options.value.text)
  } catch {
    // ignore
  }
}

function isSupportedImage(file: File) {
  const mime = file.type
  if (!mime) return true
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)
}

function emitSelectedFile(file: File, target?: HTMLInputElement | null) {
  if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
    alert('iPhone 拍摄的 HEIC 格式暂不支持，请在相册中将图片导出为 JPEG 后重试')
    if (target) target.value = ''
    return
  }

  if (!isSupportedImage(file)) {
    alert('仅支持 png、jpg、gif、webp 图片格式')
    if (target) {
      target.value = ''
    }
    return
  }

  emit('file-selected', file)

  if (target) {
    target.value = ''
  }

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  if (cameraInputRef.value) {
    cameraInputRef.value.value = ''
  }
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function openCamera() {
  cameraInputRef.value?.click()
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null

  if (!file) {
    return
  }

  emitSelectedFile(file, target)
}

function onDragEnter() {
  dragDepth += 1
  isDragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)

  if (dragDepth === 0) {
    isDragging.value = false
  }
}

function onDragOver() {
  isDragging.value = true
}

function onDragEnd() {
  dragDepth = 0
  isDragging.value = false
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  isDragging.value = false

  const file = event.dataTransfer?.files?.[0] ?? null

  if (file) {
    emitSelectedFile(file)
  }
}

function onZoneKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openFilePicker()
  }
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
}

function selectPreset(text: string) {
  options.value.text = text
  saveLastText()
}

function selectColor(color: string) {
  options.value.color = color
}

function onTextChange() {
  saveLastText()
}

onMounted(() => {
  window.addEventListener('dragend', onDragEnd)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragend', onDragEnd)
})
</script>

<template>
  <div class="form control-panel">
    <div class="upload-actions">
      <div
        class="upload-zone"
        :class="{
          'upload-zone--dragging': isDragging,
          'upload-zone--ready': props.previewReady,
        }"
        role="button"
        tabindex="0"
        :aria-label="props.previewReady ? '拖拽图片替换当前文件' : '拖拽图片上传区域'"
        @click="openFilePicker"
        @keydown="onZoneKeydown"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInputRef"
          class="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          @change="onFileChange"
        />

        <div class="upload-zone__visual" aria-hidden="true">
          <svg viewBox="0 0 48 48" class="upload-zone__icon" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 9V29" stroke="currentColor" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M16.5 16.5L24 9l7.5 7.5" stroke="currentColor" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M11 29.5V34c0 3.59 2.91 6.5 6.5 6.5h13c3.59 0 6.5-2.91 6.5-6.5v-4.5" stroke="currentColor" stroke-width="3.25" stroke-linecap="round" />
          </svg>
        </div>

        <div class="upload-zone__content">
          <small class="hint">支持 png、jpg、gif、webp</small>
        </div>
      </div>

      <input
        ref="cameraInputRef"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        @change="onFileChange"
      />
      <button
        type="button"
        class="camera-button"
        aria-label="拍照上传"
        @click="openCamera"
      >
        <svg viewBox="0 0 24 24" class="camera-button__icon" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.8" />
        </svg>
        <span class="camera-button__label">拍照</span>
      </button>
    </div>

    <div class="preset-chips" v-if="TEXT_PRESETS.length">
      <button
        v-for="preset in TEXT_PRESETS"
        :key="preset"
        type="button"
        class="preset-chip"
        :class="{ 'preset-chip--active': options.text === preset }"
        @click="selectPreset(preset)"
      >
        {{ preset }}
      </button>
    </div>

    <button
      type="button"
      class="params-toggle"
      :class="{ 'params-toggle--active': showAdvanced }"
      :aria-expanded="showAdvanced"
      aria-label="显示或隐藏水印样式"
      @click="toggleAdvanced"
    >
      <svg viewBox="0 0 24 24" class="params-toggle__icon" aria-hidden="true">
        <path d="M7 7l10 10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
        <path d="M13 7h4v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <label class="field">
      <span>水印文字</span>
      <textarea
        v-model="options.text"
        class="watermark-textarea"
        rows="2"
        maxlength="60"
        placeholder="请输入文字，换行可输入多行"
        @input="onTextChange"
      ></textarea>
      <small v-if="!options.text.trim()" class="field-hint field-hint--warn">请输入水印文字后才可以下载</small>
    </label>

    <div class="control-advanced" :class="{ 'control-advanced--open': showAdvanced }">
      <div class="grid">
        <div class="range-card range-card--color">
          <span>颜色</span>
          <input v-model="options.color" type="color" />
          <div class="color-presets">
            <button
              v-for="cp in COLOR_PRESETS"
              :key="cp.value"
              type="button"
              class="color-preset"
              :class="{ 'color-preset--active': options.color === cp.value }"
              :style="{ backgroundColor: cp.value }"
              :title="cp.label"
              :aria-label="'水印颜色：' + cp.label"
              @click="selectColor(cp.value)"
            ></button>
          </div>
        </div>

        <label class="range-card">
          <span>透明度：{{ options.alpha.toFixed(2) }}</span>
          <input v-model.number="options.alpha" type="range" min="0" max="1" step="0.05" />
        </label>

        <label class="range-card">
          <span>角度：{{ options.angle }}°</span>
          <input v-model.number="options.angle" type="range" min="-90" max="90" step="3" />
        </label>

        <label class="range-card">
          <span>间隔：{{ options.space.toFixed(1) }}</span>
          <input v-model.number="options.space" type="range" min="1" max="8" step="0.2" />
        </label>

        <label class="range-card">
          <span>字号：{{ options.size.toFixed(2) }}</span>
          <input v-model.number="options.size" type="range" min="0.5" max="3" step="0.05" />
        </label>
      </div>
    </div>
  </div>
</template>
