import { useEffect, useRef } from 'react'
import { track } from '../../shared/lib/analytics/track.js'

// Аналитика ленты «Рекомендации»: сколько видео фразы было на экране.
// feed_view { module_id, ms } пишется, когда слайд уходит с экрана: свайп,
// другая вкладка, «Мои уроки», сворачивание приложения. Быстрое пролистывание
// (ms < 2 с) отчёт считает сам — отдельного события нет.
// module — модуль активного слайда или null, когда лента не на экране.
export function useFeedTracking(module) {
  const curRef = useRef(null) // { id, since }
  const id = module?.id ?? null

  useEffect(() => {
    const start = () => { if (id) curRef.current = { id, since: Date.now() } }
    const stop = () => {
      const cur = curRef.current
      curRef.current = null
      if (cur) track('feed_view', { module_id: cur.id, ms: Date.now() - cur.since })
    }
    const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start())

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [id])
}
