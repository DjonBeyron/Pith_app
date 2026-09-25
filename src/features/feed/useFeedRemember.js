import { useRef, useState } from 'react'
import { localToday } from '../review/reviewDecks.js'
import { nextGap, shownToday, markShown, pickRememberWord, shouldOffer } from './feedRemember.js'

// Когда показать «Помнишь?» (feedRemember.js): onSlide(moduleId) зовёт лента
// при смене слайда — считаются только настоящие смены фразы (перенос круга
// в середину держит ту же фразу и не в счёт). offer — слово для карточки
// или null. Первая фраза после входа в ленту не считается свайпом.
export function useFeedRemember(learnView) {
  const [offer, setOffer] = useState(null)
  const stRef = useRef(null)

  function onSlide(moduleId) {
    if (!stRef.current) stRef.current = { last: null, swipes: 0, gap: nextGap() }
    const s = stRef.current
    if (!moduleId || moduleId === s.last) return
    const first = s.last === null
    s.last = moduleId
    if (first || offer) return
    s.swipes += 1
    const today = localToday()
    const word = pickRememberWord(learnView)
    if (!shouldOffer({ swipes: s.swipes, gap: s.gap, shown: shownToday(today), word })) return
    markShown(today)
    s.swipes = 0
    s.gap = nextGap()
    setOffer(word)
  }

  return { offer, onSlide, close: () => setOffer(null) }
}
