import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './scan.css'

// Same theme choice as the main app (same origin); otherwise follows the phone's setting.
try {
  const t = localStorage.getItem('ecc-theme')
  if (t) document.documentElement.setAttribute('data-theme', t)
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Open offline after the first visit (production build only; see public/scan/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
