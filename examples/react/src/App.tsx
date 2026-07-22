import { useI18n } from '@ai-i18n/react'

function App() {
  const { t, setLang, currentLang, langs } = useI18n()

  return (
    <main id="center">
      <h1>{t('React 示例')}</h1>
      <p>{t('Hook 与 Vite extractor 共享 Runtime')}</p>
      <label>
        {t('语言')}
        <select
          value={currentLang}
          onChange={(event) => void setLang(event.currentTarget.value)}
        >
          {langs.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </main>
  )
}

export default App
