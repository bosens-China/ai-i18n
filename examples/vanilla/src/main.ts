import { getLangs, setLang, t } from 'virtual:ai-i18n'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main id="center">
    <h1>${t('Vanilla 示例')}</h1>
    <p>${t('显式调用会被静态提取')}</p>
    <label>
      ${t('语言')}
      <select id="language">
        ${getLangs()
          .map(({ value, label }) => `<option value="${value}">${label}</option>`)
          .join('')}
      </select>
    </label>
  </main>
`

document.querySelector<HTMLSelectElement>('#language')!.addEventListener(
  'change',
  async (event) => {
    await setLang((event.currentTarget as HTMLSelectElement).value)
  },
)
