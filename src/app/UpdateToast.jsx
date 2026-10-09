import { useState, useEffect } from 'react'
import { haptic } from '../shared/lib/haptics.js'
import { purgeShellAndReload } from '../shared/lib/shellClient.js'
import { useUpdateAvailable } from './useUpdateAvailable.js'

// Плашка «Доступна новая версия». Основной сигнал — сообщение service worker'а: он уже поставил кеш новой сборки
// (кеш оболочки, public/push-sw.js), и reload отдаст её мгновенно. Без кеша оболочки (dev, воркер выключен) — как раньше,
// по /version.json (генерируется при сборке, см. vite.config.js). Логика «когда показать» — useUpdateAvailable.js.
// Автоматической перезагрузки нет: только по тапу «Обновить».
// tab — активная вкладка оболочки. Нужна не сама по себе: по её смене снятая
// кнопкой «Позже» плашка возвращается (обновиться всё-таки надо).
export default function UpdateToast({ tab }) {
  const how = useUpdateAvailable()
  const available = how !== null
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

  // Без сети reload() либо зависает, либо кидает в браузерную страницу
  // «нет соединения» — вместо этого явно предупреждаем и не трогаем страницу
  function handleClick() {
    haptic() // строго синхронно, внутри жеста — иначе система отклик не даст
    if (!navigator.onLine) { setOffline(true); return }
    // Небольшая пауза перед reload: страница успевает показать нажатие кнопки,
    // а системный импакт — доиграть до сноса документа
    // 'stuck': воркер новую сборку не поставил — сбрасываем кеш оболочки, иначе reload отдал бы старую версию из него
    setTimeout(() => (how === 'stuck' ? purgeShellAndReload() : window.location.reload()), 90)
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
