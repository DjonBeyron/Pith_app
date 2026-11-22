import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fitScale, clampScale, scrollAfterZoom, windowOf } from '../timelineView.js'

// Окно монтажного стола: масштаб (px на мс), горизонтальная прокрутка ВНУТРИ стола, видимое окно времени (рисуется только оно). Один слушатель scroll / resize / wheel на стол.
//  • колесо мыши — прокрутка по времени; Ctrl + колесо (и щипок на тачпаде) — масштаб вокруг момента anchor() (указатель), если он на экране, иначе вокруг середины окна;
//  • перетаскивание пустого места мышью — прокрутка (палец прокручивает сам: touch-action: pan-x);
//  • zoomTo(масштаб, момент) — момент остаётся на том же месте экрана; scrollTo(t) — показать момент (на трети ширины), если он не виден.
// labelW — ширина закреплённых подписей дорожек: дорожки начинаются правее.
const STEP = 1.25

export function useMontageView({ dur, labelW, scale0, anchor }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(scale0)
  const [view, setView] = useState({ left: 0, width: 1200 })
  const want = useRef(null) // прокрутка, которую надо поставить после перерисовки с новым масштабом
  const fit = fitScale(dur, view.width)
  const live = useRef({})
  useEffect(() => { live.current = { scale: Math.max(scale, fit), fit, width: view.width, anchor } })

  const read = useCallback(force => {
    const el = ref.current; if (!el) return
    setView(v => { const n = { left: el.scrollLeft, width: Math.max(120, el.clientWidth - labelW) }; return !force && Math.abs(n.left - v.left) < 40 && n.width === v.width ? v : n })
  }, [labelW])

  const zoomTo = useCallback((next, t = null) => {
    const el = ref.current, c = live.current; if (!el) return
    const s = clampScale(next, c.fit), left = el.scrollLeft, a = t ?? c.anchor?.() ?? 0, x = a * c.scale - left
    const seen = x >= 0 && x <= c.width, at = seen ? a : (left + c.width / 2) / c.scale
    want.current = scrollAfterZoom(at, seen ? x : c.width / 2, s)
    setScale(s)
  }, [])
  const scrollTo = useCallback((t, always = false) => {
    const el = ref.current, c = live.current; if (!el) return
    const x = t * c.scale - el.scrollLeft
    if (always || x < 24 || x > c.width - 24) el.scrollLeft = Math.max(0, t * c.scale - c.width / 3)
  }, [])

  /** Показать отрезок (этап) во всю ширину: масштаб next, начало отрезка — у левого края */
  const fitSpan = useCallback((span, next) => {
    const el = ref.current, c = live.current; if (!el) return
    const s = clampScale(next, c.fit), left = Math.max(0, span.t * s - c.width * 0.05)
    if (s === c.scale) el.scrollLeft = left; else { want.current = left; setScale(s) }
  }, [])

  useLayoutEffect(() => { // новый масштаб нарисован — ставим прокрутку, чтобы момент не уехал
    const el = ref.current
    if (el && want.current != null) { el.scrollLeft = want.current; want.current = null }
    read(true)
  }, [scale, read])

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined
    let raf = 0, pan = null
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; read(false) }) }
    const wheel = e => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(live.current.scale * (e.deltaY < 0 ? STEP : 1 / STEP)); return }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY }
    }
    const down = e => { // пустое место (не клип, не зазор, не линейка) — тянем стол мышью
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, input, [data-ruler]')) return
      pan = { x: e.clientX, left: el.scrollLeft }; el.dataset.pan = '1'
    }
    const move = e => { if (pan) el.scrollLeft = pan.left - (e.clientX - pan.x) }
    const up = () => { if (pan) { pan = null; delete el.dataset.pan } }
    read(true)
    el.addEventListener('scroll', on, { passive: true }); el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('pointerdown', down)
    window.addEventListener('resize', on); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => {
      cancelAnimationFrame(raf); el.removeEventListener('scroll', on); el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', down)
      window.removeEventListener('resize', on); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
  }, [read, zoomTo])

  /** Координата экрана clientX → момент игры (мс) */
  const timeAt = useCallback(clientX => { const el = ref.current; if (!el) return 0; const r = el.getBoundingClientRect(); return Math.max(0, (clientX - r.left - labelW + el.scrollLeft) / live.current.scale) }, [labelW])
  const setLeft = useCallback(left => { const el = ref.current; if (el) el.scrollLeft = Math.max(0, left) }, [])

  return { ref, scale: Math.max(scale, fit), fit, view, win: windowOf(view.left, view.width, Math.max(scale, fit)), zoomTo, zoomIn: () => zoomTo(live.current.scale * 2), zoomOut: () => zoomTo(live.current.scale / 2), scrollTo, fitSpan, timeAt, setLeft }
}
