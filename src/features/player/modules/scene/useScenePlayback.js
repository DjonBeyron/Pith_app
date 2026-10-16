import { useCallback, useEffect, useRef, useState } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { usePlayerFrozen } from '../../playerFrozen.js'
import { useLessonMuted, useVoiceRate } from '../../lessonVolume.js'
import { unlockSceneAudio } from '../../../scene/v2/sceneAudioUnlock.js'
import { useSceneSolo } from './useSceneSolo.js'
import {
  startDecision, waitRowAppear, scheduleSceneStart, autoStartSound, pageHasBeenActive,
} from './sceneStartPlan.js'
import { fsOpenTransition, fsCloseTransition, inlineTapAction, expandAction } from './sceneFullscreenModel.js'

// Поведение живой сцены в ленте урока (общее для пузыря и кружка):
//  · старт (sceneStartPlan.js): 'auto' — после конца анимации появления
//    сообщения + startDelayMs ноды (не история, не pending, не в скрытой
//    вкладке); 'manual' — стоит с ▶, пока не тапнут;
//  · звук автозапуска — по политике автоплея: без жеста на странице сцена
//    идёт без звука (облачки, рты по таймингам) и показывает чип «Включить
//    звук» (soundChip); жест (чип, тап, полный экран) открывает звук
//    (sceneAudioUnlock.js) и переигрывает текущую реплику уже со звуком;
//  · тап по сцене-пузырю: до старта — пуск на месте, иначе — на весь экран
//    (sceneFullscreenModel.js, как у видео); тап по кружку — он увеличивается как видео-кружок
//    (useSceneCircleExpand.js, expandPlay ниже), полного экрана у кружка нет; экран — свой SceneRenderer,
//    реплика переносится через состояние (fsApiRef / onFsState), в ленте
//    режиссёр стоит на паузе — звучит всегда один;
//  · заморозка шагового режима админа → paused у рендереров;
//  · «без звука»/скорость голоса из шапки урока (lessonVolume.js);
//  · одна медиа-нода звучит разом (useSceneSolo.js);
//  · доиграла последняя реплика (в ленте или на экране) → onDone('played') один раз.
// Состояние React меняется только на границах реплик (onState рендерера).

const IDLE = { status: 'idle', index: 0, total: 0, mode: 'timer' }
const same = (a, b) => a.status === b.status && a.index === b.index && a.total === b.total && a.mode === b.mode && a.run === b.run

