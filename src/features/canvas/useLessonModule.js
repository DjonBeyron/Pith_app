import { useState, useEffect } from 'react'
import { findLessonModule } from '../../shared/lib/curriculaApi.js'
import { updateLastEditedModule } from '../../shared/lib/lastEditedLesson.js'

// Модуль, в схему которого вернёт «назад» из редактора урока. Из схемы модуля
// он приходит пропом; но урок можно открыть и мимо неё — всплывашкой
// «продолжить редактирование» после перезагрузки, — и тогда «назад» уводило бы
// на главный экран. В этом случае ищем модуль сами по lesson_ids и заодно
// дописываем его в память последнего урока, чтобы в следующий раз не искать.
export function useLessonModule(lessonId, module) {
  // Состояние только для найденного: пришедший пропом модуль и так под рукой,
  // копировать его в state незачем
  const [found, setFound] = useState(null)

  useEffect(() => {
    if (module?.id || !lessonId) return
    let alive = true
    findLessonModule(lessonId)
      .then(m => {
        if (!alive || !m) return
        setFound(m)
        updateLastEditedModule(lessonId, m)
      })
      .catch(() => { /* нет сети/прав — «назад» просто закроет редактор */ })
    return () => { alive = false }
  }, [lessonId, module])

  return module?.id ? module : found
}
