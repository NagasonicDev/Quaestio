import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/storage.ts'

// Ask the browser to keep this origin's data instead of evicting it under
// disk pressure. Best effort: a refusal just leaves storage as best-effort.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