export function useScenePlayback({ resolved, pending, isHistory, onDone }) {
  const apiRef = useRef(null)
  const fsApiRef = useRef(null)
  const rootRef = useRef(null)
  const doneRef = useRef(false)
  const startedRef = useRef(false)
  const fsOpenRef = useRef(false)
  const fsStartRef = useRef(null)
  const stRef = useRef(IDLE)
  const [st, setSt] = useState(IDLE)
  const [fsOpen, setFsOpen] = useState(false)
  // Защёлка «доиграла»: после конца рамка ленты замирает в статичный кадр (SceneBody.jsx) и
  // не оживает, даже когда полноэкранный режиссёр снова играет (состояние берётся у него)
  const [ended, setEnded] = useState(false)
  if (st.status === 'ended' && !ended) setEnded(true)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [cmd, setCmd] = useState(null) // команда режиссёру отложенным эффектом (см. ниже)
  const frozen = usePlayerFrozen()
  const muted = useLessonMuted()
  const rate = useVoiceRate()
  const hasScene = !!resolved.scene
  const { start, startDelayMs } = resolved

  const apply = useCallback(next => {
    // at — когда состояние дошло: от него считает время индикатор прогресса (useSceneProgress.js)
    const full = { mode: 'timer', at: performance.now(), ...next }
    stRef.current = full
    setSt(prev => (same(prev, full) ? prev : full))
  }, [])
  // Состояние берём только у живого сейчас рендерера: лента — пока экран закрыт, экран — пока открыт
  const onState = useCallback(next => { if (!fsOpenRef.current) apply(next) }, [apply])
  const onFsState = useCallback(next => { if (fsOpenRef.current) apply(next) }, [apply])

  // Конец сцены → переход по графу (один раз)
  useEffect(() => {
    if (st.status !== 'ended' || doneRef.current) return
    doneRef.current = true
    pLog('[scene] доиграла → onDone(played)')
    onDone?.('played')
  }, [st.status, onDone])

  // Автозапуск: после анимации появления + задержка ноды (sceneStartPlan.js)
  useEffect(() => {
    if (startDecision({ start, isHistory, pending, hasScene }) !== 'arm' || startedRef.current) return undefined
    const wait = waitRowAppear(rootRef.current, { onResolved: how => pLog(`[scene] появление: ${how}`) })
    return scheduleSceneStart({
      waitAppear: wait, delayMs: startDelayMs, log: m => pLog(`[scene] автозапуск: ${m}`),
      play: () => {
        if (startedRef.current) return
        startedRef.current = true
        const withSound = autoStartSound({ hasBeenActive: pageHasBeenActive() })
        pLog(`[scene] автозапуск play() sound=${withSound}`)
        // Не api.play() сразу: режиссёр читает sound из пропсов рендерера, и флаг
        // должен дойти до него до старта реплики — команда уходит эффектом ниже
        setSoundBlocked(!withSound)
        setCmd({ type: 'play' })
      },
    })
  }, [start, startDelayMs, isHistory, pending, hasScene])

  const activeApi = useCallback(() => (fsOpenRef.current ? fsApiRef.current : apiRef.current), [])
  // Команды режиссёру после того, как новое значение sound дошло до рендерера (эффекты
  // детей идут раньше родительского): play — автозапуск, replay — та же реплика со звуком
  useEffect(() => {
    if (!cmd) return
    if (cmd.type === 'play') apiRef.current?.play()
    if (cmd.type === 'restart') apiRef.current?.restart()
    if (cmd.type === 'replay' && stRef.current.status === 'playing') activeApi()?.goTo(stRef.current.index)
  }, [cmd, activeApi])

  const pause = useCallback(() => activeApi()?.pause(), [activeApi])
  useSceneSolo(rootRef, st.status === 'playing', pause)

  // Любой жест пользователя по сцене: звук разрешён, автозапуск больше не нужен
  const gesture = useCallback(() => {
    unlockSceneAudio()
    startedRef.current = true
    setSoundBlocked(false)
  }, [])

  const startInPlace = useCallback(e => {
    e?.stopPropagation?.()
    gesture()
    apiRef.current?.play()
  }, [gesture])

  const openFs = useCallback(e => {
    e?.stopPropagation?.()
    if (fsOpenRef.current) return
    gesture()
    fsStartRef.current = fsOpenTransition(stRef.current)
    pLog(`[scene] полный экран: открыть с реплики ${fsStartRef.current.index}`)
    apiRef.current?.pause()
    fsOpenRef.current = true
    setFsOpen(true)
  }, [gesture])

  // Экран смонтирован (fsApiRef заполнил его SceneRenderer) → та же реплика, play
  useEffect(() => {
    if (!fsOpen) return
    const tr = fsStartRef.current
    const api = fsApiRef.current
    if (!api || !tr) return
    api.goTo(tr.index)
    if (tr.play) api.play()
  }, [fsOpen])

  const closeFs = useCallback(() => {
    if (!fsOpenRef.current) return
    const tr = fsCloseTransition(stRef.current)
    pLog(`[scene] полный экран: закрыть → лента с реплики ${tr.index}, ${tr.resume ? 'играет' : 'пауза'}`)
    fsApiRef.current?.pause()
    fsOpenRef.current = false
    setFsOpen(false)
    const api = apiRef.current
    if (!api) return
    if (tr.resume) api.play(tr.index)
    else api.goTo(tr.index)
  }, [])

  // Раскрытие кружка (useSceneCircleExpand.js) — жест: звук открыт; до старта/на паузе — пуск, после конца —
  // с начала (рамка ленты в этот момент оживает, см. SceneCircleView), играла без звука — реплика заново со звуком
  const expandPlay = useCallback(() => {
    const action = expandAction(stRef.current.status, soundBlocked)
    gesture()
    if (action) setCmd({ type: action })
  }, [gesture, soundBlocked])

  const handleTap = useCallback(e => {
    e?.stopPropagation?.()
    if (inlineTapAction(stRef.current.status) === 'start') startInPlace()
    else openFs()
  }, [startInPlace, openFs])

  // Чип «Включить звук»: жест → звук, текущая реплика с начала уже со звуком
  const enableSound = useCallback(e => {
    e?.stopPropagation?.()
    gesture()
    setCmd({ type: 'replay' })
  }, [gesture])

  const togglePause = useCallback(e => {
    e?.stopPropagation?.()
    const api = activeApi()
    if (!api) return
    if (stRef.current.status === 'ended') api.restart()
    else api.toggle()
  }, [activeApi])

  return {
    apiRef, fsApiRef, rootRef, onState, onFsState, state: st,
    paused: frozen, sound: !muted && !soundBlocked, muted, rate,
    playing: st.status === 'playing', ended,
    soundChip: soundBlocked && !muted && st.status === 'playing' && !fsOpen,
    manualIdle: start === 'manual' && st.status === 'idle',
    handleTap, expandPlay, startInPlace, enableSound, togglePause,
    fsOpen, openFs, closeFs,
  }
}
