import { lazy, Suspense } from 'react'
import { loadLessonPlayer } from './lessonPlayerPrefetch.js'

// Обёртка над LessonPlayer для мест, где он открывается из основного бандла
// (модуль, одиночный урок, гонка, повторение). Те же пропсы, что у плеера.
// fallback — пока чанк не доехал: по умолчанию тёмный экран цвета плеера (без
// белой вспышки); экран повторения кладёт плеер в рамку карточки и передаёт
// fallback={null}. Подробности про прогрев чанка — lessonPlayerPrefetch.js
const LessonPlayer = lazy(loadLessonPlayer)
const DARK = <div className="lessonPlayer" aria-busy="true" />

export default function LessonPlayerLazy({ fallback = DARK, ...props }) {
  return (
    <Suspense fallback={fallback}>
      <LessonPlayer {...props} />
    </Suspense>
  )
}
