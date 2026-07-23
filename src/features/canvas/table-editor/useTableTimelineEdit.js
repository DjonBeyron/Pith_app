import { useState, useCallback } from 'react'

function uid() { return crypto.randomUUID() }

// Один слой = одна ячейка + один клип [{start, end}] + visible.
// Дефолтные слои (isDefault=true) нельзя удалить; extra-слои — можно.
// highlightOn — независимый от visible переключатель ТОЛЬКО зелёного клипа
// (подсветка+выбор ячейки в ответ): выключен — ячейка не подсвечивается и не
// падает в собранную фразу, но проявление текста (второй клип) работает как обычно.
function buildDefaultLayers(cells) {
  return cells.map(c => ({ id: uid(), cellId: c.id, visible: true, highlightOn: true, clips: [], isDefault: true }))
}

function restoreLayers(saved, cells) {
  const cellIdSet = new Set(cells.map(c => c.id))
  const restored = saved.map(l => ({
    id: l.id ?? uid(),
    cellId: l.cellId,
    word: l.word,
    isCheck: l.isCheck ?? false,
    visible: l.visible !== false,
    highlightOn: l.highlightOn !== false,
    clips: l.clips ?? [],
    isDefault: !!l.cellId && cellIdSet.has(l.cellId),
  }))
  // Если ячеек стало больше — добавить недостающие дефолтные слои
  const existingCellIds = new Set(restored.filter(l => l.isDefault).map(l => l.cellId))
  cells.forEach(c => {
    if (!existingCellIds.has(c.id)) {
      restored.push({ id: uid(), cellId: c.id, visible: true, highlightOn: true, clips: [], isDefault: true })
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

  // У cell-слоя (не word, не check) — два клипа: [0] подсветка (как раньше),
  // [1] проявление — серый, независимый, по умолчанию во всю длину таймлайна
  // (текст ячейки виден весь ролик, пока автор не подрежет).
  const isCellOnly = (l) => !!l.cellId && !l.word && !l.isCheck

  // Заполнить пустые клипы: подсветка — 1с (или полная длина, если аудио короче);
  // проявление (только у cell-слоёв) — весь таймлайн. Старые сохранённые cell-слои
  // с одним клипом (до появления проявления) — дополняем вторым дефолтным клипом.
  const initClips = useCallback((dur, timelineDur) => {
    if (!dur) return
    setLayers(prev => prev.map(l => {
      if (l.clips.length === 0) {
        const highlight = { start: 0, end: Math.min(1, dur) }
        return { ...l, clips: isCellOnly(l) ? [highlight, { start: 0, end: timelineDur ?? dur }] : [highlight] }
      }
      if (isCellOnly(l) && l.clips.length === 1) {
        return { ...l, clips: [...l.clips, { start: 0, end: timelineDur ?? dur }] }
      }
      return l
    }))
  }, [])

  const toggleVisible = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }, [])

  // Независимый глазик самого зелёного (подсветка+выбор) клипа — только у cell-слоя.
  const toggleHighlight = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, highlightOn: !(l.highlightOn !== false) } : l))
  }, [])

  // clipIndex: 0 = подсветка (по умолчанию), 1 = проявление (только у cell-слоёв)
  const updateClip = useCallback((id, clip, clipIndex = 0) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const clips = [...l.clips]
      clips[clipIndex] = { start: clip.start, end: clip.end }
      return { ...l, clips }
    }))
  }, [])

  const addLayer = useCallback((cellId, dur, timelineDur) => {
    setLayers(prev => [...prev, {
      id: uid(), cellId, visible: true, highlightOn: true,
      clips: dur ? [{ start: 0, end: Math.min(1, dur) }, { start: 0, end: timelineDur ?? dur }] : [],
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
        .map(({ id, cellId, word, isCheck, visible, highlightOn, clips }) => ({ id, cellId, word, isCheck, visible, highlightOn, clips })),
    }
  }

  return { layers, initClips, toggleVisible, toggleHighlight, updateClip, addLayer, addWordLayer, addCheckLayer, removeLayer, getTimeline }
}
