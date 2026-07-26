import { useState, useEffect } from 'react'
import { APP_VERSION } from '../shared/lib/version.js'
import { haptic } from '../shared/lib/haptics.js'

const CHECK_MS = 10 * 60 * 1000 // раз в 10 минут + при возврате вкладки в фокус

// Плашка «Доступна новая версия»: сравнивает /version.json (генерируется при
// сборке, см. vite.config.js) со своей APP_VERSION. На dev-сервере файла нет —
// fetch тихо падает, плашка не показывается.
// tab — активная вкладка оболочки. Нужна не сама по себе: по её смене снятая
// кнопкой «Позже» плашка возвращается (обновиться всё-таки надо).
export default function UpdateToast({ tab }) {
  const [available, setAvailable] = useState(false)
  const [offline, setOffline] = useState(false)
  // Вкладка, на которой нажали «Позже». Пока сидим на ней — плашки нет;
  // ушли на другую — снова показываем. Сравнение с prevTab, а не просто
  // «dismissedAt === tab»: иначе возврат на ту же вкладку опять бы её прятал
  const [dismissedAt, setDismissedAt] = useState(null)
  const [prevTab, setPrevTab] = useState(tab)
  let dismissed = dismissedAt !== null
  if (prevTab !== tab) { // смена вкладки — сбрасываем прямо в рендере, без эффекта
    setPrevTab(tab)
    setDismissedAt(null)
    dismissed = false
  }

  // Сеть вернулась — прячем предупреждение, следующий тап снова пробует reload
  useEffect(() => {
    function onOnline() { setOffline(false) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

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

  // Без сети reload() либо зависает, либо кидает в браузерную страницу
  // «нет соединения» — вместо этого явно предупреждаем и не трогаем страницу
  function handleClick() {
    haptic() // строго синхронно, внутри жеста — иначе система отклик не даст
    if (!navigator.onLine) { setOffline(true); return }
    // Небольшая пауза перед reload: страница успевает показать нажатие кнопки,
    // а системный импакт — доиграть до сноса документа
    setTimeout(() => window.location.reload(), 90)
  }

  // «Позже» прячет плашку, но не насовсем: смена вкладки предложит снова
  function handleLater() {
    haptic()
    setDismissedAt(tab)
  }

  if (!available || dismissed) return null
  return (
    <div className="updateToast">
      <div className="updateToastCol">
        <span className="updateToastText">
          {offline ? 'Нет сети' : 'Доступна новая версия'}
        </span>
        <span className="updateToastSub">
          {offline ? 'Подключись и попробуй снова' : 'Приложение перезагрузится'}
        </span>
      </div>
      <button className="updateToastLater" onClick={handleLater}>
        Позже
      </button>
      <button className="updateToastBtn" onClick={handleClick}>
        Обновить
      </button>
    </div>
  )
}
