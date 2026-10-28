import { useState, useCallback, useMemo } from 'react'
import { envelopeFromUrl, envelopeFor, envelopeTargets, envPatch, runEnvelopePlan } from './voiceEnvelope.js'
import { lineKey } from './voiceStatus.js'

// «Посчитать огибающую» в панели озвучки сборщика: для уже озвученных реплик (у новых огибающая считается сразу при озвучке, voiceGenerate.js).
// Файл качается по audioUrl, считается shared/lib/audioEnvelope.js, результат — в audioMeta.env через actions.updateLine (обычная правка черновика).
// Состояние по реплике и набору (lineKey, как у озвучки): { busy } | { error }; «для всех» идёт по одной реплике подряд, ошибка одной не обрывает остальные.
// Часть useSceneVoice (его возвращаемый объект дополняется полями env*); deps.envelopeUrl подменяется в тестах.

export function useEnvelopeActions(sceneRef, actions, { envelopeUrl = envelopeFromUrl } = {}) {
  const [state, setState] = useState({})            // lineKey → { busy: true } | { error }
  const [all, setAll] = useState(null)              // null | { done, total, failed, skipped } — прогон «для всех реплик»

  const setLine = useCallback((i, set, v) => setState(s => { const k = lineKey(i, set); const n = { ...s }; if (v) n[k] = v; else delete n[k]; return n }), [])

  // Одна реплика (набор set); true — готово
  const envLine = useCallback(async (i, set = 'original') => {
    setLine(i, set, { busy: true })
    try {
      const env = await envelopeFor(sceneRef.current.timeline[i], set, envelopeUrl)
      actions.updateLine(i, envPatch(sceneRef.current.timeline[i], set, env)) // строка свежая: за время загрузки её могли править
      setLine(i, set, null)
      return true
    } catch (e) {
      setLine(i, set, { error: e?.message || String(e) })
      return false
    }
  }, [sceneRef, actions, envelopeUrl, setLine])

  // Все реплики сцены, где её нет (оригинал и перевод)
  const envAll = useCallback(async () => {
    const { todo, skipped } = envelopeTargets(sceneRef.current)
    setAll({ done: 0, total: todo.length, failed: 0, skipped })
    if (todo.length) await runEnvelopePlan(todo, envLine, p => setAll({ ...p, skipped }))
  }, [sceneRef, envLine])

  const busy = (!!all && all.done < all.total) || Object.values(state).some(l => l.busy)
  return useMemo(() => ({
    envLines: state, envAllState: all, envBusy: busy, envLine, envAll, envDismiss: () => setAll(null),
  }), [state, all, busy, envLine, envAll])
}
