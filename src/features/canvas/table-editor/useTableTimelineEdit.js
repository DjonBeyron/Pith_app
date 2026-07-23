import { useState, useCallback } from 'react'

function uid() { return crypto.randomUUID() }

// Один слой = одна ячейка + один клип [{start, end}] + visible.
// Дефолтные слои (isDefault=true) нельзя удалить; extra-слои — можно.
function buildDefaultLayers(cells) {
  return cells.map(c => ({ id: uid(), cellId: c.id, visible: true, clips: [], isDefault: true }))
}

function restoreLayers(saved, cells) {
  const cellIdSet = new Set(cells.map(c => c.id))
  const restored = saved.map(l => ({
    id: l.id ?? uid(),
    cellId: l.cellId,
    word: l.word,
    isCheck: l.isCheck ?? false,
    visible: l.visible !== false,
    clips: l.clips ?? [],
    isDefault: !!l.cellId && cellIdSet.has(l.cellId),
  }))
  // Если ячеек стало больше — добавить недостающие дефолтные слои
  const existingCellIds = new Set(restored.filter(l => l.isDefault).map(l => l.cellId))
  cells.forEach(c => {
    if (!existingCellIds.has(c.id)) {
      restored.push({ id: uid(), cellId: c.id, visible: true, clips: [], isDefault: true })
    }
  })
  return restored
}

export function useTableTimelineEdit(initialTimeline, cells) {
  const [layers, setLayers] = useState(() =>
    initialTimeline?.layers?.length
      ? restoreLayers(initialTimeline.layers, cells)
      : buildDefaultLayers(cells),
  )

  // Заполнить пустые клипы: ширина 1 с (или полная длина, если аудио короче)
  const initClips = useCallback((dur) => {
    if (!dur) return
    setLayers(prev => prev.map(l =>
      l.clips.length === 0 ? { ...l, clips: [{ start: 0, end: Math.min(1, dur) }] } : l,
    ))
  }, [])

  const toggleVisible = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }, [])

  const updateClip = useCallback((id, clip) => {
    setLayers(prev => prev.map(l =>
      l.id === id ? { ...l, clips: [{ start: clip.start, end: clip.end }] } : l,
    ))
  }, [])

  const addLayer = useCallback((cellId, dur) => {
    setLayers(prev => [...prev, {
      id: uid(), cellId, visible: true,
      clips: dur ? [{ start: 0, end: Math.min(1, dur) }] : [],
      isDefault: false,
    }])
  }, [])

  // Дорожка для слова вне таблицы (авто-режим: слово появляется в боксе по таймлайну)
  // Дедуплицирует: если дорожка для этого слова уже есть — ничего не делает.
  const addWordLayer = useCallback((word, dur) => {
    setLayers(prev => {
      if (prev.some(l => l.word?.toLowerCase() === word.toLowerCase())) return prev
      return [...prev, {
        id: uid(), word, visible: true,
        clips: dur ? [{ start: 0, end: Math.min(1, dur) }] : [],
        isDefault: false,
      }]
    })
  }, [])

  // Дорожка «Проверить» — плеер запускает проверку когда достигает начала клипа.
  // force=true (по умолчанию): заменяет существующую. force=false: добавляет только если нет.
  const addCheckLayer = useCallback((dur, force = true) => {
    setLayers(prev => {
      if (!force && prev.some(l => l.isCheck)) return prev
      const without = prev.filter(l => !l.isCheck)
      const start = Math.max(0, (dur ?? 0) - 0.3)
      return [...without, {
        id: uid(), isCheck: true, visible: true,
        clips: dur ? [{ start, end: dur }] : [],
        isDefault: false,
      }]
    })
  }, [])

  // Word и check слои нельзя удалить — только скрыть.
  const removeLayer = useCallback((id) => {
    setLayers(prev => prev.filter(l => l.id !== id || l.isDefault || l.word || l.isCheck))
  }, [])

  function getTimeline() {
    return {
      // Сохраняем ВСЕ слои с клипами (включая скрытые) — чтобы состояние
      // visible и позиции клипов не терялись при повторном открытии редактора.
      // Плеер проверяет layer.visible сам и игнорирует скрытые.
      layers: layers
        .filter(l => l.clips.length > 0)
        .map(({ id, cellId, word, isCheck, visible, clips }) => ({ id, cellId, word, isCheck, visible, clips })),
    }
  }

  return { layers, initClips, toggleVisible, updateClip, addLayer, addWordLayer, addCheckLayer, removeLayer, getTimeline }
}
