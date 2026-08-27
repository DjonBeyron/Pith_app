import { useState } from 'react'

// Недавно использованные цвета — отдельно от избранного (то, что вы САМИ
// звёздочкой закрепили). История копится сама по себе, при каждом реальном
// выборе цвета через полную палитру, самый новый — впереди.
const KEY = 'hl_color_history'
const MAX = 12

export function useColorHistory() {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
  })

  function push(color) {
    setHistory(prev => {
      const next = [color, ...prev.filter(c => c !== color)].slice(0, MAX)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* приватный режим */ }
      return next
    })
  }

  function clear() {
    setHistory([])
    try { localStorage.removeItem(KEY) } catch { /* приватный режим */ }
  }

  return { history, push, clear }
}
