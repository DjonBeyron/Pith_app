import { lazy, Suspense } from 'react'
import { lazyRetry } from '../../../../shared/lib/lazyRetry.js'

// Панель «Сказать фразу» вместе с кодом распознавания речи (контроллер, сравнение, разрешения) — отдельный чанк:
// в основном коде плеера только эта обёртка. Грузится, когда урок с такой нодой подошёл к ней (плюс тихий прогрев в
// простое — sayPhrasePrefetch.js, см. PlayerPanels.jsx). Микрофон при этом НЕ трогается: только по тапу в панели.
const SayPhrasePanel = lazy(() => lazyRetry(() => import('./SayPhrasePanel.jsx'), 'say-phrase-panel'))

export default function SayPhrasePanelLazy(props) {
  return (
    <Suspense fallback={null}>
      <SayPhrasePanel {...props} />
    </Suspense>
  )
}
