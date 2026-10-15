import { useLayoutEffect } from 'react'
import { computeFeedFrame, feedFrameVars } from './feedFrameCalc.js'

// Кадр сцены на слайде ленты: размер слайда → CSS-переменные корня .slideSceneRoot (feed-scene.css).
// Переменные пишутся прямо в DOM (setProperty), без setState: SceneRenderer при смене размера окна/адресной строки
// не перерисовывается. Размер слайда меряет ОДИН общий ResizeObserver на все слайды (по образцу общих подписок
// useSceneNear), а не наблюдатель на сцену. Высота нижней панели и safe-area сверху — из padding корня
// (padding-bottom: var(--v2-nav-h), padding-top: env(safe-area-inset-top)): браузер сам раскрывает env()/calc в px.

const subs = new Map() // element -> callback
let ro = null

function observe(el, cb) {
  if (typeof ResizeObserver === 'undefined') return () => {}
  if (!ro) ro = new ResizeObserver(entries => { for (const e of entries) subs.get(e.target)?.() })
  subs.set(el, cb)
  ro.observe(el)
  return () => { subs.delete(el); ro?.unobserve(el) }
}

// Применить кадр к элементу: меряет себя, считает, пишет переменные. Экспорт — для предпросмотра и тестов
export function applyFeedFrame(el, frame) {
  const w = el.clientWidth
  const h = el.clientHeight
  if (!w || !h) return null
  const cs = getComputedStyle(el)
  const navH = parseFloat(cs.paddingBottom) || 0
  const safeTop = parseFloat(cs.paddingTop) || 0
  const r = computeFeedFrame({ w, h, navH, safeTop, frame })
  const vars = feedFrameVars(r)
  for (const k of Object.keys(vars)) el.style.setProperty(k, vars[k])
  return r
}

export function useFeedFrame(rootRef, feedFrame) {
  const key = feedFrame ? `${feedFrame.scale}|${feedFrame.x}|${feedFrame.y}|${feedFrame.anchor ?? ''}` : ''
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const frame = key ? feedFrame : undefined
    applyFeedFrame(el, frame)
    return observe(el, () => applyFeedFrame(el, frame))
    // feedFrame берётся по key: объект сцены пересоздаётся, значения — нет
  }, [rootRef, key]) // eslint-disable-line react-hooks/exhaustive-deps
}
