import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** GitHub Pages 项目站路径；本地默认根路径便于预览。 */
const isPages = process.env.DEPLOY_TARGET === 'pages';

export default defineConfig({
  root: path.join(rootDir, 'docs'),
  title: 'ai-i18n',
  description: 'Vite AI 国际化插件',
  icon: '/favicon.png',
  logo: {
    light: '/favicon.png',
    dark: '/favicon.png',
  },
  logoText: 'ai-i18n',
  // Rspress 2 内置 zh UI 文案；自定义文案请用 i18nSource，勿再写 outlineTitle 等已移除字段
  lang: 'zh',
  siteOrigin: 'https://bosens-china.github.io',
  base: isPages ? '/ai-i18n/' : '/',
  outDir: 'dist',
  llms: true,
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/bosens-China/ai-i18n',
      },
    ],
  },
  route: {
    cleanUrls: true,
  },
  builderConfig: {
    performance: {
      // Windows 上 Rspack 持久化缓存偶发「目录不是空的」(os error 145)
      buildCache: process.platform !== 'win32',
    },
  },
});
