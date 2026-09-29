import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ThemeProvider from '@/components/ThemeProvider'

// After a new deploy, an open tab may request a lazy chunk that no longer exists (hashed
// filenames change); one reload picks up the new build. At most one automatic reload per
// minute: a real network failure would otherwise loop. After that (or without sessionStorage)
// the error reaches RouteErrorBoundary, which shows a message and a manual reload button.
const CHUNK_RELOAD_KEY = 'layk:chunk-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
