import { useCallback, useEffect, useRef, useState } from 'react'
import { nearUpdate } from './nearSlots.js'

const MARGIN = '1000px 0px' // слот считается «рядом», пока он не дальше ~двух экранов от видимой области

/**
 * Одна IntersectionObserver на ленту разбора: observe(el)/unobserve(el) — callback-ref каждого слота (data-ref — ключ), near — Set ref-ов рядом с
 * экраном, heights — последняя высота слотов, ушедших за край (рамка-заглушка той же высоты, лента не «прыгает»). Наблюдатель создаётся
 * после монтирования ленты (ref контейнера к моменту ref-ов детей ещё пуст), накопленные до этого элементы подхватываются
 */
export function useNearSlots(rootRef) {
  const [near, setNear] = useState(() => new Set())
  const [heights] = useState(() => new Map()) // мутируется из наблюдателя; читается при перерисовке по near
  const io = useRef(null)
  const pending = useRef(new Set())
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !rootRef.current) return undefined
    const obs = new IntersectionObserver(entries => {
      const list = entries.map(e => ({ ref: e.target.dataset.ref, near: e.isIntersecting, height: e.boundingClientRect.height }))
      setNear(prev => nearUpdate(prev, list, heights))
    }, { root: rootRef.current, rootMargin: MARGIN })
    io.current = obs
    pending.current.forEach(el => obs.observe(el))
    pending.current.clear()
    return () => { obs.disconnect(); io.current = null }
  }, [rootRef, heights])
  const observe = useCallback(el => { if (io.current) io.current.observe(el); else pending.current.add(el) }, [])
  const unobserve = useCallback(el => { if (!el) return; io.current?.unobserve(el); pending.current.delete(el) }, [])
  // Без IntersectionObserver (старый браузер, тесты) — рисуем всё, как раньше
  const all = typeof IntersectionObserver === 'undefined'
  return { near, all, heights, observe, unobserve }
}
