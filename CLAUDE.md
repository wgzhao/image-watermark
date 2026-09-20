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

The service worker is **disabled in `pnpm dev`** on purpose (see PWA below), so the only places to test
install/offline behaviour are `pnpm preview` (localhost counts as a secure origin) or a real `pnpm deploy`.
A passing `pnpm dev` tells you nothing about the PWA.

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

**Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite 6, PWA via `vite-plugin-pwa`,
deployed to Cloudflare Workers Static Assets (SPA fallback via `wrangler.jsonc`).

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
- `../public/` — PWA icons. `icon.svg` / `icon-maskable.svg` are the sources; the PNGs beside them are
  rasterized from those (see the PWA section). Edit the SVG, then re-rasterize — don't hand-edit a PNG

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

## PWA

Config lives in `vite.config.ts` under `VitePWA()`. The app is an unusually easy PWA case: it has **no
backend and makes no network calls at all**, so there is no runtime caching strategy to design — precaching
the app shell *is* the whole feature.

**`registerType: 'prompt'`, and that choice is deliberate.** The user is typically mid-task — image loaded,
parameters dialled in, about to export — when an update lands. `autoUpdate` would reload the page out from
under them and silently discard that work (the image only exists in memory). So the new service worker is
kept waiting, and `App.vue` shows a `.pwa-toast` banner offering 立即刷新 / 稍后. With `prompt`, the plugin
leaves `skipWaiting`/`clientsClaim` false and `sw.js` only calls `skipWaiting()` inside a `SKIP_WAITING`
message handler — that's correct, not a bug. `updateServiceWorker()` in `App.vue` is what posts that message.

Three traps that will bite anyone editing this config:

- **`workbox-window` must stay a direct `dependencies` entry.** It's a dependency *and* a peerDependency of
  `vite-plugin-pwa`, but pnpm's strict linking means it isn't resolvable from the app root, and the virtual
  register module imports it from *the app's* context. Drop it and `pnpm build` fails with
  `Rollup failed to resolve import "workbox-window"`.
- **Do not widen `workbox.globPatterns` to include `png`/`svg`/`webmanifest`.** The plugin already injects the
  `manifest.icons` entries and the webmanifest itself into the precache. A broad glob matches them a second
  time and silently produces duplicate precache entries (the build log still says "entries"; only the
  generated `sw.js` shows the duplication). Files the plugin doesn't inject — `icon.svg`,
  `apple-touch-icon.png` — go in `includeAssets` instead.
- **Keep `devOptions.enabled: false`.** Enabling the SW in dev caches dev assets, so code changes stop taking
  effect and the cause is very hard to find.

**Privacy invariant, easy to break:** the worker caches the app shell only. User images travel as `File` /
`blob:` URLs via `URL.createObjectURL` and never touch the network, so they cannot enter the cache. If you
ever add runtime caching routes, make sure no image path can match them — "图片不出浏览器" is the product
promise, and an over-broad `runtimeCaching` rule would quietly break it.

Icons: `public/icon.svg` (rounded) and `public/icon-maskable.svg` (full-bleed square — maskable icons must run
to the edges because the platform applies its own crop; shipping rounded corners here shows transparent
notches). Rasterize with:

```bash
rsvg-convert -w 192 -h 192 public/icon.svg          -o public/pwa-192x192.png
rsvg-convert -w 512 -h 512 public/icon.svg          -o public/pwa-512x512.png
rsvg-convert -w 512 -h 512 public/icon-maskable.svg -o public/maskable-512x512.png
rsvg-convert -w 180 -h 180 public/icon-maskable.svg -o public/apple-touch-icon.png
```

To verify a build, don't trust the plugin's own summary — read `dist/sw.js` and check the URL list inside
`precacheAndRoute([...])`, which is the authoritative record of what works offline. Also confirm `/sw.js` is
served as `text/javascript` and not swallowed by the SPA fallback (it isn't: real files take precedence over
`not_found_handling`, but this is worth re-checking if the assets config ever changes).

### Install hint

`src/composables/useInstallPrompt.ts` drives the "install this app" notice, rendered through the same
`.pwa-toast`. Three invariants that are easy to break:

- **The two detection branches are mutually exclusive by browser engine, which is why there is no grace
  timer.** Chromium is detected by *the event firing*, not by UA — `beforeinstallprompt` is a positive,
  unforgeable signal that a real install handle exists. Safari is detected by a positive UA match. Since
  Safari never fires the event and Chromium never matches the Safari predicate, a "wait Ns to see if the
  event arrives" timer is dead code. Don't add one.
- **`preventDefault()` on `beforeinstallprompt` is conditional and irreversible.** It can't be undone for
  that event instance, and `prompt()` needs a user gesture, so there is no programmatic recovery. The
  handler therefore checks "am I actually going to show my own UI?" *before* cancelling — a user in cooldown
  or already installed gets no `preventDefault`, leaving Chrome's own install affordance intact. **Never call
  it "to be safe."** (Note: the folk claim that cancelling *permanently disables* installation traces to
  Chrome 68–75's mini-infobar and is probably outdated; the precondition rule is still correct, just for the
  narrower reason above.)
- **The 30-day cooldown applies to the install hint only.** The update and offline notices stay
  session-scoped (`pwaDismissed`). Making those persist would mean one "稍后" silently suppresses every
  future version update — the same class of mistake the `registerType: 'prompt'` note guards against.

`platform` prefers the event over the UA match when both are available, so a browser that both fires the
event and has a Safari-like UA still gets the working install button rather than instructions it can't use.

Platform copy lives in `App.vue`'s `installCopy` computed, not in the composable. The macOS wording carries a
"需 macOS 14" hedge because Add to Dock requires Sonoma while Safari 17 also ships on Ventura/Monterey — and
macOS version is not recoverable from the UA (it's frozen at `10_15_7`). Don't "clean up" that hedge.

Testing the install hint needs a real engine per branch: UA spoofing in Chrome does **not** reach the Safari
branches, because Chrome fires the event regardless of the claimed UA. Block the manifest at the network
layer (`Network.setBlockedURLs(['*manifest.webmanifest*'])`) to make Chrome non-installable, which is how you
reach and verify the Safari copy.

## Deployment

Cloudflare Workers with `@cloudflare/vite-plugin`. Config in `wrangler.jsonc`: `not_found_handling:
single-page-application` for client-side routing, `nodejs_compat`, observability enabled. There is no server
code — the worker exists only to serve static assets.
