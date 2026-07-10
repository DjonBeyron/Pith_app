import { useState, useRef, useCallback } from 'react'

// Подсчёт подсказок в Финале модуля: подсказка = ПЕРВОЕ раскрытие перевода
// конкретного сообщения (повторные открытия того же — бесплатно).
// enabled=false (обычный урок) — регистрация не считает ничего.
// Больше HINT_LIMIT подсказок — золотой билет в этой попытке не выдаётся
// (раскрывать перевод дальше не запрещено).
export const HINT_LIMIT = 3

export function useFinalHints(enabled) {
  const usedRef = useRef(new Set())
  const [count, setCount] = useState(0)

  const registerHint = useCallback((nodeId) => {
    if (!enabled || usedRef.current.has(nodeId)) return
    usedRef.current.add(nodeId)
    setCount(usedRef.current.size)
  }, [enabled])

  // Для асинхронного финиша урока (замыкание может держать устаревший count)
  const getCount = useCallback(() => usedRef.current.size, [])

  return { count, over: count > HINT_LIMIT, registerHint, getCount }
}
