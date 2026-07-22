import { react as aiI18nReact } from '@ai-i18n/react/vite'
import { aiI18n } from '@ai-i18n/vite'
import { vue as aiI18nVue } from '@ai-i18n/vue/vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nVue(), aiI18nReact()],
    }),
    vue(),
    react(),
  ],
})
