import { useEffect, useState } from 'react'
import { networkKindNow } from './networkGuard.js'

// Экран «Нет интернета / Слабый интернет» внутри работающего приложения: ленивый чанк не догрузился
// (ErrorBoundary подставляет его вместо «Что-то пошло не так»). Разметка и стили (.ng*) — те же, что у
// оверлея public/net-guard.js; стили лежат инлайном в index.html, поэтому экран рисуется и без app-CSS.
// Вернулась сеть — перезагружаемся сами.
export default function NetworkProblem() {
  const [kind, setKind] = useState(networkKindNow)

  useEffect(() => {
    const onOnline = () => window.location.reload()
    const onOffline = () => setKind('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <div className="ngScreen" role="alert">
      <div className="ngPulse" />
      <h1 className="ngTitle">{kind === 'offline' ? 'Нет интернета' : 'Слабый интернет'}</h1>
      <p className="ngText">Проверь соединение — мы подключимся сами</p>
      <button type="button" className="ngBtn" onClick={() => window.location.reload()}>
        Повторить
      </button>
    </div>
  )
}
