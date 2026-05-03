[English Documentation](https://github.com/koodo-reader/extension/blob/main/README.md)

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Koodo Reader 扩展</h1>
<p><strong>用于提升 Koodo Reader 阅读体验的浏览器扩展，</strong></p>
</div>

## 功能

- **增强同步功能** — 在 Koodo Reader 网页版中支持使用 WebDAV, 百度网盘和阿里云盘进行同步
- **增强导入功能** — 在 Koodo Reader 网页版中支持从 WebDAV, 百度网盘和阿里云盘等数据源导入图书

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
