# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev       # Start Vite dev server
pnpm build     # Production build (vite build)
pnpm preview   # Build + serve locally via Wrangler (mimics Cloudflare)
pnpm deploy    # Build + deploy to Cloudflare Workers
```

Package manager is **pnpm** (locked to 10.5.2).

## Architecture

A single-page Vue 3 app that adds tiled text watermarks to images — entirely client-side using the Canvas API. No image data leaves the browser.

**Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite 6, deployed to Cloudflare Workers Static Assets (SPA fallback).

**Source layout (`src/`):**

- `main.ts` — entry point, mounts App with global CSS
- `App.vue` — root component. Holds reactive `WatermarkOptions`, watches all option fields to auto-refresh the preview, coordinates between `WatermarkControls` and `CanvasPreview`. Gets a reference to the preview's `<canvas>` via a `watchEffect` that reads the exposed `canvasEl` from `CanvasPreview`
- `components/CanvasPreview.vue` — thin wrapper that renders a `<canvas>` and exposes its element ref via `defineExpose({ canvasEl })`
- `components/WatermarkControls.vue` — drag-and-drop + file-picker upload zone, watermark text input, and a collapsible "advanced" section with sliders for color, alpha, angle, spacing, and font size. Uses `defineModel` for two-way binding of options
- `composables/useWatermarkCanvas.ts` — all canvas logic: loads images via `URL.createObjectURL`, draws the image at native resolution, then tiles the watermark text across the canvas (rotated, with configurable spacing/size). Handles download as PNG and cleanup of object URLs. The canvas is sized to the image's natural dimensions
- `types/watermark.ts` — `WatermarkOptions` interface (text, color, alpha, angle, space, size)
- `style.css` — all styles in one file; no CSS framework. Light theme with glassmorphism cards, responsive down to mobile

**Data flow:** `WatermarkControls` ↔ `App.vue` (v-model options) → `useWatermarkCanvas` watches options reactively → redraws on canvas. `CanvasPreview` exposes its canvas element up to `App.vue` for the composable to use.

**Deployment:** Cloudflare Workers with `@cloudflare/vite-plugin`. Config in `wrangler.jsonc` — single-page-application fallback for client-side routing.
