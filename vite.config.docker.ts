import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'
import manifest from './manifest.json';

const outDir = resolve(__dirname, 'dist_docker');
const dockerManifest = {
  ...baseManifest,
  content_scripts: manifest.content_scripts.map((contentScript) => ({
    ...contentScript,
    matches: ['https://*/*', 'http://*/*'],
  })),
  externally_connectable: {
    ...manifest.externally_connectable,
    matches: ['https://*/*', 'http://*/*'],
  },
  background: {
    service_worker: 'src/pages/background/index.ts',
    type: 'module'
  },
} as ManifestV3Export;

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: dockerManifest,
        browser: 'chrome',
        contentScripts: {
          injectCss: true,
        }
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir
    },
  })
)
