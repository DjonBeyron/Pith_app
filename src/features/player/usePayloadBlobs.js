import { useEffect, useRef } from 'react'
import { revokePayloadBlobs } from './preloadQueue.js'

// Владелец payload карточки запуска (CurriculumView, StandaloneLessonRunner,
// RaceRunner) держит в нём blob-ы прогрева и blob логотипа учителя. Плеер
// свои blob-ы прогрева отзывает сам, а логотип — нет: тот же проп в превью
// из канваса принадлежит редактору, и плеер не вправе его отзывать. Поэтому
// отзыв — здесь, когда payload сменился или владелец размонтирован.
// Отложенно и с отменой: StrictMode в dev размонтирует и монтирует снова
// синхронно — таймер прошлого cleanup гасится в следующем setup
export function usePayloadBlobsRelease(payload) {
  const timerRef = useRef(null)
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (!payload) return
    return () => { timerRef.current = setTimeout(() => revokePayloadBlobs(payload), 0) }
  }, [payload])
}
