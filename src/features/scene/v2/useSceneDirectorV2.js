import { useCallback, useEffect, useRef, useState } from 'react'
import { createDirector } from './directorCore.js'
import { makeScenePlayLine } from './scenePlayLine.js'
import { forEachSceneAudio } from './sceneAudioUnlock.js'
import { resolveVoiceFlags } from './sceneOptions.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { sceneTrace } from './sceneTrace.js'

// Хук-режиссёр v2: оборачивает directorCore в состояние React и подключает
// воспроизведение реплик (scenePlayLine.js: файл audioUrl через общий HTMLAudio
// с ртом по wordTimings, иначе speechSynthesis/таймер с ртом по словам; рот —
// setAttribute на DOM-группе кота, без перерендера на тик).
// Состояние React меняется только на границах реплик (index/status/mode).
//
// mouthEls — ref { current: { a: <g>, b: <g> } } из SceneRenderer.
// enabled=false (режим static) — режиссёр не создаётся вовсе.
// !active / paused / document.hidden → авто-пауза с возвратом к игре, когда
// условие снято (пауза пользователя через pause() авто-возвратом не снимается).
// audioSrcOf(url) → подмена ссылки озвучки (blob прогрева урока) или null.
// voice — переопределение флагов озвучки { original?, translation? } поверх
// options.voice сцены (sceneOptions.js); phase — что звучит сейчас
// ('original' | 'translation' | null), меняется на границах шагов реплики.

const IDLE = { index: 0, status: 'idle', run: 0, total: 0, line: null }
export const ANCHOR_DRIFT_MS = 120

