import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import { AdminProvider } from './app/AdminContext.jsx'
import { initErrorTrap } from './shared/lib/errorTrap.js'
import './index.css'
// Побочный эффект: вешает слушатель beforeinstallprompt как можно раньше
// (см. pwaInstall.js) — событие приходит один раз за загрузку, ловить надо
// сразу, ещё до рендера React
import './shared/lib/pwaInstall.js'

// Регистрируем сервис-воркер СРАЗУ при загрузке (не только когда пользователь
// включит пуши в профиле, как раньше) — Android/Chromium считает сайт
// «устанавливаемым» (предлагает «Установить приложение», а не просто
// закладку) только если на странице уже есть зарегистрированный service
// worker. Сама регистрация не спрашивает разрешение на уведомления —
// это отдельный шаг в push.js/subscribePush(), вызывается только по тапу
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/push-sw.js').catch(() => {})
}

// Глобальный перехват ошибок — до рендера, чтобы поймать и ошибки старта
initErrorTrap()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AdminProvider>
        <App />
      </AdminProvider>
    </ErrorBoundary>
  </StrictMode>,
)
