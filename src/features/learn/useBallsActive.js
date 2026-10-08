import { useEffect, useState } from 'react'

// Шарики должны бежать, только пока их видно: слой линий на экране (с запасом MARGIN px — при прокрутке
// шарик не стартует «с нуля» на глазах) и страница не в фоне. Иначе анимации стоят (animation-play-state:
// paused в memory-ladder.css) и ничего не тратят. Скрытая вкладка «Моя память» гасится отдельно
// (.shellV2TabHidden → display: none), это — про прокрутку и про приложение в фоне
const MARGIN = 120

export function useBallsActive(ref) {
  const [onScreen, setOnScreen] = useState(true)
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: `${MARGIN}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])

  useEffect(() => {
    const onVis = () => setShown(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return onScreen && shown
}
