import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