// rate — множитель скорости речи поверх voice.rate персонажа (скорость голоса
// урока, lessonVolume.js); читается на старте каждой реплики, сцену не пересоздаёт
export function useSceneDirectorV2(scene, {
  enabled = true, sound = true, active = true, paused = false, rate = 1, mouthEls, audioSrcOf = null, voice = null,
} = {}) {
  const [state, setState] = useState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  const [mode, setMode] = useState('timer')
  const [phase, setPhase] = useState(null)
  const [fail, setFail] = useState(null) // последний отказ файла { url, reason, kind, index } | null (sceneAudioFail.js)
  // Якорь: счётчик «файл оригинала реально зазвучал» + реальный остаток файла (мс, с учётом фактической скорости; null — неизвестен) —
  // доходит до индикатора прогресса через onState (SceneRenderer) как новое `at` и точная длительность реплики
  const [anchor, setAnchor] = useState({ seq: 0, ms: null })
  const anchorRef = useRef({ ms: null, at: 0 }) // последний якорь: чего индикатор ждёт от часов файла
  const anchorNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const setAnchorMs = (ms, why) => {
    anchorRef.current = { ms, at: anchorNow() }
    if (why) sceneTrace(`якорь: ${why}`)
    setAnchor(a => ({ seq: a.seq + 1, ms }))
  }
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const dirRef = useRef(null)
  const autoPausedRef = useRef(false)
  const optsRef = useRef({ sound, rate, mouthEls, audioSrcOf, voice, lowPower: false })
  useEffect(() => { optsRef.current = { sound, rate, mouthEls, audioSrcOf, voice, lowPower: isWeakDevice() } }, [sound, rate, mouthEls, audioSrcOf, voice])

  // Смена сцены — состояние сбрасывается прямо в рендере (паттерн «подстроить
  // состояние под проп»), а не setState в эффекте
  const [prevScene, setPrevScene] = useState(scene)
  if (scene !== prevScene) {
    setPrevScene(scene)
    setState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  }

  // Рендерер стал статичным (enabled=false: сцена доиграла и замёрзла в кадр) — режиссёр уничтожен, а
  // состояние осталось бы старым ('playing' на реплике N). Вернулся живым (кружок раскрыли «ещё раз»)
  // новый режиссёр стоит в idle, и без сброса интерфейс считал бы, что сцена идёт: ни звука, ни рта,
  // кольцо замирает. Сбрасываем в IDLE при выключении — включение даст честное idle → playing
  const [prevEnabled, setPrevEnabled] = useState(enabled)
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled)
    if (!enabled) { sceneTrace('режиссёр: рендерер стал статичным → состояние сброшено в idle'); setState({ ...IDLE, total: scene?.timeline?.length ?? 0 }); setMode('timer'); setPhase(null) }
  }

  useEffect(() => {
    if (!enabled || !scene) return undefined
    const player = makeScenePlayLine({
      scene, opts: () => optsRef.current, setMode, setPhase, onFallback: setFail, onStarted: (_i, ms) => setAnchorMs(Number.isFinite(ms) ? ms : null),
      // Часы файла разошлись с ожиданием больше ANCHOR_DRIFT_MS → новый якорь (иначе React не трогаем: timeupdate ≈ 4 Гц)
      onClock: (_i, ms) => {
        const a = anchorRef.current
        if (a.ms == null) return
        const expected = a.ms - (anchorNow() - a.at)
        if (Math.abs(ms - expected) > ANCHOR_DRIFT_MS) setAnchorMs(ms, `часы файла разошлись с кольцом на ${Math.round(ms - expected)} мс → перепривязка (остаток ${ms} мс)`)
      },
      getMouthEl: who => optsRef.current.mouthEls?.current?.[who] ?? null,
    })
    const director = createDirector({
      timeline: scene.timeline ?? [],
      loop: !!scene.options?.loop,
      playLine: player.playLine,
      onChange: setState,
    })
    dirRef.current = director
    sceneTrace(`режиссёр создан: ${scene.timeline?.length ?? 0} реплик, loop=${!!scene.options?.loop}`)
    return () => { sceneTrace(`режиссёр уничтожен (был ${director.getState().status} ${director.getState().index})`); director.destroy(); player.stop(); dirRef.current = null }
  }, [scene, enabled])

  // «Без звука» переключили посреди реплики-файла — muted сразу, не с следующей
  // (оригинал с выключенной озвучкой voice.original остаётся немым)
  useEffect(() => {
    if (!enabled || dirRef.current?.getState().status !== 'playing') return
    const silentOriginal = phase === 'original' && !resolveVoiceFlags(scene, voice).original
    forEachSceneAudio(a => { try { a.muted = !sound || silentOriginal } catch { /* ignore */ } })
  }, [sound, enabled, phase, scene, voice])

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const onVis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled])

  // Авто-пауза: вне экрана / скрыта вкладка / родитель попросил
  const shouldPause = !active || paused || hidden
  useEffect(() => {
    const d = dirRef.current
    if (!d) return
    if (shouldPause) {
      if (d.getState().status === 'playing') { sceneTrace(`режиссёр: авто-пауза (active=${active} paused=${paused} hidden=${hidden})`); autoPausedRef.current = true; d.pause() }
    } else if (autoPausedRef.current) {
      sceneTrace('режиссёр: условие паузы снято → играем дальше')
      autoPausedRef.current = false
      d.play()
    }
  }, [shouldPause, active, paused, hidden])

  const call = useCallback((name, ...args) => {
    const d = dirRef.current
    if (!d) return
    if (name === 'pause') autoPausedRef.current = false
    if (shouldPause && (name === 'play' || name === 'toggle' || name === 'restart')) {
      // Нельзя играть, пока сцена неактивна: запомним желание и вернёмся сами
      sceneTrace(`режиссёр: ${name} отложен — сцена неактивна (active=${active} paused=${paused} hidden=${hidden})`)
      autoPausedRef.current = true
      if (name === 'restart') d.goTo(0)
      if (name === 'play' && Number.isInteger(args[0])) d.goTo(args[0])
      return
    }
    d[name](...args)
  }, [shouldPause, active, paused, hidden])

  return {
    ...state,
    mode,
    anchor: anchor.seq, // растёт, когда файл реплики реально зазвучал (индикатор прогресса заново отсчитывает её длительность)
    anchorMs: anchor.ms, // реальный остаток файла в этот момент (мс) или null
    fail, // почему последняя реплика не заиграла файлом (null — заиграла или ещё не стартовала)
    phase: state.status === 'playing' ? phase : null,
    speakingWho: state.status === 'playing' && state.line ? state.line.who : null,
    // play(from?) — с реплики from (целое), иначе с текущей
    play: useCallback(from => call('play', from), [call]),
    pause: useCallback(() => call('pause'), [call]),
    toggle: useCallback(() => call('toggle'), [call]),
    restart: useCallback(() => call('restart'), [call]),
    goTo: useCallback(i => call('goTo', i), [call]),
    // Одна реплика и пауза на ней (не блокируется авто-паузой: задание ленты зовёт её, пока сцена заморожена)
    playOnce: useCallback(i => call('playOnce', i), [call]),
  }
}
