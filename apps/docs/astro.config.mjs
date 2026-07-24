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
      logo: {
        src: './src/assets/favicon.png',
      },
      favicon: '/favicon.png',
      customCss: ['./src/styles/custom.css'],
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
        Sidebar: './src/components/Sidebar.astro',
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      sidebar: [
        {
          label: '入门指南',
          items: [
            { label: '快速上手', slug: 'getting-started' },
            { label: '框架上手', slug: 'frameworks' },
          ],
        },
        {
          label: '核心工作流',
          items: [
            { label: '文件与工作流', slug: 'workflow' },
            { label: 'AI 翻译', slug: 'ai-translation' },
            { label: 'AI 工具接入', slug: 'ai-tools' },
          ],
        },
        {
          label: '生态与集成',
          items: [
            { label: 'ESLint 9', slug: 'eslint' },
            { label: 'MCP 工具', slug: 'mcp' },
          ],
        },
        {
          label: '配置与 API',
          items: [
            { label: 'Vite 插件配置', slug: 'api/vite' },
            { label: 'Runtime API', slug: 'api/runtime' },
            { label: '@boses/openai', slug: 'api/openai' },
            { label: '低层库 API', slug: 'api/libraries' },
          ],
        },
      ],
    }),
  ],
});
