import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { getElevenLabsQuota } from '../../../../shared/lib/ttsApi.js'
import { audioHash, audioPartOf, translationVoiceSpec, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { patchFromLine, toSetPatch, setSpec, setText } from './voicePlan.js'
import { generateSetAudio, removeOrphan, clearAudioPatch, defaultDeps, ttsRequest } from './voiceAllDeps.js'
import { useVoiceAll } from './useVoiceAll.js'
import { createPreviewPlayer } from './audioPreview.js'
import { PREVIEW_PHRASE, TRANSLATION_PREVIEW_PHRASE } from './voicePresets.js'
import { lineKey } from './voiceStatus.js'

// Состояние озвучки в сборщике: по реплике и набору (busy/error; оригинал — ключ i, перевод —
// 't<i>', voiceStatus.lineKey), прогон «Озвучить всё» (useVoiceAll), квота ElevenLabs,
// предпрослушка. Правки сцены идут через draft.actions.updateLine — поля озвучки сохраняются как
// обычные поля (черновик → библиотека/нода). Пока идёт генерация, busy=true: окно не закрывается,
// реплики не переставляются (иначе индексы плана уедут). set: 'original' | 'translation'.

export function useSceneVoice(draft, deps = defaultDeps, { quotaFn = getElevenLabsQuota } = {}) {
  const [lines, setLines] = useState({})     // lineKey → { busy: true } | { error: строка }
  const [quota, setQuota] = useState(null)   // { used, limit } | null — функция недоступна локально
  const [playing, setPlaying] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(null) // 'a' | 'b' | 'scene' | 'tr-a' … | null
  const sceneRef = useRef(draft.scene)
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

  const setLine = useCallback((i, v, set = 'original') => setLines(s => { const k = lineKey(i, set); const n = { ...s }; if (v) n[k] = v; else delete n[k]; return n }), [])
  const allApi = useVoiceAll({ sceneRef, deps, actions, setLine, refreshQuota })

  const busy = allApi.running || previewBusy !== null || Object.values(lines).some(l => l.busy)
  useEffect(() => {
    if (!busy) return undefined
    const guard = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [busy])

  // Озвучить одну реплику (набор set): force — заново, минуя кэш по hash (кэш смотрит оба набора)
  const voiceLine = useCallback(async (i, { force = false, set = 'original' } = {}) => {
    const scene = sceneRef.current
    const line = scene.timeline[i]
    const text = setText(set, line)
    if (!text || lines[lineKey(i, set)]?.busy) return
    setLine(i, { busy: true }, set)
    const urlKey = set === 'translation' ? 'translationAudioUrl' : 'audioUrl'
    const oldUrl = line[urlKey]
    try {
      const character = scene.characters[line.who]
      const hash = audioHash(text, setSpec(set, character, scene))
      let cached = null
      if (!force) {
        for (const s of ['original', 'translation']) {
          const j = scene.timeline.findIndex((l, k) => !(k === i && s === set) && audioPartOf(l, s)?.audioUrl && audioPartOf(l, s)?.audioMeta?.hash === hash)
          if (j >= 0) { cached = patchFromLine(scene.timeline[j], s); break }
        }
      }
      const patch = toSetPatch(cached ?? await generateSetAudio(set, line, character, scene, deps), set)
      actions.updateLine(i, patch)
      if (oldUrl && oldUrl !== patch[urlKey]) removeOrphan(scene.timeline, oldUrl, i, deps, set)
      setLine(i, null, set)
      if (!cached) refreshQuota()
    } catch (e) {
      setLine(i, { error: e?.message || String(e) }, set)
    }
  }, [lines, deps, actions, setLine, refreshQuota])

  const removeLineAudio = useCallback((i, set = 'original') => {
    const scene = sceneRef.current
    const url = audioPartOf(scene.timeline[i], set)?.audioUrl
    actions.updateLine(i, clearAudioPatch(set))
    setLine(i, null, set)
    if (url) removeOrphan(scene.timeline, url, i, deps, set)
  }, [actions, deps, setLine])

  const playLine = useCallback((i, set = 'original') => {
    const url = audioPartOf(sceneRef.current.timeline[i], set)?.audioUrl
    if (!url) return
    const key = lineKey(i, set)
    if (playing === key) { playerRef.current?.stop(); return }
    playerRef.current?.play(url, key).catch(e => setLine(i, { error: e.message }, set))
  }, [playing, setLine])

  // «Прослушать голос»: who — персонаж ('a'/'b'), kind 'translation' — голос перевода (who null —
  // общий голос сцены). Тестовая фраза, файл не сохраняется (квота тратится). Возвращает текст ошибки
  const previewVoice = useCallback(async (who, kind = 'original') => {
    if (previewBusy) return null
    const key = kind === 'translation' ? `tr-${who ?? 'scene'}` : who
    setPreviewBusy(key)
    try {
      const scene = sceneRef.current
      const ch = who ? scene.characters[who] : null
      const spec = kind === 'translation' ? translationVoiceSpec(ch, scene) : voiceSpec(ch)
      const { file } = await deps.tts(kind === 'translation' ? TRANSLATION_PREVIEW_PHRASE : PREVIEW_PHRASE, ttsRequest(spec))
      await playerRef.current?.play(file, `voice-${key}`)
      refreshQuota()
      return null
    } catch (e) {
      return e?.message || String(e)
    } finally { setPreviewBusy(null) }
  }, [previewBusy, deps, refreshQuota])

  const { all, openAll, setSets, startAll, stopAll, closeAll } = allApi
  return useMemo(() => ({
    lines, all, quota, busy, playing, previewBusy,
    voiceLine, removeLineAudio, playLine, previewVoice,
    openAll, setSets, startAll, stopAll, closeAll, refreshQuota,
  }), [lines, all, quota, busy, playing, previewBusy, voiceLine, removeLineAudio, playLine, previewVoice, openAll, setSets, startAll, stopAll, closeAll, refreshQuota])
}
