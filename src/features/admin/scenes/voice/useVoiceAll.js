import { useState, useRef, useCallback } from 'react'
import { resolveVoiceFlags } from '../../../scene/v2/sceneOptions.js'
import { planVoiceAll, runVoicePlan, patchFromLine } from './voicePlan.js'
import { generateItemAudio, removeOrphan, AUDIO_SETS_ORDER } from './voiceAllDeps.js'
import { useSegmentApplier } from './voiceSegments.js'

// Прогон «Озвучить всё» в сборщике (часть useSceneVoice): confirm (план по выбранным наборам —
// Текст / Перевод) → running (строго последовательно, ошибка одной не обрывает) → done (итог).
// По умолчанию выбраны наборы, включённые в options.voice сцены (оригинал всегда предлагается,
// если выключены оба). Пока идёт прогон, индексы плана привязаны к позициям реплик — окно не
// закрыть, реплики не переставить (busy у useSceneVoice).
export function useVoiceAll({ sceneRef, deps, actions, setLine, refreshQuota }) {
  const [all, setAll] = useState(null) // null | { phase, plan, sets, current?, progress?, result? }
  const stopRef = useRef(false)
  const segApply = useSegmentApplier(sceneRef, actions, deps)

  const defaultSets = useCallback(() => {
    const f = resolveVoiceFlags(sceneRef.current)
    const sets = AUDIO_SETS_ORDER.filter(s => f[s])
    return sets.length ? sets : ['original']
  }, [sceneRef])

  const openAll = useCallback((sets = null) => {
    const chosen = Array.isArray(sets) && sets.length ? sets : defaultSets()
    setAll({ phase: 'confirm', sets: chosen, plan: planVoiceAll(sceneRef.current, chosen) })
    refreshQuota()
  }, [sceneRef, defaultSets, refreshQuota])

  // Смена набора в диалоге до запуска — план пересчитывается
  const setSets = useCallback(sets => setAll(a => (a?.phase === 'confirm' && sets.length ? { ...a, sets, plan: planVoiceAll(sceneRef.current, sets) } : a)), [sceneRef])
  const stopAll = useCallback(() => { stopRef.current = true }, [])
  const closeAll = useCallback(() => setAll(a => (a?.phase === 'running' ? a : null)), [])

  const startAll = useCallback(async () => {
    const plan = all?.plan
    if (!plan || all.phase !== 'confirm' || !plan.items.length) return
    stopRef.current = false
    segApply.reset()
    setAll(a => ({ ...a, phase: 'running', current: null, progress: { done: 0, total: plan.items.length, ok: 0, failed: [] } }))
    const result = await runVoicePlan(plan, {
      generate: item => {
        setAll(a => ({ ...a, current: { index: item.index, set: item.set, seg: item.seg } }))
        return generateItemAudio(item, sceneRef.current, deps)
      },
      reusePatch: (j, set) => patchFromLine(sceneRef.current.timeline[j], set),
      apply: (i, patch, set, item) => {
        if (item) { segApply.apply(item, patch); setLine(i, null, set); return } // часть реплики-шаблона
        const tl = sceneRef.current.timeline
        const urlKey = set === 'translation' ? 'translationAudioUrl' : 'audioUrl'
        const old = tl[i]?.[urlKey]
        actions.updateLine(i, patch)
        setLine(i, null, set)
        if (old && old !== patch[urlKey]) removeOrphan(tl, old, i, deps, set)
      },
      onProgress: p => setAll(a => ({
        ...a, current: null,
        progress: { done: p.done, total: p.total, ok: a.progress.ok + (p.ok ? 1 : 0), failed: p.ok ? a.progress.failed : [...a.progress.failed, { index: p.index, set: p.set, error: p.error, seg: p.seg }] },
      })),
      isStopped: () => stopRef.current,
    })
    setAll(a => ({ ...a, phase: 'done', current: null, result }))
    refreshQuota()
  }, [all, deps, actions, setLine, refreshQuota, sceneRef, segApply])

  return { all, openAll, setSets, startAll, stopAll, closeAll, running: all?.phase === 'running' }
}
