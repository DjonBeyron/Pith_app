import { useSyncExternalStore } from 'react'

// Общая пауза видео для обеих лент — «Рекомендаций» и «Моих уроков» (обе
// рисуют видео через SlideVideo). Поставил паузу в одной — перешёл в другую,
// там тоже пауза; нажал play там — вернулся, играет. Одно значение на всё
// приложение: подписаны все смонтированные SlideVideo, но смотрит на него
// только активный видимый слайд (остальные и так стоят).
// Свайп на другое видео по-прежнему снимает паузу (SlideVideo, уход со слайда).
let paused = false
const subs = new Set()

export function getFeedPaused() {
  return paused
}

export function setFeedPaused(next) {
  const v = typeof next === 'function' ? next(paused) : next
  if (v === paused) return
  paused = v
  subs.forEach(fn => fn())
}

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function useFeedPaused() {
  return [useSyncExternalStore(subscribe, getFeedPaused, getFeedPaused), setFeedPaused]
}
