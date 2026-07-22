import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp } from 'vue'
import { ReactPanel } from './ReactPanel'
import VuePanel from './VuePanel.vue'

createApp(VuePanel).mount('#vue-root')
createRoot(document.getElementById('react-root')!).render(
  <StrictMode>
    <ReactPanel />
  </StrictMode>,
)
