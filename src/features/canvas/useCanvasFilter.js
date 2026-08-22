import { useState, useMemo, useCallback } from 'react'
import { nodeMissesMedia } from './nodeMediaStatus.js'

// Состояние фильтра канваса (шапка, только админ): отмеченные типы нод плюс
// особый переключатель «не загруженные» — ноды, которым ещё не приложили
// медиа-файл. Вынесено из CanvasPage.jsx, чтобы страница не упиралась
// в потолок 400 строк.
export function useCanvasFilter(nodes) {
  const [types, setTypes] = useState(() => new Set())
  const [onlyMissingMedia, setOnlyMissingMedia] = useState(false)

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
