// 一次性判定当前是不是移动端（手机 / 平板），不响应式 —— 会话中途不会变。
//
// 唯一用途：决定要不要显示「拍照」按钮。它的语义是「这个浏览器认不认
// input[capture]」。capture 是浏览器引擎的能力，不是输入设备的能力：
// 桌面端（包括带触摸屏的笔记本）一律忽略它，退化成文件选择器，
// 所以按钮留着就是名不副实。
//
// 两个信号取并集，且刻意偏向「判成移动端」：漏判会让手机用户彻底失去
// 拍照入口，误判只是桌面多一个按钮（点了最坏弹文件选择器，功能不缺失）。
// 两个信号的失效方向正好相反 —— 媒体查询会在平板外接键盘/触控板时翻成
// fine，UA 会在「请求桌面版网站」时被抹掉，取并集才算稳。

const MOBILE_UA = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini/i

function hasMobileUA() {
  if (typeof navigator === 'undefined') return false
  if (MOBILE_UA.test(navigator.userAgent)) return true
  // 新 iPadOS 默认把 UA 伪装成 macOS 桌面版，只能靠触摸点数认回来
  // （同 useInstallPrompt.ts 里的 isAppleMobile）
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// 用 (pointer: coarse) 而不是 (any-pointer: coarse)：触屏笔记本的主指针
// 仍是鼠标，capture 在那里同样不生效，不该把按钮放出来。
function hasCoarsePointer() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

export function useMobileDevice(): boolean {
  return hasMobileUA() || hasCoarsePointer()
}
