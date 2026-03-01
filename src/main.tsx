import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('[ClawKernel] Root element #root not found — is index.html corrupted?')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
