import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPool } from '../player/modules/rotate-phone/wordLanePool.js'
import { collectDevice } from '../player/modules/rotate-phone/wordLaneDebug.js'
import { openGameMic, closeGameMic } from '../../shared/lib/gameMic.js'
import { APP_VERSION } from '../../shared/lib/version.js'
import { newSeed } from '../rehearsal/rehearsalSeed.js'
import { createStandTrace } from './pillStandTrace.js'
import { pickTarget } from './pillStandPick.js'
import { readStandPrefs, writeStandPrefs } from './pillStandPrefs.js'
import { stillPool } from './standPool.js'
import { runStandWord } from './standWordRun.js'
import { runStandPhrase } from './standPhraseRun.js'
import useStandModel from './useStandModel.js'
import useStandEar from './useStandEar.js'
import useStandMicHealth from './useStandMicHealth.js'

// Сессия стенда пилюль (CONCEPT_PILLSTAND.md): настройки (язык, режим, длина, сид, авто-следующая), микрофон (openGameMic — только из тапа «Старт», тот же поток, что у игры), модель (useStandModel),
// текущая цель (pillStandPick.js по сиду и номеру), настоящая пилюля (standWordRun / standPhraseRun на пуле «на месте», standPool.js), трасса (pillStandTrace.js) и панель слуха (useStandEar).
// Зачёт — пометка и, при «авто-следующей», новая цель через autoMs. paused — идёт просмотр записи: пилюля и слушатель остановлены. Выход: слушатель, микрофон (closeGameMic — поток жив, дорожка выключена),
// модель (английская вернётся) — всё отпускается в эффектах.
export const WORD_Y = 34   // центр вертикальной пилюли, % высоты экрана
export const PHRASE_Y = 33 // центр широкой

export default function usePillStand(fieldRef, { paused = false } = {}) {
  const [trace] = useState(() => createStandTrace())
  const [prefs, setPrefsState] = useState(readStandPrefs)
  const [seed, setSeedState] = useState(() => newSeed())
  const [n, setN] = useState(0)
  const [gen, setGen] = useState(0)
  const [mic, setMic] = useState('off')
  const [micEpoch, setMicEpoch] = useState(0) // микрофон оживлён (useStandMicHealth) — слушатель и пилюля той же цели заново
  const [res, setRes] = useState(null) // { key, … } — зачёт цели key (у другой цели не показывается)
  const [probe] = useState(() => ({}))
  const timer = useRef(0)
  const model = useStandModel(prefs.lang, trace)
  const { ear, view, clear: clearHist } = useStandEar(trace)
  const { health: micHealth, tap: micTap } = useStandMicHealth({ trace, on: mic === 'on' && !paused, onRevived: useCallback(() => setMicEpoch(e => e + 1), []) })
  const { lang, mode, len } = prefs
  const target = useMemo(() => pickTarget({ seed, n, mode, lang, len }), [seed, n, mode, lang, len])
  const key = `${gen}|${seed}|${n}|${mode}|${lang}|${len}`
  const result = res?.key === key ? res : null

  const setPrefs = useCallback(patch => { trace.push('prefs', patch); setPrefsState(p => ({ ...p, ...patch })) }, [trace])
  useEffect(() => { writeStandPrefs(prefs) }, [prefs])
  const setSeed = useCallback(v => { setSeedState(String(v || newSeed())); setN(0) }, [])
  const next = useCallback(() => setN(x => x + 1), [])
  const reset = useCallback(() => { clearTimeout(timer.current); trace.reset(); trace.push('session', { why: 'сброс' }); setN(0); setGen(g => g + 1) }, [trace])
  const meta = useCallback(() => ({ version: APP_VERSION, device: deviceLine(), deviceInfo: collectDevice(), seed, mode, lang, len, auto: prefs.auto, autoMs: prefs.autoMs }), [seed, mode, lang, len, prefs.auto, prefs.autoMs])

  useEffect(() => { // window.__pillStand — трасса для автопроверки стенда (Playwright) и консоли
    trace.push('session', { version: APP_VERSION, device: deviceLine(), ua: globalThis.navigator?.userAgent ?? '' })
    globalThis.__pillStand = { trace }
    return () => { clearTimeout(timer.current); closeGameMic(); trace.push('session', { why: 'выход' }); if (globalThis.__pillStand?.trace === trace) delete globalThis.__pillStand }
  }, [trace])
  useEffect(() => { clearTimeout(timer.current); trace.push('target', { ...target, gen }) }, [target, gen, trace])

  const onResult = useRef(null)
  useEffect(() => {
    onResult.current = r => {
      const afterVoiceMs = ear.lastVoice != null ? Math.round(trace.now() - (ear.t0 + ear.lastVoice)) : null
      const got = { ...r, afterVoiceMs, say: target.say }
      trace.push('result', got)
      setRes({ ...got, key })
      clearTimeout(timer.current)
      if (prefs.auto) timer.current = setTimeout(next, prefs.autoMs)
    }
  }, [ear, trace, target, key, prefs.auto, prefs.autoMs, next])

  useEffect(() => {
    const root = fieldRef.current
    if (mic !== 'on' || paused || !model.ready || !root) return undefined
    const y = target.mode === 'word' ? WORD_Y : PHRASE_Y
    const opts = { pool: stillPool(createPool(root), y), root, target, y, trace, probe, onResult: r => onResult.current(r) }
    let run = null
    try { run = target.mode === 'word' ? runStandWord(opts) : runStandPhrase(opts) } catch (e) { trace.push('run-error', { msg: String(e?.message ?? e) }); return undefined }
    trace.push('run', { mode: target.mode, n: target.n, ...(micEpoch ? { micEpoch } : {}) })
    return () => { run.stop(); for (const k of Object.keys(probe)) delete probe[k]; trace.push('run-stop', { n: target.n }) }
  }, [mic, paused, model.ready, target, gen, micEpoch, fieldRef, trace, probe])

  /** «Старт» — из тапа: микрофон игры (диалог iOS — здесь) */
  const start = useCallback(() => {
    setMic('asking'); trace.push('mic', { state: 'asking' })
    openGameMic().then(r => { trace.push('mic', { state: r }); setMic(r === 'granted' ? 'on' : r) })
  }, [trace])

  return { trace, prefs, setPrefs, seed, setSeed, n, target, next, reset, mic, start, model, result, ear, view, clearHist, probe, meta, micHealth, micTap }
}

function deviceLine() {
  const ua = String(globalThis.navigator?.userAgent ?? '')
  const os = /iPhone OS ([\d_]+)/.exec(ua)?.[1]?.replace(/_/g, '.')
  const w = globalThis.screen?.width, h = globalThis.screen?.height, dpr = globalThis.devicePixelRatio
  return `${os ? `iPhone iOS ${os}` : /Android/.test(ua) ? 'Android' : /Chrome/.test(ua) ? 'Chrome' : 'браузер'} ${w ?? '?'}×${h ?? '?'} @${dpr ?? 1}`
}
