import { defineConfig } from 'vite'
import { react as aiI18nReact } from '@ai-i18n/react/vite'
import { aiI18n } from '@ai-i18n/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nReact()],
    }),
    react(),
  ],
})
