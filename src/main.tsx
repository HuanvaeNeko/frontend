import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initSentry } from './config/sentry'
import { registerSW } from 'virtual:pwa-register'

// 初始化 Sentry
initSentry()

// 注册 Service Worker (PWA)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      if (confirm('发现新版本，是否更新？')) {
        window.location.reload()
      }
    },
    onOfflineReady() {
      console.log('应用已准备好离线使用')
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

