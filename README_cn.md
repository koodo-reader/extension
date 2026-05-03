[English Documentation](https://github.com/koodo-reader/extension/blob/main/README.md)

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader 扩展</h1>
<p><strong>用于提升 Koodo Reader 阅读体验的浏览器扩展，</strong></p>
</div>

## 功能

- **增强同步功能** — 在 Koodo Reader 网页版中启用 WebDAV, 百度网盘和阿里云盘等数据源的同步功能
- **增强导入功能** — 在 Koodo Reader 网页版中从 WebDAV, 百度网盘和阿里云盘等数据源导入图书的功能

## 快速开始

### 开发

```bash
# 安装依赖
npm install

# Chrome 开发模式（支持 HMR）
npm run dev

# 或指定浏览器
npm run dev:chrome
npm run dev:firefox
```

### 构建

```bash
# Chrome 生产构建
npm run build

# 或指定浏览器
npm run build:chrome
npm run build:firefox
```

构建产物分别输出到 `dist_chrome` 和 `dist_firefox` 目录。

### 加载扩展

**Chrome**

1. 访问 `chrome://extensions`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist_chrome` 目录

**Firefox**

1. 访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `dist_firefox` 目录内的任意文件

## 技术栈

- [React 19](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Vite 6](https://vitejs.dev/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)（可选的 Firefox 兼容层）

## 许可证

本项目基于 [GNU AGPL v3](https://github.com/koodo-reader/extension/blob/dev/LICENSE) 许可协议发布。

Koodo Reader 代理扩展是一款浏览器扩展，专为 [Koodo Reader](https://web.koodoreader.com/) Web 版设计。它通过拦截页面中的 `fetch` 和 `XMLHttpRequest` 请求，在扩展的 Service Worker 中重新发起，从而**绕过 CORS 跨域限制**，让 Koodo Reader Web 版能够正常访问需要跨域的资源。

## 功能特性

- **CORS 代理** — 拦截页面 `fetch` / `XMLHttpRequest` 请求，通过扩展后台脚本转发，绕过跨域限制
- **自动启用** — `localhost:3000` 和 `web.koodoreader.com` 自动加入白名单
- **手动控制** — 通过弹出面板可手动启用/禁用任意站点的代理功能
- **完整请求/响应支持** — 支持文本、二进制、FormData、ArrayBuffer 等多种请求体编码
- **跨浏览器** — 支持 Chrome 和 Firefox（Manifest V3）

## 工作原理

```
页面（MAIN world）
    │  window.fetch / XMLHttpRequest 被拦截
    │  postMessage (KOODO_REQ)
    ▼
内容脚本（isolated world）
    │  chrome.runtime.sendMessage
    ▼
后台脚本（Service Worker）
    │  fetch() 重新发起请求（无 CORS 限制）
    │  Base64 编码响应返回
    ▼
内容脚本 → postMessage (KOODO_RES) → 页面解码并返回
```

## 快速开始

### 开发

```bash
# 安装依赖
npm install

# Chrome 开发模式（带热更新）
npm run dev

# 或指定浏览器
npm run dev:chrome
npm run dev:firefox
```

### 构建

```bash
# Chrome 生产构建
npm run build

# 或指定浏览器
npm run build:chrome
npm run build:firefox
```

构建产物分别在 `dist_chrome` 和 `dist_firefox` 目录。

### 加载扩展

**Chrome**

1. 打开 `chrome://extensions`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist_chrome` 目录

**Firefox**

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `dist_firefox` 目录中的任意文件

## 技术栈

- [React 19](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Vite 6](https://vitejs.dev/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)（可选 Firefox 兼容）

## 许可

Copyright (C) 2024-2025 Koodo Reader 代理扩展 贡献者

本程序为自由软件：在 GNU Affero 通用公共许可证（GNU Affero General Public License）第三版或（按您的选择）任何后续版本的条款下，您可以重新分发和/或修改它。

本程序的分发是希望它有用，但**没有任何担保**；甚至没有适销性或特定用途的隐含担保。详情请参阅 GNU Affero 通用公共许可证。

您应该已随本程序收到一份 GNU Affero 通用公共许可证副本。如果没有，请参阅 <https://www.gnu.org/licenses/>。
