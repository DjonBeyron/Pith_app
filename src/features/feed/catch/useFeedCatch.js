import { useMemo, useRef, useState } from 'react'
import { localToday } from '../../review/reviewDecks.js'
import { canOfferCatch, shownCatchToday, markCatchShown, CATCH_GAP } from './feedCatch.js'

// «Ловля слов» на уровне всей ленты — зеркало useFeedRecall.js, только лимиты показа:
// onSlide(moduleId) зовёт лента при смене слайда — считаются только настоящие смены фразы (перенос круга
// держит ту же фразу и не в счёт); claim(moduleId) спрашивает слайд, когда фраза подходит под задание
// (feedCatch.js → catchEligible): можно ли поставить его сейчас. Не чаще раза в 5 видео и не больше 3 в день
// (свой ключ localStorage, независимо от «Помнишь?»); фраза, на которой задание уже поставили, при возврате
// к ней получает его снова — без нового счёта. Первая фраза после входа в ленту может предложить сразу.
// locked/setLocked — на активном слайде открыта панель набора: FeedSwiper не листает (FeedTab передаёт
// setLocked только активному слайду); смена слайда снимает блокировку сама.
// → { locked, setLocked, onSlide, claim }
export function useFeedCatch() {
  const state = useRef({ swipes: CATCH_GAP, last: null, offered: new Set() })
  const [locked, setLocked] = useState(false)

  return useMemo(() => ({
    locked,
    setLocked,
    onSlide(moduleId) {
      setLocked(false)
      const s = state.current
      if (!moduleId || moduleId === s.last) return
      s.last = moduleId
      s.swipes += 1
    },
    claim(moduleId) {
      const s = state.current
      if (s.offered.has(moduleId)) return true
      const today = localToday()
      if (!canOfferCatch({ swipes: s.swipes, shown: shownCatchToday(today) })) return false
      markCatchShown(today)
      s.swipes = 0
      s.offered.add(moduleId)
      return true
    },
  }), [locked])
}
