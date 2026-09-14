import { useState, useEffect, useCallback } from 'react'
import {
  defaultAudioClips, splitAudioClip, moveAudioClip, trimAudioClip, removeAudioClip, duplicateAudioClip,
} from '../../../shared/lib/audioClips.js'

// Нарезка озвучки в редакторе тренажёра: состояние audioClips + операции
// (сама математика — shared/lib/audioClips.js). Отмена — ↶ на 10 шагов,
// история хранится рядом с клипами тем же приёмом, что у сетки таблицы
// (tableGridHistory.js): снимок = сам массив, ничего не копируем.
//
// Файл заменили (fileId или duration другие) — старая нарезка не имеет
// смысла, кладём файл заново одним куском. Первый заход с сохранённой
// нарезкой того же файла — оставляем как есть.
const HISTORY_LIMIT = 10

export function useAudioClipsEdit(initialClips, fileId, duration) {
  const [state, setState] = useState(() => ({
    clips: initialClips?.length ? initialClips : defaultAudioClips(duration),
    past: [],
    key: `${fileId}:${duration}`,
  }))

  useEffect(() => {
    const key = `${fileId}:${duration}`
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(prev => (prev.key === key ? prev : {
      clips: fileId && duration ? defaultAudioClips(duration) : [], past: [], key,
    }))
  }, [fileId, duration])

  const apply = useCallback(fn => {
    setState(prev => {
      const next = fn(prev.clips)
      if (next === prev.clips) return prev
      return { ...prev, clips: next, past: [...prev.past, prev.clips].slice(-HISTORY_LIMIT) }
    })
  }, [])

  const undo = useCallback(() => {
    setState(prev => (prev.past.length
      ? { ...prev, clips: prev.past[prev.past.length - 1], past: prev.past.slice(0, -1) }
      : prev))
  }, [])

  const split  = useCallback(t => apply(prev => splitAudioClip(prev, t)), [apply])
  const move   = useCallback((id, at, len) => apply(prev => moveAudioClip(prev, id, at, len)), [apply])
  const trim   = useCallback((id, side, t) => apply(prev => trimAudioClip(prev, id, side, t, duration ?? 0)), [apply, duration])
  const remove = useCallback(id => apply(prev => removeAudioClip(prev, id)), [apply])
  const duplicate = useCallback((id, len) => apply(prev => duplicateAudioClip(prev, id, len)), [apply])
  // Какое слово светится, пока звучит этот кусок (null — по таймингам озвучки)
  const setLayer = useCallback((id, layerId) => apply(prev => prev.map(c => (c.id === id ? { ...c, layerId: layerId || null } : c))), [apply])

  return { clips: state.clips, split, move, trim, remove, duplicate, setLayer, undo, canUndo: state.past.length > 0 }
}
