<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader 浏览器扩展</h1>
<p><strong>提升 Koodo Reader 阅读体验的浏览器扩展。</strong></p>
</div>

## 功能

- **CORS 绕过** — 拦截页面中的 `fetch` / `XMLHttpRequest` 请求，通过扩展的后台脚本转发，绕过 CORS 限制

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
