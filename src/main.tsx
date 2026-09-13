import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { FeaturePreviewApp } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.VITE_DRAFT_MODE === 'true' && import.meta.env.VITE_FEATURE_REVIEW !== 'false' ? <FeaturePreviewApp /> : <App />}
  </React.StrictMode>,
)
