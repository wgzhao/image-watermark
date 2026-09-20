import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from 'vue'

const COOLDOWN_KEY = 'install-hint-dismissed-until'
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

export type InstallPlatform = 'ios-safari' | 'macos-safari' | 'chromium'

// 不在 lib.dom.d.ts 里，需要自己声明
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readUA() {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

// 新 iPadOS 默认把 UA 伪装成 macOS 桌面版，只能靠触摸点数区分
function isAppleMobile() {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// 其它浏览器（Chrome/Firefox/Edge/Opera，iOS 上还包括它们的内核包装版）
// 的 UA 里也带 Safari/，靠这些 token 排除掉。
// Version/ 是 Safari 特有的正向标志，Chrome 等都没有——加它进一步收紧。
// Firefox 的 UA 不含 Safari/，已被第一道闸挡住；Gecko/ 是冗余的第二道。
function isSafari() {
  const ua = readUA()
  if (!/Safari\//.test(ua)) return false
  if (!/Version\//.test(ua)) return false
  return !/Chrome\/|Chromium\/|CriOS|FxiOS|EdgiOS|Edg|OPR|Firefox|Gecko\//.test(ua)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari 专有，matchMedia 在旧版 iOS 上不可靠
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function detectSafariPlatform(): 'ios-safari' | 'macos-safari' | null {
  if (isStandalone()) return null
  if (isAppleMobile()) return isSafari() ? 'ios-safari' : null
  // 必须排除 Apple 移动端，否则 iPadOS 会被 /Macintosh/ 误判成 macOS
  if (/Macintosh/.test(readUA())) return isSafari() ? 'macos-safari' : null
  return null
}

// 存的是绝对时间戳而不是布尔值，这样冷却期到期后能自动恢复提示
function readCooldown(): boolean {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY)
    if (!raw) return false
    const until = Number(raw)
    if (!Number.isFinite(until)) return false
    return Date.now() < until
  } catch {
    // localStorage unavailable — ignore
    return false
  }
}

function startCooldown() {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS))
  } catch {
    // localStorage unavailable — ignore
  }
}

export interface UseInstallPrompt {
  platform: ComputedRef<InstallPlatform | null>
  canPrompt: ComputedRef<boolean>
  dismissed: Ref<boolean>
  promptInstall: () => Promise<void>
  dismiss: () => void
}

export function useInstallPrompt(): UseInstallPrompt {
  // shallowRef 而非 ref：事件对象是原生实例，不该被深层代理。
  // ref() 实际上也能工作（Vue 的 reactive() 会放过非普通对象），但那是依赖
  // Vue 内部实现细节，失败表现是原生方法被代理后抛 Illegal invocation。
  const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const dismissed = ref(false)
  const cooledDown = ref(readCooldown())

  // Safari 走 UA 判定（它永远不会有安装事件）；Chromium 一律由事件驱动，
  // 不靠 UA 猜——事件触发本身就证明「这是 Chromium 且有真实安装句柄」
  const safariPlatform = detectSafariPlatform()

  const canPrompt = computed(() => deferredPrompt.value !== null)

  const platform = computed<InstallPlatform | null>(() => {
    if (installed.value || dismissed.value || cooledDown.value) return null
    // 有真实安装句柄时优先用它：事件比 UA 猜测可靠。
    // 顺序反过来会留下一个会让安装悬空的组合——UA 像 Safari 却收到了事件时，
    // 我们会 preventDefault 却永远不消费它，而那正是要避免的静默禁用安装。
    if (deferredPrompt.value) return 'chromium'
    if (safariPlatform) return safariPlatform
    return null
  })

  function onBeforeInstallPrompt(event: Event) {
    // 只在确实要展示自己的引导时才拦截浏览器原生 UI。
    // 若 preventDefault 之后从不调用 prompt()，可能静默地彻底禁用安装；
    // 所以冷却期内或已安装时直接放行，让原生入口（如地址栏安装图标）继续可用。
    if (installed.value || dismissed.value || readCooldown()) {
      return
    }
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  }

  function onAppInstalled() {
    installed.value = true
    deferredPrompt.value = null
  }

  async function promptInstall() {
    const event = deferredPrompt.value
    if (!event) return

    // 事件是一次性的，先清空再消费，避免二次调用抛错
    deferredPrompt.value = null

    try {
      await event.prompt()
      await event.userChoice
    } catch {
      // 用户取消或浏览器拒绝 —— 都不是错误
    }
  }

  function dismiss() {
    dismissed.value = true
    startCooldown()
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onAppInstalled)
  })

  return { platform, canPrompt, dismissed, promptInstall, dismiss }
}
