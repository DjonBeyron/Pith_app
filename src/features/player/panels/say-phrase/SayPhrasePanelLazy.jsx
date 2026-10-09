import { useState, useEffect } from 'react'
import { lazyRetry } from '../../../../shared/lib/lazyRetry.js'

// Панель «Сказать фразу» вместе с кодом распознавания речи (контроллер, сравнение, разрешения) — отдельный чанк:
// в основном коде плеера только эта обёртка. Микрофон при этом НЕ трогается: только по тапу в панели.
//
// Панель поднимается так же, как у других модулей: сразу после предыдущей ноды (пауз и пузыря от самого модуля нет). Чанк
// обычно уже прогрет в простое (sayPhrasePrefetch.js), панель монтируется, как только он загружен.
// React.lazy/Suspense тут намеренно нет: при первом показе Suspense придерживает появление содержимого на ~300 мс (троттлинг
// fallback). Чанк грузим руками (lazyRetry: после деплоя старые хэши дают 404 — один раз перезагружаем страницу); ошибка
// загрузки уходит в ErrorBoundary, как у React.lazy.
export default function SayPhrasePanelLazy(props) {
  const [Panel, setPanel] = useState(null) // { C: компонент панели } — объектом, чтобы setState не вызвал функцию-компонент
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    lazyRetry(() => import('./SayPhrasePanel.jsx'), 'say-phrase-panel')
      .then(m => { if (alive) setPanel({ C: m.default }) })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])
  if (error) throw error
  return Panel ? <Panel.C {...props} /> : null
}
