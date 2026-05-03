[中文文档](https://github.com/koodo-reader/extension/blob/main/README_cn_.md)

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader Extension</h1>
<p><strong>A web extension that enhances the reading experience for Koodo Reader.</strong></p>
</div>

## Features

- **CORS bypass** — Intercepts `fetch` / `XMLHttpRequest` requests from the page and forwards them through the extension's background script to bypass CORS restrictions

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

This library is distributed under the terms of [GNU AGPL v3](https://github.com/koodo-reader/extension/blob/dev/LICENSE)
