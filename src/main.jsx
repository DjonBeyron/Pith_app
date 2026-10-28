// Самым первым: режим «новенький» подменяет localStorage до того, как его начнёт читать остальное приложение
import './shared/lib/newbieBoot.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import { AdminProvider } from './app/AdminContext.jsx'
import { LessonNavProvider } from './app/LessonNavContext.jsx'
import { initErrorTrap } from './shared/lib/errorTrap.js'
import { startStallWatch, startViewportWatch } from './shared/lib/feedDebug.js'
import { startTouchWatch } from './shared/lib/touchWatch.js'
import { applyPerfFlagClasses } from './shared/lib/perfFlags.js'
import { applyWeakDeviceClasses } from './shared/lib/deviceTier.js'
import { initAnalytics } from './shared/lib/analytics/track.js'
import { initShellClient } from './shared/lib/shellClient.js'
import './index.css'
// Побочный эффект: вешает слушатель beforeinstallprompt как можно раньше
// (см. pwaInstall.js) — событие приходит один раз за загрузку, ловить надо
// сразу, ещё до рендера React
import './shared/lib/pwaInstall.js'

// Сервис-воркер нужен всегда (не только когда пользователь включит пуши в профиле): Android/Chromium считает сайт
// «устанавливаемым» только если на странице есть зарегистрированный service worker, а кеш оболочки (быстрый старт)
// отдаёт страницу мгновенно. Регистрация идёт ПОСЛЕ загрузки (install качает все файлы сборки), там же проверка новой
// версии воркера и плашка «Доступна новая версия» — см. shared/lib/shellClient.js. Сама регистрация не спрашивает
// разрешение на уведомления — это отдельный шаг в push.js/subscribePush(), вызывается только по тапу
initShellClient()

// Глобальный перехват ошибок — до рендера, чтобы поймать и ошибки старта
initErrorTrap()
// Сторож подвисаний главного потока (лаг всего телефона при сворачивании
// на iPhone) — пишет в DBG-лог ленты, см. feedDebug.js
startStallWatch()
startViewportWatch()
// Сторож жестов: где начался свайп и сдвинулся ли контейнер (см. touchWatch.js)
startTouchWatch()
// Флаги бисекции лага сворачивания (классы на <html>, см. perf-flags.css)
applyPerfFlagClasses()
// Слабое устройство: класс .weak-device на <html> (см. styles/weak-device.css)
applyWeakDeviceClasses()
// Журнал продуктовой аналитики: открытие, открытие из пуша, отправка при
// сворачивании (см. analytics/track.js)
initAnalytics()

// Рендер — ПОСЛЕ первого кадра страницы. Модульный скрипт выполняется, когда HTML разобран, и если бандл уже лежит в кеше
// воркера, это может случиться раньше первой отрисовки: синхронный монтаж React (десятки мс на телефоне) отодвинул бы первый кадр,
// а на iPhone до первого кадра экран белый. Колбэк rAF идёт до отрисовки кадра, setTimeout из него — уже после. Сплэш всё равно
// держит лого ≥ 900 мс, задержка в один кадр незаметна. Страховка таймером — если кадров нет (приложение открыто в фоне)
function render() {
  if (render.done) return
  render.done = true
  // Метка в журнале старта (inline-скрипт index.html, Админ → «Старт»): модули выполнены, запускаем рендер
  window.__startMark?.('main-render')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <AdminProvider>
          <LessonNavProvider>
            <App />
          </LessonNavProvider>
        </AdminProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}
requestAnimationFrame(() => setTimeout(render, 0))
setTimeout(render, 150)
