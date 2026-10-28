import { useState, useCallback } from 'react'
import { usePendingAny, flushPending } from '../../shared/lib/pendingSettings.js'
import { hasCanvasDraft } from './canvasStorageKeys.js'

// Есть ли у урока что-то несохранённое — этим живёт мигающая точка на кнопке
// «Сохранить». Источник правды — локальный черновик нод: он пишется на любую
// правку (useCanvasBoardState.js) и стирается только после успешной записи на
// сервер (useCanvasSave.js), поэтому переживает и перезагрузку страницы.
// Название урока и XP черновика не касаются — их помечает markDirty руками. Несохранённые глобальные настройки, правимые в редакторе (реплики кота — pendingSettings.js), тоже зажигают точку,
// а «Сохранить» записывает и их.
export function useCanvasDirty(lessonId, saveToServer) {
  const [dirty, setDirty] = useState(() => hasCanvasDraft(lessonId))

  const markDirty = useCallback(() => setDirty(true), [])
  // Перечитать по факту: черновик мог появиться (правка) или исчезнуть
  // (сохранились). Если сохранение упало — черновик на месте, точка мигает
  const syncDirty = useCallback(() => setDirty(hasCanvasDraft(lessonId)), [lessonId])

  const pending = usePendingAny()

  const save = useCallback(async () => {
    const settings = flushPending().catch(e => { window.alert(`Не сохранилось: ${e.message}`) }) // глобальные настройки пишутся рядом с уроком; упавшая остаётся несохранённой
    await saveToServer()
    await settings
    setDirty(hasCanvasDraft(lessonId))
  }, [saveToServer, lessonId])

  return { dirty: dirty || pending, markDirty, syncDirty, save }
}
