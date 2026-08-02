import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { WatermarkOptions } from '../types/watermark'

function pad(value: number) {
  return value < 10 ? `0${value}` : `${value}`
}

function generateFileName(ext = 'png') {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`
}

function hexToRgba(hexColor: string, alpha: number) {
  const match = hexColor.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)

  if (!match) {
    return `rgba(0, 0, 0, ${alpha})`
  }

  const red = Number.parseInt(match[1], 16)
  const green = Number.parseInt(match[2], 16)
  const blue = Number.parseInt(match[3], 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

// Cap max output dimension to avoid huge canvases on mobile
const MAX_DIMENSION = 4096

function clampDimensions(width: number, height: number) {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height }
  }
  const scale = MAX_DIMENSION / Math.max(width, height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

const MIME_MAP: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/png',  // Canvas flattens GIF, fall back to PNG
}

export function useWatermarkCanvas(canvasRef: Ref<HTMLCanvasElement | null>) {
  const imageRef = ref<HTMLImageElement | null>(null)
  const previewReady = ref(false)
  const imageType = ref('image/png')
  const outputSize = ref<number | null>(null)
  const imageInfo = ref<{ name: string; width: number; height: number } | null>(null)

  let activeObjectUrl: string | null = null
  let drawRaf = 0
  let sizeEstimateTimer: ReturnType<typeof setTimeout> | null = null

  const hasWatermarkText = computed(() => true) // Will be overridden by options check in App.vue

  function revokeActiveObjectUrl() {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl)
      activeObjectUrl = null
    }
  }

  function drawWatermark(options: WatermarkOptions) {
    const canvas = canvasRef.value
    const image = imageRef.value

    if (!canvas || !image) {
      return
    }

    const rawWidth = image.naturalWidth || image.width
    const rawHeight = image.naturalHeight || image.height
    const { width, height } = clampDimensions(rawWidth, rawHeight)
    const context = canvas.getContext('2d')

    if (!context || width === 0 || height === 0) {
      return
    }

    canvas.width = width
    canvas.height = height

    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const rawText = options.text.trim()
    if (!rawText) {
      return
    }

    const lines = rawText.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length === 0) {
      return
    }

    const fontSize = options.size * Math.max(15, Math.min(width, height) / 25)
    const lineHeight = fontSize * 1.35
    context.save()
    context.translate(width / 2, height / 2)
    context.rotate((options.angle * Math.PI) / 180)
    context.fillStyle = hexToRgba(options.color, options.alpha)
    context.font = `normal ${fontSize}px -apple-system, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif`

    // Measure all lines; widest determines horizontal step
    let maxTextWidth = 0
    for (const line of lines) {
      const w = context.measureText(line).width
      if (w > maxTextWidth) maxTextWidth = w
    }

    const marginWidth = context.measureText('啊').width
    const diagonal = Math.sqrt(width * width + height * height)
    const blockHeight = lines.length * lineHeight
    const stepX = Math.max(maxTextWidth + marginWidth, 1)
    const stepY = Math.max(options.space * fontSize + blockHeight, blockHeight + 2)
    const repeatX = Math.ceil(diagonal / stepX)
    const repeatY = Math.ceil(diagonal / stepY / 2)

    for (let x = -repeatX; x <= repeatX; x += 1) {
      for (let y = -repeatY; y <= repeatY; y += 1) {
        for (let li = 0; li < lines.length; li += 1) {
          const yOffset = stepY * y + li * lineHeight - ((lines.length - 1) * lineHeight) / 2
          context.fillText(lines[li], stepX * x, yOffset)
        }
      }
    }

    context.restore()
  }

  function scheduleDraw(options: WatermarkOptions) {
    cancelAnimationFrame(drawRaf)
    drawRaf = requestAnimationFrame(() => {
      drawWatermark(options)
      scheduleSizeEstimate()
    })
  }

  function scheduleSizeEstimate() {
    if (sizeEstimateTimer) clearTimeout(sizeEstimateTimer)
    sizeEstimateTimer = setTimeout(() => estimateOutputSize(), 400)
  }

  function estimateOutputSize() {
    const canvas = canvasRef.value
    if (!canvas || !previewReady.value) return

    const mime = imageType.value
    const quality = mime === 'image/jpeg' ? 0.92 : undefined
    canvas.toBlob((blob) => {
      outputSize.value = blob?.size ?? null
    }, mime, quality)
  }

  function loadImage(file: File, options: WatermarkOptions) {
    revokeActiveObjectUrl()
    previewReady.value = false
    imageRef.value = null
    imageType.value = MIME_MAP[file.type] ?? 'image/png'
    outputSize.value = null
    imageInfo.value = null

    const loadedImage = new Image()
    const objectUrl = URL.createObjectURL(file)
    activeObjectUrl = objectUrl

    loadedImage.onload = () => {
      if (activeObjectUrl !== objectUrl) {
        return
      }

      imageRef.value = loadedImage
      imageInfo.value = {
        name: file.name,
        width: loadedImage.naturalWidth,
        height: loadedImage.naturalHeight,
      }
      previewReady.value = true
      drawWatermark(options)
      scheduleSizeEstimate()
      revokeActiveObjectUrl()
    }

    loadedImage.onerror = () => {
      if (activeObjectUrl === objectUrl) {
        revokeActiveObjectUrl()
      }
      imageRef.value = null
      previewReady.value = false
      alert('图片读取失败，请确认文件是否为有效的图片格式')
    }

    loadedImage.src = objectUrl
  }

  function downloadCanvas() {
    const canvas = canvasRef.value

    if (!canvas || !previewReady.value) {
      return
    }

    const mime = imageType.value
    const quality = mime === 'image/jpeg' ? 0.92 : undefined
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png'

    canvas.toBlob((blob) => {
      if (!blob) {
        alert('图片导出失败，请尝试缩小图片尺寸后重试')
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = generateFileName(ext)
      link.href = url
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    }, mime, quality)
  }

  async function shareCanvas(): Promise<boolean> {
    const canvas = canvasRef.value
    if (!canvas || !previewReady.value) return false

    const mime = imageType.value
    const quality = mime === 'image/jpeg' ? 0.92 : undefined
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png'

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(false)
          return
        }

        const file = new File([blob], generateFileName(ext), { type: mime })

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] })
            resolve(true)
          } catch {
            // User cancelled — not an error
            resolve(false)
          }
        } else {
          resolve(false)
        }
      }, mime, quality)
    })
  }

  function clearImage() {
    revokeActiveObjectUrl()
    imageRef.value = null
    previewReady.value = false
    outputSize.value = null
    imageInfo.value = null

    const canvas = canvasRef.value
    const context = canvas?.getContext('2d')

    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
    }
  }

  onBeforeUnmount(() => {
    revokeActiveObjectUrl()
    cancelAnimationFrame(drawRaf)
    if (sizeEstimateTimer) clearTimeout(sizeEstimateTimer)
  })

  return {
    imageRef,
    previewReady,
    imageType,
    outputSize,
    imageInfo,
    hasWatermarkText,
    loadImage,
    drawWatermark,
    scheduleDraw,
    downloadCanvas,
    shareCanvas,
    clearImage,
  }
}
