import { useCallback, useEffect, useRef, useState } from 'react'
import { createDirector } from './directorCore.js'
import { createMouthDriver, setMouth } from './mouthDriver.js'
import { speakFallback } from './linePlayback.js'
import { playLineAudio } from './audioLine.js'
import { getSceneAudioElement } from './sceneAudioUnlock.js'

// Хук-режиссёр v2: оборачивает directorCore в состояние React и подключает
// рот (mouthDriver → setAttribute на DOM-группе кота, без перерендера на тик)
// и озвучку (audioUrl → HTMLAudio с wordTimings; иначе speechSynthesis/таймер).
// Состояние React меняется только на границах реплик (index/status/mode).
//
// mouthEls — ref { current: { a: <g>, b: <g> } } из SceneRenderer.
// enabled=false (режим static) — режиссёр не создаётся вовсе.
// !active / paused / document.hidden → авто-пауза с возвратом к игре, когда
// условие снято (пауза пользователя через pause() авто-возвратом не снимается).

const IDLE = { index: 0, status: 'idle', run: 0, total: 0, line: null }

export function useSceneDirectorV2(scene, { enabled = true, sound = true, active = true, paused = false, mouthEls } = {}) {
  const [state, setState] = useState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  const [mode, setMode] = useState('timer')
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const dirRef = useRef(null)
  const autoPausedRef = useRef(false)
  const optsRef = useRef({ sound, mouthEls })
  useEffect(() => { optsRef.current = { sound, mouthEls } }, [sound, mouthEls])

  // Смена сцены — состояние сбрасывается прямо в рендере (паттерн «подстроить
  // состояние под проп»), а не setState в эффекте
  const [prevScene, setPrevScene] = useState(scene)
  if (scene !== prevScene) {
    setPrevScene(scene)
    setState({ ...IDLE, total: scene?.timeline?.length ?? 0 })
  }

  useEffect(() => {
    if (!enabled || !scene) return undefined
    let who = null
    const driver = createMouthDriver(shape => setMouth(optsRef.current.mouthEls?.current?.[who], shape))

    function playLine(line, index, { onEnd }) {
      who = line.who
      driver.start()
      const voice = scene.characters?.[line.who]?.voice
      const end = () => { driver.stop(); onEnd() }
      const cbs = { onWord: () => driver.onWord(), onEnd: end, onMode: setMode }
      let cancel
      if (line.audioUrl) {
        cancel = playLineAudio(line, getSceneAudioElement(), {
          ...cbs,
          onFail: () => { cancel = speakFallback(line.text, voice, { sound: optsRef.current.sound, ...cbs }) },
        })
      } else {
        cancel = speakFallback(line.text, voice, { sound: optsRef.current.sound, ...cbs })
      }
      return () => { cancel?.(); driver.stop() }
    }

    const director = createDirector({
      timeline: scene.timeline ?? [],
      loop: !!scene.options?.loop,
      playLine,
      onChange: setState,
    })
    dirRef.current = director
    return () => { director.destroy(); driver.stop(); dirRef.current = null }
  }, [scene, enabled])

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
  }
}
