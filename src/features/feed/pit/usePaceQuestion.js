import { useEffect } from 'react'
import { onTrack } from '../../../shared/lib/analytics/track.js'
import { usePromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { createPaceWatch, paceCandidate } from './paceQuestion.js'

// Слушает журнал: на каждый feed_swipe { ms_prev } считает быстрые пролистывания; после трёх подряд просит у общего слота Пита
// вопрос «Кажется, не зацепило…» (paceQuestion.js). Нет хоста слота (тесты, превью) — не делает ничего. Живёт, пока смонтирована
// лента (зовётся из useFeedTracking). Счёт — на сессию приложения (модуль), чтобы пересборка ленты не давала спросить второй раз.
let sessionWatch = null
export const resetPaceSession = () => { sessionWatch = null } // для тестов

export function usePaceQuestion() {
  const slot = usePromptSlotContext()
  const request = slot?.request // стабилен (usePromptSlot), смена слота не нужна

  useEffect(() => {
    if (!request) return undefined
    if (!sessionWatch) sessionWatch = createPaceWatch()
    return onTrack((name, props) => {
      if (name !== 'feed_swipe') return
      if (sessionWatch.onSwipe(props?.ms_prev)) request(paceCandidate())
    })
  }, [request])
}
