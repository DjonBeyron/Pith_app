import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { dbg } from '../../shared/lib/debug.js'

// Скроллер цепочки: контейнер .moduleGraphScroll, а если он не скроллится
// (высота не ограничена — скроллит страница), то фолбэк на window.
function getScroller(cont) {
  if (cont && cont.scrollHeight > cont.clientHeight + 4) {
    return {
      kind: 'container',
      get:  () => cont.scrollTop,
      set:  v  => { cont.scrollTop = v },
      base: () => cont.getBoundingClientRect().top,
      view: cont.clientHeight,
    }
  }
  return {
    kind: 'window',
    get:  () => window.scrollY,
    set:  v  => window.scrollTo(0, v),
    base: () => 0,
    view: window.innerHeight,
  }
}

// Скролл графа модуля после урока: мгновенно ставит пройденный урок к верху
// экрана; scrollToFinal(durMs) плавно везёт вниз к финалу за durMs
// (время полёта первого кружочка XP).
export function useChainScroll({ justCompleted, lessons, scrollRef, startRef, finalRef, lessonRefs }) {
  // useLayoutEffect: скролл ставится ДО отрисовки кадра — при выходе из урока
  // пользователь сразу видит пройденный урок сверху, без прыжка.
  useLayoutEffect(() => {
    if (!justCompleted) return
    const idx = lessons.findIndex(l => l.id === justCompleted.id)
    const el = idx === 0 ? startRef.current
      : idx === lessons.length - 1 ? finalRef.current
      : lessonRefs.current[idx - 1]
    if (!el) { dbg('[SCROLL] top: нет элемента урока, idx=', idx); return }
    const s = getScroller(scrollRef.current)
    const target = Math.max(0, el.getBoundingClientRect().top + s.get() - s.base() - 12)
    dbg('[SCROLL] top:', s.kind, 'idx=', idx, 'target=', Math.round(target), 'до=', Math.round(s.get()))
    s.set(target)
    dbg('[SCROLL] top: после=', Math.round(s.get()))
  }, [justCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  const animRef = useRef(null)
  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const scrollToFinal = useCallback((durMs) => {
    const finalEl = finalRef.current
    if (!finalEl) { dbg('[SCROLL] к финалу: нет финала'); return }
    const s = getScroller(scrollRef.current)
    const r = finalEl.getBoundingClientRect()
    const target = Math.max(0, r.top + s.get() - s.base() + r.height - s.view + 16)
    const from = s.get()
    dbg('[SCROLL] к финалу:', s.kind, 'dur=', Math.round(durMs),
      'from=', Math.round(from), 'target=', Math.round(target))
    cancelAnimationFrame(animRef.current)
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / durMs)
      s.set(from + (target - from) * k)
      if (k < 1) animRef.current = requestAnimationFrame(step)
      else dbg('[SCROLL] к финалу: доехали, scroll=', Math.round(s.get()))
    }
    animRef.current = requestAnimationFrame(step)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return scrollToFinal
}
