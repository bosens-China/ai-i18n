// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

/** GitHub Pages 项目站路径；本地默认根路径便于预览。 */
const isPages = process.env.DEPLOY_TARGET === 'pages';

// https://astro.build/config
export default defineConfig({
  site: 'https://bosens-china.github.io',
  base: isPages ? '/ai-i18n' : '/',
  integrations: [
    starlight({
      title: 'ai-i18n',
      description: '面向 Vite 8 的浏览器端 AI 国际化插件',
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/bosens-China/ai-i18n',
        },
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
      },
      sidebar: [
        { label: '快速上手', slug: 'getting-started' },
        { label: '框架上手', slug: 'frameworks' },
        { label: '配置与 API', slug: 'api' },
        { label: '文件与工作流', slug: 'workflow' },
        { label: 'AI 翻译', slug: 'ai-translation' },
        { label: 'AI 工具接入', slug: 'ai-tools' },
        { label: '在线演示', slug: 'demo' },
      ],
    }),
  ],
});
