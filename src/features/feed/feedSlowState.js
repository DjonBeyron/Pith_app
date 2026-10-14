import { useSyncExternalStore } from 'react'

// Замедление 0.5x ленты как общее состояние по slideKey. Для видео useSlowMotion
// крутит playbackRate у элемента пула напрямую; сцене (SlideScene) элемента нет —
// она читает флаг отсюда и передаёт рендереру rate 0.5. Одна запись: замедлен
// может быть только активный слайд (useSlowMotion сам сбрасывает при уходе).
let slowKey = null
const subs = new Set()

export function setFeedSlow(slideKey, on) {
  const next = on ? slideKey : (slowKey === slideKey ? null : slowKey)
  if (next === slowKey) return
  slowKey = next
  subs.forEach(fn => fn())
}

export function getFeedSlowKey() {
  return slowKey
}

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function useFeedSlow(slideKey) {
  return useSyncExternalStore(subscribe, () => slowKey !== null && slowKey === slideKey, () => false)
}
