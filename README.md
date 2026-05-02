[中文文档](./README_cn_.md)

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader Proxy Extension</h1>
<p><strong>A browser extension for Koodo Reader Web — bypass CORS restrictions and enhance reading experience</strong></p>
</div>

## About

Koodo Reader Proxy Extension is a browser extension designed for the [Koodo Reader](https://web.koodoreader.com/) Web version. It intercepts `fetch` and `XMLHttpRequest` requests from the page and re-executes them in the extension's Service Worker, effectively **bypassing CORS restrictions** so that Koodo Reader Web can access cross-origin resources normally.

## Features

- **CORS Proxy** — Intercepts `fetch` / `XMLHttpRequest` requests from the page and forwards them through the extension's background script to bypass CORS restrictions
- **Auto-enabled** — `localhost:3000` and `web.koodoreader.com` are whitelisted automatically
- **Manual Control** — Enable or disable the proxy for any site via the popup panel
- **Full Request/Response Support** — Supports text, binary, FormData, ArrayBuffer, and other request body encodings
- **Cross-browser** — Supports Chrome and Firefox (Manifest V3)

## How It Works

```
Page (MAIN world)
    │  window.fetch / XMLHttpRequest intercepted
    │  postMessage (KOODO_REQ)
    ▼
Content Script (isolated world)
    │  chrome.runtime.sendMessage
    ▼
Background Script (Service Worker)
    │  fetch() re-executes request (no CORS restrictions)
    │  Returns Base64-encoded response
    ▼
Content Script → postMessage (KOODO_RES) → Page decodes and returns
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Chrome dev mode (with HMR)
npm run dev

# Or specify browser
npm run dev:chrome
npm run dev:firefox
```

### Build

```bash
# Chrome production build
npm run build

# Or specify browser
npm run build:chrome
npm run build:firefox
```

Build output goes to `dist_chrome` and `dist_firefox` directories respectively.

### Load Extension

**Chrome**

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist_chrome` directory

**Firefox**

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file inside the `dist_firefox` directory

## Tech Stack

- [React 19](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Vite 6](https://vitejs.dev/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) (optional Firefox compatibility)

## License

Copyright (C) 2024-2025 Koodo Reader Proxy Extension Contributors

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

---
