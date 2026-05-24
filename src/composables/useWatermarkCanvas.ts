import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { WatermarkOptions } from '../types/watermark'

function pad(value: number) {
  return value < 10 ? `0${value}` : `${value}`
}

function generateFileName() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
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

export function useWatermarkCanvas(canvasRef: Ref<HTMLCanvasElement | null>) {
  const imageRef = ref<HTMLImageElement | null>(null)
  const previewReady = ref(false)

  let activeObjectUrl: string | null = null

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

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const context = canvas.getContext('2d')

    if (!context || width === 0 || height === 0) {
      return
    }

    canvas.width = width
    canvas.height = height

    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0)

    const text = options.text.trim()
    if (!text) {
      return
    }

    const fontSize = options.size * Math.max(15, Math.min(width, height) / 25)
    context.save()
    context.translate(width / 2, height / 2)
    context.rotate((options.angle * Math.PI) / 180)
    context.fillStyle = hexToRgba(options.color, options.alpha)
    context.font = `bold ${fontSize}px -apple-system, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif`

    const textWidth = context.measureText(text).width
    const marginWidth = context.measureText('啊').width
    const diagonal = Math.sqrt(width * width + height * height)
    const stepX = Math.max(textWidth + marginWidth, 1)
    const stepY = Math.max(options.space * fontSize, 1)
    const repeatX = Math.ceil(diagonal / stepX)
    const repeatY = Math.ceil(diagonal / stepY / 2)

    for (let x = -repeatX; x <= repeatX; x += 1) {
      for (let y = -repeatY; y <= repeatY; y += 1) {
        context.fillText(text, stepX * x, stepY * y)
      }
    }

    context.restore()
  }

  function loadImage(file: File, options: WatermarkOptions) {
    revokeActiveObjectUrl()
    previewReady.value = false
    imageRef.value = null

    const loadedImage = new Image()
    const objectUrl = URL.createObjectURL(file)
    activeObjectUrl = objectUrl

    loadedImage.onload = () => {
      if (activeObjectUrl !== objectUrl) {
        return
      }

      imageRef.value = loadedImage
      previewReady.value = true
      drawWatermark(options)
      revokeActiveObjectUrl()
    }

    loadedImage.onerror = () => {
      if (activeObjectUrl === objectUrl) {
        revokeActiveObjectUrl()
      }
      imageRef.value = null
      previewReady.value = false
      alert('图片读取失败')
    }

    loadedImage.src = objectUrl
  }

  function downloadCanvas() {
    const canvas = canvasRef.value

    if (!canvas || !previewReady.value) {
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = generateFileName()
      link.href = url
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    }, 'image/png')
  }

  function clearImage() {
    revokeActiveObjectUrl()
    imageRef.value = null
    previewReady.value = false

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
  })

  return {
    imageRef,
    previewReady,
    loadImage,
    drawWatermark,
    downloadCanvas,
    clearImage,
  }
}
