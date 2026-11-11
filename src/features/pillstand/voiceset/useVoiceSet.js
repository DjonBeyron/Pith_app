import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { openGameMic, closeGameMic } from '../../../shared/lib/gameMic.js'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { collectDevice } from '../../player/modules/rotate-phone/wordLaneDebug.js'
import { SAVE_HOW, saveDebugFile } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { deviceLine } from '../usePillStand.js'
import useStandMicHealth from '../useStandMicHealth.js'
import { buildPlan, parseWords, planSig, planStats } from './voiceSetPlan.js'
import { readSetPrefs, writeSetPrefs } from './voiceSetPrefs.js'
import { openVoiceSetStore, resumeInfo } from './voiceSetStore.js'
import { createVoiceSetRun, createMiniTrace } from './voiceSetRun.js'
import { buildArchives, mb } from './voiceSetExport.js'
import { createWake } from './voiceSetWake.js'

// «Запись набора» стенда пилюль в React (v3.3.188, CONCEPT_VOICESET.md): хранилище и начатый набор (IndexedDB), настройки (слова, повторы, far), микрофон игры из тапа (openGameMic),
// запись (voiceSetRun.js: захват → ход → клипы в хранилище), экран не гаснет (voiceSetWake.js), здоровье микрофона — механика стенда (useStandMicHealth: оглох / заглушён / оборван → пауза,
// плашка «нажми», оживление → клип переписывается), сторож «звук перестал приходить» (контекст захвата прерван), уход страницы в фон → пауза, сборка и отдача архива по частям.
// view: 'setup' (настройки или начатый набор) | 'record' | 'done' (итог и архив). keepMic — стенд сам держит микрофон включённым: на выходе его не выключаем.
const GRACE_MS = 2500 // после возврата страницы из фона сторож ждёт столько: контекст захвата успевает продолжить сам
const NO_ARCH = { busy: false, parts: null, note: '' }

