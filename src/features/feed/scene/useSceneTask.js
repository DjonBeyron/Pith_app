import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../../../shared/lib/analytics/track.js'
import { trackDedup } from '../../../shared/lib/analytics/trackDedup.js'
import { SCENE_TASK_SHOWN, SCENE_TASK_ANSWER, SCENE_TASK_SKIP } from '../../../shared/lib/analytics/eventNames.js'
import { feedTaskOf, initialPlay, trackPlay, taskAllowed } from './sceneTaskPlay.js'
import { sceneTaskGate } from './sceneTaskLimits.js'
import { voiceTaskAvailable } from './sceneVoiceData.js'
import { useSceneVoiceWarm } from './useSceneVoiceWarm.js'
import * as ts from './sceneTaskState.js'
import * as vs from './sceneVoiceState.js'

export const TASK_COVER_OUT_MS = 500 // страховка размонтирования панели после ухода (transitionend — в SceneTaskCover)
const ACTIONS = ['press', 'backspace', 'check', 'giveUp', 'later', 'finish', 'replay', 'coverGone', 'voiceListen', 'voiceUnlisten', 'voiceResult', 'voiceSkip']

// Задание «О чём диалог» на слайде-сцене ленты (SlideScene.jsx). После ПЕРВОГО полного проигрывания диалога на активном
// слайде (детектор trackPlay по состояниям режиссёра — только границы реплик, без тиков) и если лимиты разрешают
// (sceneTaskLimits: 5/день, раз в 3 слайда, сцена раз в сутки, пауза «позже», принудительный показ админа) — панель
// открывается: состояние — чистые переходы sceneTaskState.js, здесь связка с React, аналитика и блокировка свайпа.
// Пока панель открыта: freeze=true → SceneRenderer получает paused → режиссёр авто-паузой встаёт (и сам продолжит, когда
// панель уйдёт — «loop продолжается как раньше»); сцена показывает последнюю реплику (goTo), «Послушать ещё раз» —
// playOnce целевой реплики. setState — только на границах: показ, клавиша, проверка, закрытие.
// onLock(mounted) — лента не свайпается, пока панель в DOM (как у «Ловли»).
// Голосовые виды ('say' / 'repeat', info.voice): тот же показ, лимиты, заморозка и закрытие; вместо клавиш — voiceListen / voiceUnlisten /
// voiceResult / voiceSkip (переходы — sceneVoiceState.js, микрофон ведёт SceneVoicePanel). Нет микрофона (Firefox, отказ) — тихий пропуск
// ДО лимитов; Vosk греется на последней реплике круга (useSceneVoiceWarm).
// → { info, open, mounted, freeze, state, onState, press, backspace, check, giveUp, later, finish, replay, coverGone, voice* }
export function useSceneTask({ scene, sceneId, active, live, apiRef, onLock, gate = sceneTaskGate() }) {
  const info = useMemo(() => feedTaskOf(scene), [scene])
  const [st, setSt] = useState(() => ts.initialTask(sceneId))
  // Лента подменила сцену в этой копии слайда — состояние с нуля; слайд ушёл с экрана — панель закрыта (сброс при рендере)
  if (st.sceneKey !== sceneId) setSt(ts.initialTask(sceneId))
  else if (!active && ts.isOpen(st)) setSt(ts.close(st))
  const s = st.sceneKey !== sceneId ? ts.initialTask(sceneId) : !active && ts.isOpen(st) ? ts.close(st) : st
  const update = fn => setSt(p => (p.sceneKey === sceneId ? fn(p) : p))

  const open = active && ts.isOpen(s)
  const latest = useRef({ info, active, live, sceneId, onLock })
  useEffect(() => { latest.current = { info, active, live, sceneId, onLock } })
  const warmVoice = useSceneVoiceWarm({ voice: !!info?.voice, active, live, open })

  // Детектор полного круга живёт, пока режиссёр жив; уход в static (live=false) — с нуля
  const playRef = useRef(initialPlay())
  useEffect(() => { if (!live) playRef.current = initialPlay() }, [live])
  const onState = useCallback(state => {
    const prev = playRef.current
    const next = trackPlay(prev, state)
    playRef.current = next
    const { info: i, active: a, live: l, sceneId: id } = latest.current
    if (next.sawLast && !prev.sawLast && i?.voice && a && l) warmVoice()
    if (!next.done || prev.done) return
    if (!taskAllowed({ info: i, active: a, live: l }) || (i.voice && !voiceTaskAvailable()) || !gate.claim(id)) return
    update(ts.open)
    trackDedup(SCENE_TASK_SHOWN, { scene_id: id, kind: i.task.kind }, id)
  }, [gate, warmVoice]) // eslint-disable-line react-hooks/exhaustive-deps

  // Панель открылась — сцена замирает на последней реплике (режиссёр уже на авто-паузе: эффекты ребёнка раньше наших)
  const total = scene?.timeline?.length ?? 0
  useEffect(() => { if (open && total) apiRef?.current?.goTo?.(total - 1) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Панель остаётся в DOM, пока доигрывает уход (coverGone по transitionend, таймер — страховка)
  const [closing, setClosing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) setClosing(true)
  }
  useEffect(() => {
    if (!closing) return undefined
    const t = setTimeout(() => setClosing(false), TASK_COVER_OUT_MS)
    return () => clearTimeout(t)
  }, [closing])
  const mounted = open || closing

  useEffect(() => { latest.current.onLock?.(mounted) }, [mounted])
  useEffect(() => () => latest.current.onLock?.(false), [])

  const kind = info?.task.kind ?? 'translate'
  const press = ch => update(p => ts.press(p, ch))
  const backspace = () => update(ts.backspace)
  function check() {
    if (!info || !ts.canCheck(s)) return
    const { state, result } = ts.check(s, info.task, info.line)
    setSt(state)
    if (result) track(SCENE_TASK_ANSWER, { scene_id: sceneId, kind, ok: result.ok, attempt: state.attempt, ms: Math.max(0, Date.now() - s.openedAt) })
  }
  function giveUp() {
    if (!info || s.phase === 'checked') return
    update(p => ts.giveUp(p, info.task, info.line))
    track(SCENE_TASK_SKIP, { scene_id: sceneId, kind })
  }
  function later() {
    if (!ts.isOpen(s)) return
    update(ts.close)
    gate.later(sceneId)
    track(SCENE_TASK_SKIP, { scene_id: sceneId, kind })
  }
  const finish = () => update(ts.close)
  const replay = () => { if (info) apiRef?.current?.playOnce?.(info.index) }
  // Голосовые виды: запись началась / прервана; итог попытки ({ ok, heard, spoke, quiet, engine }); «Не могу говорить» — пропуск без штрафа
  const voiceListen = () => update(vs.listen)
  const voiceUnlisten = () => update(vs.unlisten)
  function voiceResult(res) {
    if (!info) return
    const next = res.ok ? vs.pass(s, res) : vs.fail(s, res)
    if (next === s) return
    setSt(next)
    if (vs.countedAnswer(res, next)) track(SCENE_TASK_ANSWER, vs.voiceAnswerProps({ sceneId, kind, next, openedAt: s.openedAt, engine: res.engine }))
  }
  function voiceSkip() {
    if (!ts.isOpen(s)) return
    update(ts.close)
    track(SCENE_TASK_SKIP, { scene_id: sceneId, kind, reason: 'cant' })
  }
  const coverGone = () => setClosing(false)

  // Стабильные действия (пропсы мемо-панели не меняются на каждую клавишу)
  const all = { press, backspace, check, giveUp, later, finish, replay, coverGone, voiceListen, voiceUnlisten, voiceResult, voiceSkip }
  const fns = useRef(all)
  useEffect(() => { fns.current = all })
  const [stable] = useState(() => Object.fromEntries(ACTIONS.map(n => [n, (...args) => fns.current[n](...args)])))

  return { info, open, mounted, freeze: open, state: s, onState, ...stable }
}
