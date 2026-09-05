import { useState, useEffect, useMemo, useCallback } from 'react'
import { nodeMissesMedia } from './nodeMediaStatus.js'
import { canvasFilterKey } from './canvasStorageKeys.js'

function readStored(lessonId) {
  if (!lessonId) return null
  try {
    const raw = localStorage.getItem(canvasFilterKey(lessonId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Состояние фильтра канваса (шапка, только админ): отмеченные типы нод плюс
// особый переключатель «не загруженные» — ноды, которым ещё не приложили
// медиа-файл. Вынесено из CanvasPage.jsx, чтобы страница не упиралась
// в потолок 400 строк. Запоминается в localStorage на конкретный урок —
// открыл урок, отфильтровал по «фото» посмотреть медиа, вышел и вернулся —
// фильтр остался тем же, а не сбросился.
export function useCanvasFilter(nodes, lessonId) {
  const [types, setTypes] = useState(() => new Set(readStored(lessonId)?.types ?? []))
  const [onlyMissingMedia, setOnlyMissingMedia] = useState(() => readStored(lessonId)?.onlyMissingMedia ?? false)

  // Смена урока (тот же CanvasPage, другой lessonId) — перечитать фильтр
  // этого урока, а не тащить с собой фильтр предыдущего
  useEffect(() => {
    const stored = readStored(lessonId)
    // CanvasPage не размонтирует компонент при смене урока (ShellV2 меняет
    // только lessonId) — без синхронного сброса тут фильтр предыдущего
    // урока держался бы, пока не тронешь его руками
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypes(new Set(stored?.types ?? []))
    setOnlyMissingMedia(stored?.onlyMissingMedia ?? false)
  }, [lessonId])

  useEffect(() => {
    if (!lessonId) return
    try {
      localStorage.setItem(canvasFilterKey(lessonId), JSON.stringify({ types: [...types], onlyMissingMedia }))
    } catch { /* localStorage недоступен (приватный режим и т.п.) — фильтр просто не запомнится */ }
  }, [lessonId, types, onlyMissingMedia])

  // Сколько нод ждёт файл — показываем прямо в пункте меню, чтобы было видно
  // объём работы, не включая фильтр
  const missingCount = useMemo(() => (nodes ?? []).filter(nodeMissesMedia).length, [nodes])

  const toggleType = useCallback(type => setTypes(prev => {
    const next = new Set(prev)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return next
  }), [])

  const toggleMissingMedia = useCallback(() => setOnlyMissingMedia(v => !v), [])

  const reset = useCallback(() => {
    setTypes(new Set())
    setOnlyMissingMedia(false)
  }, [])

  return {
    types,
    onlyMissingMedia,
    missingCount,
    activeCount: types.size + (onlyMissingMedia ? 1 : 0),
    toggleType,
    toggleMissingMedia,
    reset,
  }
}
