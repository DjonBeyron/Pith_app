import { useState, useLayoutEffect } from 'react'

// true, когда элемент уже порога (px) — тулбар складывает действия в меню «⋯». Следит за
// шириной САМОГО окна (ResizeObserver), а не экрана: окно можно сузить, экран остаётся прежним.
// Без ResizeObserver (тесты, старые браузеры) — считается широким. force (тесты/снимки) — жёстко.
export function useNarrow(ref, threshold, force = null) {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (force !== null || !el) return undefined
    const measure = () => setNarrow(el.getBoundingClientRect().width < threshold)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, threshold, force])
  return force ?? narrow
}
