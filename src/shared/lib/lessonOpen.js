import { useEffect } from 'react'

// Флаг «урок открыт» — один на всё приложение.
//
// Пока идёт урок (LessonPlayer смонтирован), всё остальное должно замереть и
// не отбирать у чата главный поток: анимации вкладок и нижней панели под
// плеером (CSS: html.lessonOpen, styles/lesson-open.css), сторож стоп-кадров
// ленты (50 мс), сторож жестов, перезагрузки данных «Памяти»/ленты по
// возврату из фона, проверка новой версии, видео ленты в парковке.
//
// Счётчик, а не булево: повторение (ReviewScreen) монтирует по LessonPlayer
// на карточку, слой перехода по lesson_ref держит два плеера разом.
// Снятие — с задержкой: между карточками повторения плеера нет долю секунды,
// и без неё фон успевал бы «проснуться» и снова заснуть на каждой карточке.
let count = 0
let open = false
let offTimer = null
const listeners = new Set()
const CLOSE_DELAY_MS = 300

export function isLessonOpen() {
  return open
}

function set(next) {
  if (open === next) return
  open = next
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('lessonOpen', open)
  listeners.forEach(fn => fn(open))
}

export function lessonOpened() {
  count++
  if (offTimer) { clearTimeout(offTimer); offTimer = null }
  set(true)
}

export function lessonClosed() {
  count = Math.max(0, count - 1)
  if (count > 0 || offTimer) return
  offTimer = setTimeout(() => {
    offTimer = null
    if (count === 0) set(false)
  }, CLOSE_DELAY_MS)
}

// Подписка: fn(open) при каждой смене. Возвращает отписку
export function onLessonOpenChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Для LessonPlayer: поднять флаг на время жизни компонента
export function useLessonOpenFlag() {
  useEffect(() => {
    lessonOpened()
    return lessonClosed
  }, [])
}

// Только для тестов
export function _resetLessonOpen() {
  count = 0
  if (offTimer) { clearTimeout(offTimer); offTimer = null }
  set(false)
  listeners.clear()
}
