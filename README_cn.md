[English Documentation](https://github.com/koodo-reader/extension/blob/main/README.md)

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader 扩展</h1>
<p><strong>为 Koodo Reader 提供网页剪藏与云存储支持的浏览器扩展。</strong></p>
</div>

## 功能

- **剪藏网页文章** — 一键将任意网页文章剪藏到您的图书库中，用于稍后阅读。需要您已安装 [Koodo Reader 桌面版](https://koodoreader.com)，文章会以 HTML 文件的格式保存到您的图书库中。
- **辅助云存储连接** — 由于浏览器对 WebDAV、S3 兼容存储的限制，您可能无法在浏览器中直接通过这些数据源同步或导入图书。安装此浏览器扩展后，可在 Koodo Reader 网页版中辅助完成这些连接。

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
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist_chrome` 目录

**Firefox**

1. 访问 `about:debugging#/runtime/this-firefox`
2. 点击「临时加载附加组件」
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
