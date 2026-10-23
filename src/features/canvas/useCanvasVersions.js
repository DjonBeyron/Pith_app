import { useEffect, useRef } from 'react'
import { recordLessonVersion } from './review/useLessonVersions.js'

/**
 * Версии урока для кнопки «Изменения» в разборе (локально, localStorage): серверная версия и холст при загрузке (если открыт локальный черновик,
 * он сравнивается с серверной), версия после каждого сохранения. Импорт JSON и открытие разбора пишут версии сами (CanvasPage, useLessonVersions)
 */
export function useCanvasVersions({ lessonId, loading, serverNodes, isSaving, boardApiRef }) {
  useEffect(() => {
    if (loading || !lessonId) return undefined
    recordLessonVersion(lessonId, serverNodes)
    const t = setTimeout(() => recordLessonVersion(lessonId, boardApiRef.current?.getNodes()), 1500)
    return () => clearTimeout(t)
  }, [loading, lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  const wasSaving = useRef(false)
  useEffect(() => {
    if (isSaving) { wasSaving.current = true; return undefined }
    if (!wasSaving.current || !lessonId) return undefined
    wasSaving.current = false
    const t = setTimeout(() => recordLessonVersion(lessonId, boardApiRef.current?.getNodes()), 300)
    return () => clearTimeout(t)
  }, [isSaving, lessonId, boardApiRef])
}
