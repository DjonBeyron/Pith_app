import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { getElevenLabsQuota } from '../../../../shared/lib/ttsApi.js'
import { audioHash, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { planVoiceAll, runVoicePlan, patchFromLine } from './voicePlan.js'
import { generateLineAudio, removeOrphan, clearAudioPatch, defaultDeps, ttsRequest } from './voiceGenerate.js'
import { createPreviewPlayer } from './audioPreview.js'
import { PREVIEW_PHRASE } from './voicePresets.js'

// Состояние озвучки в сборщике: по реплике (busy/error), прогон «Озвучить всё»
// (confirm → running → done), квота ElevenLabs, предпрослушка. Правки сцены идут
// через draft.actions.updateLine — поля озвучки сохраняются как обычные поля
// (черновик → библиотека/нода). Пока идёт генерация, busy=true: окно не закрывается,
// реплики не переставляются (иначе индексы плана уедут).

export function useSceneVoice(draft, deps = defaultDeps, { quotaFn = getElevenLabsQuota } = {}) {
  const [lines, setLines] = useState({})     // index → { busy: true } | { error: строка }
  const [all, setAll] = useState(null)       // null | { phase, plan, current?, progress?, result? }
  const [quota, setQuota] = useState(null)   // { used, limit } | null — функция недоступна локально
  const [playing, setPlaying] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(null) // 'a' | 'b' | null
  const sceneRef = useRef(draft.scene)
  const stopRef = useRef(false)
  const playerRef = useRef(null)
  const actions = draft.actions

  useEffect(() => { sceneRef.current = draft.scene }, [draft.scene])
  useEffect(() => {
    const p = createPreviewPlayer()
    p.subscribe(s => setPlaying(s.playing))
    playerRef.current = p
    return () => p.destroy()
  }, [])

  const refreshQuota = useCallback(() => { quotaFn().then(setQuota).catch(() => {}) }, [quotaFn])
  useEffect(() => { refreshQuota() }, [refreshQuota])

  const busy = all?.phase === 'running' || previewBusy !== null || Object.values(lines).some(l => l.busy)
  useEffect(() => {
    if (!busy) return undefined
    const guard = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [busy])

  const setLine = useCallback((i, v) => setLines(s => { const n = { ...s }; if (v) n[i] = v; else delete n[i]; return n }), [])

  // Озвучить одну реплику: force — заново, минуя кэш по hash
  const voiceLine = useCallback(async (i, { force = false } = {}) => {
    const scene = sceneRef.current
    const line = scene.timeline[i]
    if (!line?.text?.trim() || lines[i]?.busy) return
    setLine(i, { busy: true })
    const oldUrl = line.audioUrl
    try {
      const character = scene.characters[line.who]
      const hash = audioHash(line.text, voiceSpec(character))
      const cached = force ? null : scene.timeline.find((l, j) => j !== i && l?.audioUrl && l.audioMeta?.hash === hash)
      const patch = cached ? patchFromLine(cached) : await generateLineAudio(line.text, character, deps)
      actions.updateLine(i, patch)
      if (oldUrl && oldUrl !== patch.audioUrl) removeOrphan(scene.timeline, oldUrl, i, deps)
      setLine(i, null)
      if (!cached) refreshQuota()
    } catch (e) {
      setLine(i, { error: e?.message || String(e) })
    }
  }, [lines, deps, actions, setLine, refreshQuota])

  const removeLineAudio = useCallback(i => {
    const scene = sceneRef.current
    const url = scene.timeline[i]?.audioUrl
    actions.updateLine(i, clearAudioPatch())
    setLine(i, null)
    if (url) removeOrphan(scene.timeline, url, i, deps)
  }, [actions, deps, setLine])

  const playLine = useCallback(i => {
    const url = sceneRef.current.timeline[i]?.audioUrl
    if (!url) return
    if (playing === i) { playerRef.current?.stop(); return }
    playerRef.current?.play(url, i).catch(e => setLine(i, { error: e.message }))
  }, [playing, setLine])

  // «Прослушать голос» персонажа: тестовая фраза, файл не сохраняется (квота тратится)
  const previewVoice = useCallback(async who => {
    if (previewBusy) return
    setPreviewBusy(who)
    try {
      const { file } = await deps.tts(PREVIEW_PHRASE, ttsRequest(voiceSpec(sceneRef.current.characters[who])))
      await playerRef.current?.play(file, `voice-${who}`)
      refreshQuota()
      return null
    } catch (e) {
      return e?.message || String(e)
    } finally { setPreviewBusy(null) }
  }, [previewBusy, deps, refreshQuota])

  // «Озвучить всё»: план → подтверждение (диалог) → последовательный прогон → итог
  const openAll = useCallback(() => { setAll({ phase: 'confirm', plan: planVoiceAll(sceneRef.current) }); refreshQuota() }, [refreshQuota])
  const stopAll = useCallback(() => { stopRef.current = true }, [])
  const closeAll = useCallback(() => setAll(a => (a?.phase === 'running' ? a : null)), [])
  const startAll = useCallback(async () => {
    const plan = all?.plan
    if (!plan || all.phase !== 'confirm' || !plan.items.length) return
    stopRef.current = false
    setAll({ phase: 'running', plan, current: null, progress: { done: 0, total: plan.items.length, ok: 0, failed: [] } })
    const result = await runVoicePlan(plan, {
      generate: item => { setAll(a => ({ ...a, current: item.index })); return generateLineAudio(item.text, sceneRef.current.characters[item.who], deps) },
      reusePatch: j => patchFromLine(sceneRef.current.timeline[j]),
      apply: (i, patch) => {
        const tl = sceneRef.current.timeline
        const old = tl[i]?.audioUrl
        actions.updateLine(i, patch)
        setLine(i, null)
        if (old && old !== patch.audioUrl) removeOrphan(tl, old, i, deps)
      },
      onProgress: p => setAll(a => ({
        ...a, current: null,
        progress: { done: p.done, total: p.total, ok: a.progress.ok + (p.ok ? 1 : 0), failed: p.ok ? a.progress.failed : [...a.progress.failed, { index: p.index, error: p.error }] },
      })),
      isStopped: () => stopRef.current,
    })
    setAll(a => ({ ...a, phase: 'done', current: null, result }))
    refreshQuota()
  }, [all, deps, actions, setLine, refreshQuota])

  return useMemo(() => ({
    lines, all, quota, busy, playing, previewBusy,
    voiceLine, removeLineAudio, playLine, previewVoice,
    openAll, startAll, stopAll, closeAll, refreshQuota,
  }), [lines, all, quota, busy, playing, previewBusy, voiceLine, removeLineAudio, playLine, previewVoice, openAll, startAll, stopAll, closeAll, refreshQuota])
}
