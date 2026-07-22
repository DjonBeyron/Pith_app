import { useState, useCallback } from 'react'

function uid() { return crypto.randomUUID() }

// Один слой = одна ячейка + один клип [{start, end}] + visible.
// Дефолтные слои (isDefault=true) нельзя удалить; extra-слои — можно.
function buildDefaultLayers(cells) {
  return cells.map(c => ({ id: uid(), cellId: c.id, visible: true, clips: [], isDefault: true }))
}

function restoreLayers(saved, cells) {
  const defaultIds = cells.map(c => c.id)
  const restored = saved.map((l, i) => ({
    id: l.id ?? uid(),
    cellId: l.cellId,
    visible: l.visible !== false,
    clips: l.clips ?? [],
    isDefault: i < defaultIds.length,
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

  const removeLayer = useCallback((id) => {
    setLayers(prev => prev.filter(l => l.id !== id || l.isDefault))
  }, [])

  function getTimeline() {
    return {
      layers: layers
        .filter(l => l.visible && l.clips.length > 0)
        .map(({ id, cellId, visible, clips }) => ({ id, cellId, visible, clips })),
    }
  }

  return { layers, initClips, toggleVisible, updateClip, addLayer, removeLayer, getTimeline }
}
