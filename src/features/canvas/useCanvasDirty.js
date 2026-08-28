import { useState, useCallback } from 'react'
import { hasCanvasDraft } from './canvasStorageKeys.js'

// Есть ли у урока что-то несохранённое — этим живёт мигающая точка на кнопке
// «Сохранить». Источник правды — локальный черновик нод: он пишется на любую
// правку (useCanvasBoardState.js) и стирается только после успешной записи на
// сервер (useCanvasSave.js), поэтому переживает и перезагрузку страницы.
// Название урока и XP черновика не касаются — их помечает markDirty руками.
export function useCanvasDirty(lessonId, saveToServer) {
  const [dirty, setDirty] = useState(() => hasCanvasDraft(lessonId))

  const markDirty = useCallback(() => setDirty(true), [])
  // Перечитать по факту: черновик мог появиться (правка) или исчезнуть
  // (сохранились). Если сохранение упало — черновик на месте, точка мигает
  const syncDirty = useCallback(() => setDirty(hasCanvasDraft(lessonId)), [lessonId])

  const save = useCallback(async () => {
    await saveToServer()
    setDirty(hasCanvasDraft(lessonId))
  }, [saveToServer, lessonId])

  return { dirty, markDirty, syncDirty, save }
}
