import { useEffect, useState } from 'react'
import { networkKindNow, NETWORK_TEXTS } from './networkGuard.js'
import { NETWORK_CABLE_SVG } from './networkCableSvg.js'

// Экран «Нет подключения / Слабое соединение» внутри работающего приложения: ленивый чанк не догрузился
// (ErrorBoundary подставляет его вместо «Что-то пошло не так»). Разметка и стили (.ng*) — те же, что у
// оверлея public/net-guard.js и страницы public/offline.html (оборванный кабель с искрами — networkCableSvg.js);
// стили лежат инлайном в index.html, поэтому экран рисуется и без app-CSS.
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

  const texts = NETWORK_TEXTS[kind]

  return (
    <div className="ngScreen" role="alert">
      <span dangerouslySetInnerHTML={{ __html: NETWORK_CABLE_SVG }} />
      <div className="ngBody">
        <h1 className="ngTitle">{texts.title}</h1>
        <p className="ngText">{texts.text}</p>
        <button type="button" className="ngBtn" onClick={() => window.location.reload()}>
          {NETWORK_TEXTS.retry}
        </button>
      </div>
    </div>
  )
}
