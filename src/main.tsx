import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Enforce dark mode before React mounts to avoid light-mode flash.
try {
  const root = document.documentElement
  root.classList.remove('light')
  root.classList.add('dark')
  root.style.colorScheme = 'dark'
  localStorage.setItem('vite-ui-theme', 'dark')
} catch {
  // Ignore storage/class failures in restricted environments.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
