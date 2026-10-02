import { useMemo, useRef } from 'react'
import { localToday } from '../review/reviewDecks.js'
import { recallView, translationPool, canOffer, shownToday, markShown, RECALL_GAP } from './feedRecall.js'

// Повторение слов в ленте на уровне всей ленты (feedRecall.js): что сегодня к повтору (view), запас
// «чужих» переводов для проверки (pool) и лимиты показа: onSlide(moduleId) зовёт лента при смене слайда —
// считаются только настоящие смены фразы (перенос круга держит ту же фразу и не в счёт);
// claim(moduleId) спрашивает слайд, когда фраза открыта и в ней есть слово к повтору: можно ли
// «подышать» приманкой. Не чаще раза в 5 видео и не больше 3 в день; фраза, на которой уже
// предложили, при возврате к ней показывает приманку снова — без нового счёта.
// Первая фраза после входа в ленту может предложить сразу.
export function useFeedRecall(learnView, modules) {
  const state = useRef({ swipes: RECALL_GAP, last: null, offered: new Set() })
  const view = useMemo(() => recallView(learnView), [learnView])
  const pool = useMemo(() => translationPool(modules), [modules])

  return useMemo(() => ({
    view,
    pool,
    onSlide(moduleId) {
      const s = state.current
      if (!moduleId || moduleId === s.last) return
      s.last = moduleId
      s.swipes += 1
    },
    claim(moduleId) {
      const s = state.current
      if (s.offered.has(moduleId)) return true
      const today = localToday()
      if (!canOffer({ swipes: s.swipes, shown: shownToday(today) })) return false
      markShown(today)
      s.swipes = 0
      s.offered.add(moduleId)
      return true
    },
  }), [view, pool])
}
