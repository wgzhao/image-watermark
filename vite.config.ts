import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    cloudflare(),
    VitePWA({
      // 'prompt' 也是插件默认值，显式写出以免被误改：
      // 用户常常正载着图片、调好参数准备导出，自动 reload 会丢掉当前工作。
      // prompt 下 skipWaiting/clientsClaim 保持 false，新 SW 会等待用户确认。
      registerType: 'prompt',
      // 已自行 import virtual:pwa-register/vue，'auto' 因此不会重复注入注册脚本
      injectRegister: 'auto',
      manifest: {
        name: '图片水印打码工具',
        short_name: '图片水印',
        description:
          '纯浏览器本地处理的图片水印工具，不上传、不留存。适合身份证、驾照、护照等敏感证件图片的脱敏分享。',
        lang: 'zh-CN',
        theme_color: '#6366f1',
        background_color: '#fbfbfd',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['photo', 'utilities', 'productivity'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // manifest 里声明的图标和 webmanifest 本身，插件已自动注入预缓存；
      // 这两个不在 manifest.icons 里，需要单独声明。
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // 保持默认（**/*.{js,css,html}）。不要放宽到 png/svg/webmanifest：
        // 那会和插件自动注入的图标、webmanifest 撞车，产生重复预缓存条目。
        globPatterns: ['**/*.{js,css,html}'],
      },
      // 保持关闭（默认）。dev 下开 SW 会缓存开发资源，
      // 导致改代码不生效，且这个问题极难排查。
      devOptions: { enabled: false },
    }),
  ],
})
