<script setup lang="ts">
import { ref } from 'vue'
import type { WatermarkOptions } from '../types/watermark'

const options = defineModel<WatermarkOptions>('options', { required: true })

const props = defineProps<{
  previewReady: boolean
}>()

const emit = defineEmits<{
  'file-selected': [File]
  refresh: []
  clear: []
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const showAdvanced = ref(false)
let dragDepth = 0

function isSupportedImage(file: File) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)
}

function emitSelectedFile(file: File, target?: HTMLInputElement | null) {
  if (!isSupportedImage(file)) {
    alert('仅支持 png, jpg, gif, webp 图片格式')
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
}

function openFilePicker() {
  fileInputRef.value?.click()
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
</script>

<template>
  <div class="form control-panel">
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
      <input v-model="options.text" type="text" maxlength="30" placeholder="请输入文字" />
    </label>

    <div class="control-advanced" :class="{ 'control-advanced--open': showAdvanced }">
      <div class="grid">
        <label class="range-card">
          <span>颜色</span>
          <input v-model="options.color" type="color" />
        </label>

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

      <div class="actions">
        <label class="checkbox">
          <input v-model="options.autoRefresh" type="checkbox" />
          <span>实时刷新</span>
        </label>

        <button
          type="button"
          :disabled="options.autoRefresh || !props.previewReady"
          @click="emit('refresh')"
        >
          刷新
        </button>

        <button type="button" class="ghost-button" :disabled="!props.previewReady" @click="emit('clear')">
          清空图片
        </button>
      </div>
    </div>
  </div>
</template>