export default function useVoiceSet({ keepMic = false } = {}) {
  const [store, setStore] = useState(null)
  const [saved, setSaved] = useState(null) // { meta, clips } начатого набора
  const [prefs, setPrefsState] = useState(readSetPrefs)
  const [view, setView] = useState('setup')
  const [st, setSt] = useState(null)       // состояние хода записи (voiceSetSession.state)
  const [mic, setMic] = useState('')       // '' | 'asking' | 'denied' | 'unavailable' | 'nostream'
  const [arch, setArch] = useState(NO_ARCH)
  const [trace] = useState(() => createMiniTrace())
  const [wake] = useState(() => createWake())
  const runRef = useRef(null), levelRef = useRef(null), alive = useRef(true), grace = useRef(0), keep = useRef(keepMic)
  useEffect(() => { keep.current = keepMic }, [keepMic])

  useEffect(() => {
    alive.current = true
    openVoiceSetStore().then(async s => { const got = await s.load().catch(() => null); if (alive.current) { setStore(s); setSaved(got) } })
    return () => { alive.current = false }
  }, [])

  const setPrefs = useCallback(patch => setPrefsState(p => { const next = { ...p, ...patch }; writeSetPrefs(next); return next }), [])
  const settings = useMemo(() => saved?.meta?.settings ?? { words: parseWords(prefs.words), reps: prefs.reps, far: prefs.far }, [saved, prefs])
  const plan = useMemo(() => buildPlan(settings), [settings])
  const info = useMemo(() => resumeInfo(plan, saved?.clips ?? [], saved?.meta?.skipped ?? []), [plan, saved])
  const stats = useMemo(() => planStats(plan), [plan])

  const stopRun = useCallback(() => {
    const run = runRef.current
    runRef.current = null
    if (!run) return
    run.close(); wake.off()
    if (!keep.current) closeGameMic()
  }, [wake])
  useEffect(() => () => stopRun(), [stopRun])

  const paint = useCallback((game, voice) => {
    const el = levelRef.current
    if (!el) return
    el.style.setProperty('--lv', Math.min(1, Math.sqrt(game) * 2.2).toFixed(3))
    if (voice) el.setAttribute('data-voice', '1'); else el.removeAttribute('data-voice')
  }, [])

  /** Из тапа: fresh — новый набор (старый стирается), иначе продолжить начатый */
  const begin = useCallback(fresh => {
    if (!store || runRef.current) return
    setMic('asking'); setArch(NO_ARCH)
    const asked = openGameMic() // getUserMedia — прямо в нажатии
    wake.on()
    try { globalThis.navigator?.storage?.persist?.()?.catch?.(() => {}) } catch { /* без постоянного хранилища */ }
    const p = fresh ? buildPlan({ words: parseWords(prefs.words), reps: prefs.reps, far: prefs.far }) : plan
    ;(async () => {
      let meta = saved?.meta, clips = saved?.clips ?? []
      if (fresh || !meta) {
        const set = { words: parseWords(prefs.words), reps: prefs.reps, far: prefs.far }
        meta = { sig: planSig(set), settings: set, version: APP_VERSION, ua: String(globalThis.navigator?.userAgent ?? ''), device: deviceLine(), deviceInfo: collectDevice(), createdAt: new Date().toISOString(), skipped: [], captures: [], planCount: p.length }
        clips = []
        await store.clear(); await store.saveMeta(meta)
      }
      const r = await asked
      if (!alive.current) return
      if (r !== 'granted') { setMic(r); wake.off(); return }
      const run = createVoiceSetRun({
        store, plan: p, meta, clips, trace, version: APP_VERSION, onLevel: paint,
        onState: s => { setSt(s); if (s.phase === 'done' && runRef.current === run) { stopRun(); setView('done') } },
        onClips: list => setSaved({ meta: run.meta(), clips: list }),
      })
      if (!run.open()) { setMic('nostream'); wake.off(); return }
      runRef.current = run
      setSaved({ meta: run.meta(), clips }); setMic(''); setView('record')
      run.session.start()
    })().catch(e => { if (alive.current) setMic(`ошибка: ${e?.message ?? e}`) })
  }, [store, saved, prefs, plan, trace, wake, paint, stopRun])

  const onRevived = useCallback(() => {
    const run = runRef.current
    if (!run) return
    if (run.open() && run.session.state().pauseWhy === 'mic') run.session.resume()
  }, [])
  const { health, tap: micTap } = useStandMicHealth({ trace, on: view === 'record', onRevived })
  useEffect(() => { if (health.state !== 'ok') runRef.current?.session.pause('mic') }, [health.state])

  useEffect(() => {
    if (view !== 'record') return undefined
    const vis = () => { if (document.visibilityState === 'hidden') runRef.current?.session.pause('hidden'); else { grace.current = performance.now() + GRACE_MS; runRef.current?.kick() } }
    document.addEventListener('visibilitychange', vis)
    const id = setInterval(() => { // звук перестал приходить (контекст захвата прерван системой) — тот же сигнал, что «слушатель оглох»
      const run = runRef.current
      if (run && document.visibilityState !== 'hidden' && performance.now() > grace.current && run.stalled()) { grace.current = performance.now() + GRACE_MS; trace.push('listen', { status: 'dead', why: 'нет кусков звука' }) }
    }, 500)
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(id) }
  }, [view, trace])

  const cmd = useMemo(() => ({
    pause: () => runRef.current?.session.pause('user'),
    resume: () => runRef.current?.session.resume(),
    redo: () => runRef.current?.session.redoPrev(),
    skip: () => runRef.current?.session.skip(),
    finish: () => runRef.current?.session.finish(),
  }), [])

  /** Выйти из записи к итогу / настройкам без «Закончить» (кнопка «к стенду») */
  const leave = useCallback(() => { stopRun(); setSt(null); setView('setup') }, [stopRun])
  const toDone = useCallback(() => { setArch(NO_ARCH); setView('done') }, [])
  const toSetup = useCallback(() => setView('setup'), [])

  const build = useCallback(async () => {
    if (!store || !saved?.clips?.length) return
    setArch({ busy: true, parts: null, note: 'Собираю архив…' })
    try {
      const parts = await buildArchives({ store, meta: saved.meta, clips: saved.clips })
      const lost = parts.reduce((n, p) => n + p.missing.length, 0)
      if (alive.current) setArch({ busy: false, parts, note: `Готово: ${parts.length > 1 ? `${parts.length} части` : 'один архив'}, ${mb(parts.reduce((n, p) => n + p.size, 0))}${lost ? ` · ⚠ без звука ${lost}` : ''}. Теперь нажми «Сохранить…»` })
      globalThis.__voiceSet = { parts } // автопроверка выгрузки
    } catch (e) { if (alive.current) setArch({ busy: false, parts: null, note: `Не получилось собрать архив: ${e?.message ?? e}` }) }
  }, [store, saved])

  /** Отдать часть — прямо из нажатия («Поделиться» на iPhone) */
  const give = useCallback(async part => {
    const how = await saveDebugFile({ name: part.name, blob: part.blob })
    if (alive.current) setArch(a => ({ ...a, note: `${SAVE_HOW[how] ?? how}: ${part.name}, ${mb(part.size)}`, given: { ...(a.given ?? {}), [part.part]: how } }))
  }, [])

  const remove = useCallback(async () => {
    if (!store) return
    stopRun()
    await store.clear().catch(() => {})
    if (alive.current) { setSaved(null); setSt(null); setArch(NO_ARCH); setView('setup') }
  }, [store, stopRun])

  return { ready: !!store, persistent: store?.persistent ?? true, saved, prefs, setPrefs, settings, plan, info, stats, view, st, mic, health, micTap, levelRef, begin, cmd, leave, toDone, toSetup, arch, build, give, remove, wakeOk: wake.supported() }
}
