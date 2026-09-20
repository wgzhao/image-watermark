# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev       # Start Vite dev server
pnpm build     # Production build (vite build)
pnpm preview   # Build, then serve via `wrangler dev` — mimics Cloudflare, NOT `vite preview`
pnpm deploy    # Build, then deploy to Cloudflare Workers
```

Package manager is **pnpm** (locked to 10.5.2).

There is no linter, no test framework, and no typecheck script. Don't invent `pnpm test` / `pnpm lint` /
`pnpm typecheck` invocations. Two consequences worth knowing:

- `pnpm build` does **not** typecheck — Vite/esbuild strips types without validating them. A build succeeding
  is not evidence that types are sound.
- `tsc --noEmit` only checks plain `.ts` files. `.vue` internals need `vue-tsc`, which isn't installed; the
  `declare module '*.vue'` shim in `src/env.d.ts` just makes `.vue` imports resolve as opaque components.

## What this is

A single-page Vue 3 app that tiles a text watermark across an image — entirely client-side via the Canvas API.
No image data leaves the browser; this is a privacy promise the README and UI both state, so never introduce a
network call, upload, or third-party image service.

The app UI strings and `README.md` are in **Chinese**. New user-facing text should match.

## Architecture

**Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite 6, deployed to Cloudflare Workers
Static Assets (SPA fallback via `wrangler.jsonc`).

**Source layout (`src/`):**

- `main.ts` — entry point, mounts App with global CSS
- `App.vue` — root component. Owns the reactive `WatermarkOptions` (single source of truth), watches each
  field to re-draw, and owns the derivations that gate export: `hasWatermarkText` (empty text ⇒ no download
  or share) and `canDownload`. Also registers the window-level paste handler and routes the canvas click to
  share-or-download
- `components/CanvasPreview.vue` — thin wrapper that renders a `<canvas>` and exposes its element ref via
  `defineExpose({ canvasEl })`
- `components/WatermarkControls.vue` — upload surface (drag-and-drop, file picker, camera capture via
  `capture="environment"`), text/preset inputs, and a collapsible "advanced" section with color, alpha, angle,
  spacing, and font-size controls. Two-way binds options via `defineModel`. Persists the last-used watermark
  text to `localStorage` under `watermark-last-text`
- `composables/useWatermarkCanvas.ts` — all canvas and export logic (see below)
- `types/watermark.ts` — `WatermarkOptions` interface (text, color, alpha, angle, space, size)
- `style.css` — all styles in one file; no CSS framework. Light theme with glassmorphism cards, responsive
  down to mobile

**Data flow:** `WatermarkControls` ↔ `App.vue` (v-model options) → composable redraws the canvas on option
change. `CanvasPreview` owns the `<canvas>` element, so `App.vue` has to reach through it with
`watchEffect(() => canvasRef.value = previewRef.value?.canvasEl ?? null)` before handing the ref to the
composable — that indirection is load-bearing; the composable receives a `Ref<HTMLCanvasElement | null>`, not
an element.

## `useWatermarkCanvas` — the part that needs reading

Everything non-obvious lives here. The composable takes the canvas ref and returns reactive state
(`previewReady`, `imageType`, `outputSize`, `imageInfo`) plus actions (`loadImage`, `scheduleDraw`,
`downloadCanvas`, `shareCanvas`, `clearImage`).

Rendering:

- Output is sized to the image's **natural** dimensions, clamped by `MAX_DIMENSION` (4096) on the longest
  edge to keep mobile from choking on huge photos. `imageInfo` reports the *original* dimensions; the canvas
  is the clamped ones.
- Watermark text is split on `\n` into lines, blank lines dropped. Each tile draws all lines stacked
  vertically; the widest line plus one character of margin sets the horizontal step, and
  `space * fontSize + blockHeight` sets the vertical step. Tiling ranges over the canvas diagonal so the
  rotated pattern still covers corners.
- Font size is relative, not absolute: `size * max(15, min(width, height) / 25)`. Colors are `#rrggbb` hex
  converted to `rgba()` with the separate alpha; a malformed color silently falls back to black.
- Redraws go through `scheduleDraw`, which coalesces bursts with `requestAnimationFrame`. There's no separate
  preview-scale canvas: the one canvas is the export, so anything drawn here ships to the user.

Export:

- Output format follows the **input** format via `MIME_MAP` (JPEG/PNG/WebP pass through, GIF→PNG since canvas
  flattens animation), with JPEG quality 0.92. Filenames are generated as `YYYY-MM-DD HHMMSS.ext`.
  Note the extension is `jpg` for JPEG and `png` otherwise — a WebP input produces a `.png`-named file whose
  bytes are WebP. Preserve format-matching when touching export; the README advertises it.
- `estimateOutputSize` is debounced 400ms after a draw and encodes a throwaway blob via `canvas.toBlob` purely
  to report the size to the UI. It's a real encode, not an estimate — don't call it on every keystroke.
- `shareCanvas` uses the Web Share API and returns `false` on both "unsupported" and "user cancelled";
  `App.vue` treats `false` as a signal to fall back to download. So a successful share and a cancelled share
  are deliberately indistinguishable to the caller.
- `drawWatermark` bails out early on empty text and leaves the image **un-watermarked** on the canvas. This is
  why the export buttons are gated upstream on `hasWatermarkText` — the guard is in `App.vue`, not the
  composable, so don't loosen it.

Image loading and cleanup:

- Images load via `URL.createObjectURL` into an `Image`. The composable tracks `activeObjectUrl` and compares
  it inside `onload` to discard stale loads — a fast second file selection can't clobber the newer one, and
  the same guard is used in `onerror`.
- The object URL is revoked twice-over: replaced on the next `loadImage`, and revoked once the image has
  finished decoding (the decoded `HTMLImageElement` stays valid after revocation). `clearImage` and
  `onBeforeUnmount` also revoke. Keep this discipline — this app's whole premise is not leaking user data.
- `clearImage` zeroes the canvas dimensions, which is what makes the element visibly disappear.

One dead relic: the composable's `hasWatermarkText` is a `computed(() => true)` stub that `App.vue` overrides
with its own real one. Nothing consumes the stub — don't wire anything to it.

## Deployment

Cloudflare Workers with `@cloudflare/vite-plugin`. Config in `wrangler.jsonc`: `not_found_handling:
single-page-application` for client-side routing, `nodejs_compat`, observability enabled. There is no server
code — the worker exists only to serve static assets.
