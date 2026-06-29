# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Chrome dev mode with HMR (nodemon watch)
npm run dev:chrome   # Explicit Chrome dev mode
npm run dev:firefox  # Firefox dev mode
npm run build        # Chrome production build → dist_chrome/
npm run build:chrome # Explicit Chrome build
npm run build:firefox # Firefox build → dist_firefox/
```

No test runner is configured. Lint is via ESLint 9 (`npx eslint .`).

## Architecture

This is a **Manifest V3 browser extension** that extends Koodo Reader with web article clipping and WebDAV/S3 storage bypass. Built with Vite + CRXJS plugin, React 19, TypeScript, and Tailwind CSS 4.

### Three-world message bridge

The core architecture separates code across three isolated contexts:

1. **MAIN world** (`src/pages/content/main-world.ts`) — Runs in the page's JavaScript context. Intercepts `fetch` and `XHR` calls on enabled sites, serializes responses (including binary → Base64), and sends them via `window.postMessage`.

2. **Isolated world** (`src/pages/content/index.tsx`) — Runs in the extension's isolated context. Listens to `window.postMessage` from MAIN world and forwards to service worker via `chrome.runtime.sendMessage`. Also injects the MAIN world script.

3. **Service worker** (`src/pages/background/index.ts`) — Handles `chrome.runtime.onMessage`. Manages per-site enable/disable state in `chrome.storage.sync`, performs the actual network forwarding for bypassing CORS/WebDAV limits, and responds to popup actions.

### Key design decisions

- **Auto-enabled sites**: `web.koodoreader.com` and `*.koodoreader.cn` are always active without user action.
- **Forwarding blacklist**: Requests to `koodoreader.com` and `chatwoot.com` domains are never forwarded through the tunnel.
- **Binary transfer**: Responses are Base64-encoded through the JSON message channel to safely carry binary data (e.g., ebook files).
- **WebDAV auth**: URL credentials (user:password@host) are extracted and converted to `Authorization: Basic ...` headers.
- **Popup** (`src/pages/popup/Popup.tsx`) — React UI for toggling extension on/off per site, saving articles, and managing state.

### Localization

i18n strings live in `src/locales/en/messages.json` and `src/locales/zh_CN/messages.json`. A custom Vite plugin (`custom-vite-plugins.ts`) emits these as extension-accessible `_locales/` assets. Use `chrome.i18n.getMessage()` for runtime strings.

### Build system

`vite.config.base.ts` is shared between Chrome (`vite.config.ts`) and Firefox (`vite.config.firefox.ts`) builds. The CRXJS plugin handles manifest processing and content script injection. `custom-vite-plugins.ts` contains two plugins: i18n asset emission and dev-mode icon stripping.
