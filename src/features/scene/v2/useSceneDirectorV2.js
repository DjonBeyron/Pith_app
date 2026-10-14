import { useCallback, useEffect, useRef, useState } from 'react'
import { createDirector } from './directorCore.js'
import { makeScenePlayLine } from './scenePlayLine.js'
import { getSceneAudioElement } from './sceneAudioUnlock.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'

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

const IDLE = { index: 0, status: 'idle', run: 0, total: 0, line: null }

// rate — множитель скорости речи поверх voice.rate персонажа (скорость голоса
// урока, lessonVolume.js); читается на старте каждой реплики, сцену не пересоздаёт
export function useSceneDirectorV2(scene, { enabled = true, sound = true, active = true, paused = false, rate = 1, mouthEls, audioSrcOf = null } = {}) {
  const [state, setState] = useState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  const [mode, setMode] = useState('timer')
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const dirRef = useRef(null)
  const autoPausedRef = useRef(false)
  const optsRef = useRef({ sound, rate, mouthEls, audioSrcOf, lowPower: false })
  useEffect(() => { optsRef.current = { sound, rate, mouthEls, audioSrcOf, lowPower: isWeakDevice() } }, [sound, rate, mouthEls, audioSrcOf])

  // Смена сцены — состояние сбрасывается прямо в рендере (паттерн «подстроить
  // состояние под проп»), а не setState в эффекте
  const [prevScene, setPrevScene] = useState(scene)
  if (scene !== prevScene) {
    setPrevScene(scene)
    setState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  }

  useEffect(() => {
    if (!enabled || !scene) return undefined
    const player = makeScenePlayLine({
      scene, opts: () => optsRef.current, setMode,
      getMouthEl: who => optsRef.current.mouthEls?.current?.[who] ?? null,
    })
    const director = createDirector({
      timeline: scene.timeline ?? [],
      loop: !!scene.options?.loop,
      playLine: player.playLine,
      onChange: setState,
    })
    dirRef.current = director
    return () => { director.destroy(); player.stop(); dirRef.current = null }
  }, [scene, enabled])

  // «Без звука» переключили посреди реплики-файла — muted сразу, не с следующей
  useEffect(() => {
    if (!enabled || dirRef.current?.getState().status !== 'playing') return
    const a = getSceneAudioElement()
    if (a) { try { a.muted = !sound } catch { /* ignore */ } }
  }, [sound, enabled])

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
      if (d.getState().status === 'playing') { autoPausedRef.current = true; d.pause() }
    } else if (autoPausedRef.current) {
      autoPausedRef.current = false
      d.play()
    }
  }, [shouldPause])

  const call = useCallback((name, ...args) => {
    const d = dirRef.current
    if (!d) return
    if (name === 'pause') autoPausedRef.current = false
    if (shouldPause && (name === 'play' || name === 'toggle' || name === 'restart')) {
      // Нельзя играть, пока сцена неактивна: запомним желание и вернёмся сами
      autoPausedRef.current = true
      if (name === 'restart') d.goTo(0)
      return
    }
    d[name](...args)
  }, [shouldPause])

  return {
    ...state,
    mode,
    speakingWho: state.status === 'playing' && state.line ? state.line.who : null,
    play: useCallback(() => call('play'), [call]),
    pause: useCallback(() => call('pause'), [call]),
    toggle: useCallback(() => call('toggle'), [call]),
    restart: useCallback(() => call('restart'), [call]),
    goTo: useCallback(i => call('goTo', i), [call]),
    // Одна реплика и пауза на ней (не блокируется авто-паузой: задание ленты зовёт её, пока сцена заморожена)
    playOnce: useCallback(i => call('playOnce', i), [call]),
  }
}
