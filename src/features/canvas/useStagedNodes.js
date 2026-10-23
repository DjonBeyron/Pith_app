import { useEffect, useState } from 'react'

// Поэтапное появление нод на холсте. Урок на 300 нод рисуется целиком больше секунды (по ~80–350 узлов DOM на ноду, у каждой свои измерения) — всё это время
// экран пуст. Теперь сначала рисуются ноды, что в кадре и рядом (по близости к центру экрана в мировых координатах), остальные докладываются порциями в
// простое браузера (requestIdleCallback с запасным таймером): первые ноды видны сразу, правка и протяжка доступны, не дожидаясь хвоста. Связи рисуются
// по данным всех нод, не по DOM, поэтому появляются сразу
export const FIRST_BATCH = 24
export const STEP = 32 // не меньше стольких за раз; порция растёт вдвое (24 → 48 → 96 → 192…): мало этапов — меньше повторных вёрсток, первый кадр всё равно лёгкий
const NODE_W = 308

/** Очередь показа: id → место (0 — самая близкая к центру кадра). view — { offset, scale, vw, vh } */
export function rankNodes(nodes, { offset, scale, vw, vh }) {
  const cx = (vw / 2 - offset.x) / scale
  const cy = (vh / 2 - offset.y) / scale
  const order = [...nodes].sort((a, b) => Math.hypot(a.x + NODE_W / 2 - cx, a.y - cy) - Math.hypot(b.x + NODE_W / 2 - cx, b.y - cy))
  return new Map(order.map((n, i) => [n.id, i]))
}

/** Какие ноды показывать сейчас: те, чей номер в очереди меньше счётчика, и любые, которых в очереди не было (добавленные позже) */
export const shownNodes = (nodes, rank, count) => nodes.filter(n => !rank.has(n.id) || rank.get(n.id) < count)

const later = cb => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 120 }) : setTimeout(cb, 16))
const cancelLater = h => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : clearTimeout(h))

export function useStagedNodes(nodes, offset, scale) {
  const [rank] = useState(() => rankNodes(nodes, { offset, scale, vw: window.innerWidth, vh: window.innerHeight }))
  const [count, setCount] = useState(FIRST_BATCH)
  const total = rank.size
  useEffect(() => {
    if (count >= total) return undefined
    const h = later(() => setCount(c => c + Math.max(STEP, c)))
    return () => cancelLater(h)
  }, [count, total])
  return count >= total ? nodes : shownNodes(nodes, rank, count)
}
