import { useState, useCallback } from 'react'

function uid() { return crypto.randomUUID() }

// Один слой = одна ячейка + один клип [{start, end}] + visible.
// Дефолтные слои (isDefault=true) нельзя удалить; extra-слои — можно.
// highlightOn — независимый от visible переключатель ТОЛЬКО зелёного клипа
// (подсветка+выбор ячейки в ответ): выключен — ячейка не подсвечивается и не
// падает в собранную фразу, но проявление текста (второй клип) работает как обычно.
// collect — галочка прямо на зелёном клипе: идёт ли значение в собираемую фразу.
// Выключена — подсветка и анимация отрабатывают как обычно, но слово/ячейка в
// бокс не падает (нужно, когда автор хочет показать ячейку, не вставляя её в
// ответ). По умолчанию включена у всех слоёв.
function buildDefaultLayers(cells) {
  return cells.map(c => ({ id: uid(), cellId: c.id, visible: true, highlightOn: true, collect: true, clips: [], isDefault: true }))
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
    collect: l.collect !== false,
    pick: l.pick,
    // Повторы той же анимации и моменты очистки собранной фразы
    repeats: l.repeats,
    clears: l.clears,
    isClear: l.isClear ?? false,
    clips: l.clips ?? [],
    isDefault: !!l.cellId && cellIdSet.has(l.cellId),
  }))
  // Если ячеек стало больше — добавить недостающие дефолтные слои
  const existingCellIds = new Set(restored.filter(l => l.isDefault).map(l => l.cellId))
  cells.forEach(c => {
    if (!existingCellIds.has(c.id)) {
      restored.push({ id: uid(), cellId: c.id, visible: true, highlightOn: true, collect: true, clips: [], isDefault: true })
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

  // Галочка «идёт в сборку» на зелёном клипе
  const toggleCollect = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, collect: !(l.collect !== false) } : l))
  }, [])

  // Особая ячейка (со списком вариантов): какой из них уходит в собранную
  // фразу в авто-режиме. В уроке меню при этом не показывается — выбор уже
  // сделан здесь, автором
  const setLayerPick = useCallback((id, pick) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, pick: pick || undefined } : l)))
  }, [])

  // Тот же переключатель, но сразу для всех слоёв: у длинного таймлайна
  // щёлкать по каждому клипу долго. Слой «Проверить» не трогаем — у него
  // собирать нечего и своей галочки нет
  const setAllCollect = useCallback((value) => {
    setLayers(prev => prev.map(l => (l.isCheck ? l : { ...l, collect: value })))
  }, [])

  const toggleVisible = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }, [])

  // Независимый глазик самого зелёного (подсветка+выбор) клипа — только у cell-слоя.
  const toggleHighlight = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, highlightOn: !(l.highlightOn !== false) } : l))
  }, [])

  // Повтор клипа: та же дорожка, та же анимация, другое время. Нужен, когда
  // ячейка звучит в записи дважды — раньше пришлось бы заводить вторую дорожку
  // на ту же ячейку, и в списке было бы не разобрать, где какая.
  const duplicateClip = useCallback((id, timelineDur) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const base = l.clips?.[0]
      if (!base) return l
      const len = Math.max(0.2, base.end - base.start)
      const all = [base, ...(l.repeats ?? [])]
      const lastEnd = Math.max(...all.map(c => c.end))
      // Ставим следом за последним, но не вываливаемся за конец композиции
      const start = Math.min(lastEnd + 0.2, Math.max(0, (timelineDur ?? lastEnd + len) - len))
      return { ...l, repeats: [...(l.repeats ?? []), { start, end: start + len }] }
    }))
  }, [])

  // Клип очистки на дорожке слоя: в его начале собранная фраза стирается —
  // так автор показывает «а теперь соберём заново».
  const addClearClip = useCallback((id, timelineDur) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const base = l.clips?.[0]
      const from = base ? base.end + 0.2 : 0
      const start = Math.min(from, Math.max(0, (timelineDur ?? from + 0.5) - 0.5))
      return { ...l, clears: [...(l.clears ?? []), { start, end: start + 0.5 }] }
    }))
  }, [])

  const removeExtraClip = useCallback((id, kind, index) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const list = [...(l[kind] ?? [])]
      list.splice(index, 1)
      return { ...l, [kind]: list.length ? list : undefined }
    }))
  }, [])

  // Правка повтора/очистки — у них своя нумерация внутри своего массива
  const updateExtraClip = useCallback((id, kind, index, clip) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const list = [...(l[kind] ?? [])]
      list[index] = { start: clip.start, end: clip.end }
      return { ...l, [kind]: list }
    }))
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
      id: uid(), cellId, visible: true, highlightOn: true, collect: true,
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
        id: uid(), word, visible: true, collect: true,
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

  // Отдельная дорожка «Очистить»: доходит до неё прогон — собранная фраза
  // стирается целиком. В отличие от клипа очистки на дорожке слоя, эта живёт
  // сама по себе, её удобно двигать и видно в общем списке.
  const addClearLayer = useCallback((dur) => {
    setLayers(prev => {
      const start = Math.max(0, (dur ?? 1) / 2)
      return [...prev, {
        id: uid(), isClear: true, visible: true,
        clips: [{ start, end: start + 0.5 }],
        isDefault: false,
      }]
    })
  }, [])

  // Word и check слои нельзя удалить — только скрыть.
  const removeLayer = useCallback((id) => {
    setLayers(prev => prev.filter(l => l.id !== id || l.isDefault || l.word || l.isCheck))
  }, [])

  // Автоуборка: автор поменял «правильный ответ» или текст ячейки — дорожки
  // для слов, которых в ответе больше нет, и для исчезнувших ячеек только
  // мешают (и продолжали бы играть в уроке). Убираем их молча.
  // removeLayer сюда не годится: он намеренно не даёт удалять слова и ячейки
  // руками, чтобы автор не снёс дорожку случайным кликом.
  const pruneLayers = useCallback((wordSet, cellIdSet) => {
    setLayers(prev => {
      const next = prev.filter(l => {
        if (l.isCheck) return true
        if (l.word)   return wordSet.has(l.word.toLowerCase())
        if (l.cellId) return cellIdSet.has(l.cellId)
        return true
      })
      return next.length === prev.length ? prev : next
    })
  }, [])

  function getTimeline() {
    return {
      // Сохраняем ВСЕ слои с клипами (включая скрытые) — чтобы состояние
      // visible и позиции клипов не терялись при повторном открытии редактора.
      // Плеер проверяет layer.visible сам и игнорирует скрытые.
      layers: layers
        .filter(l => l.clips.length > 0)
        .map(({ id, cellId, word, isCheck, isClear, visible, highlightOn, collect, pick, clips, repeats, clears }) =>
          ({ id, cellId, word, isCheck, isClear, visible, highlightOn, collect, pick, clips, repeats, clears })),
    }
  }

  return { layers, initClips, toggleVisible, toggleHighlight, toggleCollect, setAllCollect, setLayerPick, updateClip, updateExtraClip, duplicateClip, addClearClip, removeExtraClip, addLayer, addWordLayer, addCheckLayer, addClearLayer, removeLayer, pruneLayers, getTimeline }
}
