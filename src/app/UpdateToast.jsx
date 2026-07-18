import { useState, useEffect } from 'react'
import { APP_VERSION } from '../shared/lib/version.js'

const CHECK_MS = 10 * 60 * 1000 // раз в 10 минут + при возврате вкладки в фокус

// Плашка «Доступна новая версия»: сравнивает /version.json (генерируется при
// сборке, см. vite.config.js) со своей APP_VERSION. На dev-сервере файла нет —
// fetch тихо падает, плашка не показывается.
export default function UpdateToast() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let stopped = false
    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { v } = await res.json()
        if (!stopped && v && v !== APP_VERSION) setAvailable(true)
      } catch { /* оффлайн или dev — молчим */ }
    }
    check()
    const id = setInterval(check, CHECK_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!available) return null
  return (
    <div className="updateToast">
      <span className="updateToastText">Доступна новая версия</span>
      <button className="updateToastBtn" onClick={() => window.location.reload()}>
        Обновить
      </button>
    </div>
  )
}
