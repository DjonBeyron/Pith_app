import { useState, useEffect } from 'react'
import { lazyRetry } from '../../../../shared/lib/lazyRetry.js'
import { panelDelayMs } from '../../../../shared/lib/speech/sayPanelDelay.js'

// Панель «Сказать фразу» вместе с кодом распознавания речи (контроллер, сравнение, разрешения) — отдельный чанк:
// в основном коде плеера только эта обёртка. Микрофон при этом НЕ трогается: только по тапу в панели.
//
// Порядок появления: СНАЧАЛА в чате фраза (пузырь ведущего), и только через SAY_PANEL_DELAY_MS (1,5 с; без фразы в чате,
// showPhrase=false, — 0,4 с) поднимается панель. Отсчёт идёт отсюда, от появления ноды, а не от загрузки чанка: чанк
// грузится сразу, а до паузы панель НЕ монтируется вовсе — ни пустого корпуса, ни мигания, ни замеров высоты.
// React.lazy/Suspense тут намеренно нет: при первом показе Suspense придерживает появление содержимого ещё на ~300 мс
// (троттлинг fallback), и панель выезжала бы позже срока. Чанк грузим руками (lazyRetry: после деплоя старые хэши дают 404 —
// один раз перезагружаем страницу); ошибка загрузки уходит в ErrorBoundary, как у React.lazy.
export default function SayPhrasePanelLazy(props) {
  const showPhrase = props.node.typeData?.say_phrase?.showPhrase !== false
  const [Panel, setPanel] = useState(null) // { C: компонент панели } — объектом, чтобы setState не вызвал функцию-компонент
  const [timeUp, setTimeUp] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    lazyRetry(() => import('./SayPhrasePanel.jsx'), 'say-phrase-panel')
      .then(m => { if (alive) setPanel({ C: m.default }) })
      .catch(e => { if (alive) setError(e) })
    const t = setTimeout(() => setTimeUp(true), panelDelayMs(showPhrase))
    return () => { alive = false; clearTimeout(t) }
  }, [showPhrase])
  if (error) throw error
  return timeUp && Panel ? <Panel.C {...props} /> : null
}
