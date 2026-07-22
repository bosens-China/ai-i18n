import { useI18n } from '@ai-i18n/react'

export function ReactPanel() {
  const { t, setLang, currentLang } = useI18n()

  return (
    <section>
      <h2>{t('React 面板')}</h2>
      <p>
        {t('当前语言')}：{currentLang}
      </p>
      <button type="button" onClick={() => void setLang('zh-CN')}>
        {t('切换到中文')}
      </button>
    </section>
  )
}
