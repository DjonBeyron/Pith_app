import { useState, useLayoutEffect } from 'react'

// true, когда элемент уже порога (px) — тулбар складывает действия в меню «Ещё». Следит за
// шириной САМОГО окна (ResizeObserver), а не экрана: окно можно сузить, экран остаётся прежним.
// Меряем border-box (entry.borderBoxSize), как useDensity: от содержимого и padding ширина не зависит,
// поэтому «узкий» не перескакивает туда-обратно после перекладки кнопок (прошлый баг дрожания: contentRect
// менялся от самой раскладки). setState только при смене значения; один ResizeObserver на панель.
// Без ResizeObserver (тесты, старые браузеры) — считается широким. force (тесты/снимки) — жёстко.
export function useNarrow(ref, threshold, force = null) {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (force !== null || !el) return undefined
    const apply = w => setNarrow(prev => (prev === w < threshold ? prev : w < threshold))
    apply(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(entries => apply(entries[0]?.borderBoxSize?.[0]?.inlineSize ?? el.getBoundingClientRect().width))
    try { ro.observe(el, { box: 'border-box' }) } catch { ro.observe(el) }
    return () => ro.disconnect()
  }, [ref, threshold, force])
  return force ?? narrow
}
