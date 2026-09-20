import { useRef, useState } from 'react'

// Байтовый прогресс предзагрузки и дебаг-реестр загрузок — вынесено из
// usePlayerPreload.js (упёрся в потолок 400 строк). Здесь только счётчики:
// сколько байт каждого файла скачано/всего (честный плавный бар на карточке
// запуска), процент прогрева первых initialLookahead нод, реестр загрузок
// для «⬇ лог»/оверлея и троттлинг обновлений state под шторм чанков.
const FALLBACK_SIZE = 500 * 1024 // вес файла с неизвестным размером в байтовом прогрессе

export function usePreloadProgress(queueRef, initialLookahead) {
  // Debug overlay: one item per download, updated in place
  const debugItemsRef = useRef(new Map())
  const [, setDebugTick] = useState(0)

  const bytesTotalRef  = useRef(new Map())
  const bytesLoadedRef = useRef(new Map())
  const [warmupPct, setWarmupPct] = useState(0)
  const lastFlushRef   = useRef(0)
  const flushTimerRef  = useRef(null)

  function computeWarmupPct() {
    let loaded = 0
    let total  = 0
    for (const it of queueRef.current) {
      if (it.nodeIdx >= initialLookahead) continue
      const size = bytesTotalRef.current.get(it.id) || it.size || FALLBACK_SIZE
      total  += size
      loaded += Math.min(bytesLoadedRef.current.get(it.id) ?? 0, size)
    }
    return total ? Math.round(loaded / total * 100) : 100
  }

  const tick = () => {
    setWarmupPct(computeWarmupPct())
    setDebugTick(t => t + 1)
  }

  // Шторм чанков при скачивании → не чаще одного обновления state в 100 мс
  function throttledTick() {
    const now = Date.now()
    if (now - lastFlushRef.current >= 100) {
      lastFlushRef.current = now
      tick()
      return
    }
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      lastFlushRef.current = Date.now()
      tick()
    }, 100)
  }

  function cancelFlush() {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
  }

  // Файл с неизвестным размером не скачался — для бара считается «завершённым»
  function markFailed(id, size) {
    bytesLoadedRef.current.set(id, bytesTotalRef.current.get(id) || size || FALLBACK_SIZE)
  }

  return { debugItemsRef, bytesTotalRef, bytesLoadedRef, warmupPct, tick, throttledTick, cancelFlush, markFailed }
}
