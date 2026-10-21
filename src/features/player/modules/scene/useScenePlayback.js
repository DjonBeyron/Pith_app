import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerFrozen } from '../../playerFrozen.js'
import { useLessonMuted, useVoiceRate } from '../../lessonVolume.js'
import { unlockSceneAudio } from '../../../scene/v2/sceneAudioUnlock.js'
import { useSceneSolo, noteSceneGesture } from './useSceneSolo.js'
import { useSceneAutoStart } from './useSceneAutoStart.js'
import { fsOpenTransition, fsCloseTransition, inlineTapAction, expandAction, expandStatusOf, SCENE_EXPAND_PLAY_DELAY_MS } from './sceneFullscreenModel.js'
import { sceneTrace, nextSceneTag, ms } from '../../../scene/v2/sceneTrace.js'
import { SETTLE_MS } from '../../../scene/v2/sceneSettle.js'
import { END_MS } from './sceneProgressModel.js'

export const SCENE_DONE_DELAY_MS = END_MS + 20 // переход по графу после доезда кольца

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
// Трасса (sceneTrace.js, метка tag «#n» у каждой сцены ленты): переходы состояния с временем от прошлого, автозапуск и его
// звук, команды режиссёру (ждём рендерер / потеряна / ушла), раскрытие кружка (статус → действие), заморозка, жесты.

const IDLE = { status: 'idle', index: 0, total: 0, mode: 'timer', anchor: 0, anchorMs: null }
// anchor — «файл реально зазвучал» (useSceneDirectorV2): то же состояние с новым at, чтобы кольцо заново отсчитало длительность реплики
const same = (a, b) => a.status === b.status && a.index === b.index && a.total === b.total && a.mode === b.mode && a.run === b.run && (a.anchor ?? 0) === (b.anchor ?? 0)

// ready=false — сцена-шаблон ждёт слова пользователя: автозапуск и тапы отложены (сцена после старта не должна меняться)
export function useScenePlayback({ resolved, pending, isHistory, onDone, ready = true }) {
  const apiRef = useRef(null)
  const fsApiRef = useRef(null)
  const rootRef = useRef(null)
  const doneRef = useRef(false)
  const startedRef = useRef(false)
  const fsOpenRef = useRef(false)
  const fsStartRef = useRef(null)
  const expandTimer = useRef(null)
  const stRef = useRef(IDLE)
  const [tag] = useState(nextSceneTag) // метка сцены в трассе («#n»), одна на весь срок жизни ноды
  const trace = useCallback(m => sceneTrace(`${tag} ${m}`), [tag])
  const [st, setSt] = useState(IDLE)
  const [fsOpen, setFsOpen] = useState(false)
  // Защёлка «доиграла»: после конца рамка ленты замирает в статичный кадр (SceneBody.jsx) и
  // не оживает, даже когда полноэкранный режиссёр снова играет (состояние берётся у него)
  const [ended, setEnded] = useState(false)
  if (st.status === 'ended' && !ended) setEnded(true)
  // Заморозка кадра (live → static в SceneBody) — не в момент конца, а когда поза кота успокоилась (SceneRenderer + sceneSettle.js):
  // иначе статичный кадр с нейтральной позой вставал скачком. Кружок к этому времени как раз сворачивается
  const [frameFrozen, setFrameFrozen] = useState(false)
  useEffect(() => {
    if (!ended || frameFrozen) return undefined
    const t = setTimeout(() => { trace('кадр: поза успокоилась → можно замораживать (static)'); setFrameFrozen(true) }, SETTLE_MS + 60)
    return () => clearTimeout(t)
  }, [ended, frameFrozen, trace])
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [cmd, setCmd] = useState(null) // команда режиссёру отложенным эффектом (см. ниже)
  const frozen = usePlayerFrozen()
  const muted = useLessonMuted()
  const rate = useVoiceRate()
  const hasScene = !!resolved.scene && ready
  const { start, startDelayMs } = resolved

  const apply = useCallback(next => {
    // at — когда состояние дошло: от него считает время индикатор прогресса (useSceneProgress.js)
    const prev = stRef.current
    const raw = { mode: 'timer', anchor: 0, anchorMs: null, at: performance.now(), ...next }
    const onlyAnchor = same(prev, { ...raw, anchor: prev.anchor ?? 0 })
    // Остаток файла (anchorMs) относится к реплике, на которой пришёл якорь: на новой реплике до её якоря — оценка, а не чужой остаток
    const full = onlyAnchor ? raw : { ...raw, anchorMs: null }
    if (!same(prev, full)) {
      trace(onlyAnchor ? `якорь: файл реплики ${full.index + 1} зазвучал через ${ms(full.at - (prev.at ?? full.at))} после старта — кольцо отсчитывает заново${full.anchorMs != null ? ` по реальному остатку ${full.anchorMs} мс` : ''}`
        : `состояние: ${full.status} ${full.index + 1}/${full.total} ${full.mode} run=${full.run ?? 0} (${prev.status} ${prev.index + 1} было ${ms(full.at - (prev.at ?? full.at))})`)
    }
    stRef.current = full
    setSt(prev => (same(prev, full) ? prev : full))
  }, [trace])
  // Состояние берём только у живого сейчас рендерера: лента — пока экран закрыт, экран — пока открыт
  const onState = useCallback(next => { if (!fsOpenRef.current) apply(next) }, [apply])
  const onFsState = useCallback(next => { if (fsOpenRef.current) apply(next) }, [apply])

  // Конец сцены → переход по графу (один раз). Не в ту же миллисекунду, а когда кольцо доехало до полного (END_MS): переход тянет
  // за собой следующую ноду, «печатает» и сдвиг ленты — на iPhone эта работа главного потока попадала ровно на последние проценты
  // кольца и выглядела как «кольцо втыкается в конце»
  useEffect(() => {
    if (st.status !== 'ended' || doneRef.current) return undefined
    doneRef.current = true
    const t = setTimeout(() => { trace('доиграла → onDone(played)'); onDone?.('played') }, SCENE_DONE_DELAY_MS)
    return () => clearTimeout(t)
  }, [st.status, onDone, trace])

  // Автозапуск: после анимации появления + задержка ноды — useSceneAutoStart.js (план — sceneStartPlan.js)
  // Не api.play() сразу: режиссёр читает sound из пропсов рендерера, и флаг должен дойти до него до старта реплики — команда уходит эффектом ниже
  const onAutoPlay = useCallback(withSound => { setSoundBlocked(!withSound); setCmd({ type: 'play' }) }, [])
  useSceneAutoStart({ start, startDelayMs, isHistory, pending, hasScene, rootRef, startedRef, trace, onPlay: onAutoPlay })

  const activeApi = useCallback(() => (fsOpenRef.current ? fsApiRef.current : apiRef.current), [])
  // Команды режиссёру после того, как новое значение sound дошло до рендерера (эффекты
  // детей идут раньше родительского): play — автозапуск, replay — та же реплика со звуком
  useEffect(() => {
    if (!cmd) return undefined
    // Живой рендерер доигравшей сцены монтируется после роста кружка (SceneCircleView, useSceneCircleExpand.grown) — если
    // команда пришла раньше, чем он поставил apiRef, ждём его (до ~0,5 с), а не теряем пуск
    if (!apiRef.current && cmd.type !== 'replay' && (cmd.tries ?? 0) < 10) {
      if (!cmd.tries) trace(`команда ${cmd.type}: живого рендерера ещё нет — ждём до 0,5 с`)
      const t = setTimeout(() => setCmd({ ...cmd, tries: (cmd.tries ?? 0) + 1 }), 50)
      return () => clearTimeout(t)
    }
    const api = cmd.type === 'replay' ? activeApi() : apiRef.current
    if (!api) { trace(`команда ${cmd.type} ПОТЕРЯНА: рендерер так и не появился${cmd.tries ? ` за ${cmd.tries * 50} мс` : ''}`); return undefined }
    trace(`команда ${cmd.type} → режиссёр${cmd.tries ? ` (ждали ${cmd.tries * 50} мс)` : ''} (статус ${stRef.current.status})`)
    if (cmd.type === 'play') api.play()
    if (cmd.type === 'restart') api.restart()
    if (cmd.type === 'replay' && stRef.current.status === 'playing') api.goTo(stRef.current.index)
    return undefined
  }, [cmd, activeApi, trace])

  const pause = useCallback(() => activeApi()?.pause(), [activeApi])
  useSceneSolo(rootRef, st.status === 'playing', pause)

  // Кружок доигравшей сцены свернули посреди повтора → он замирает в статичный кадр без режиссёра. Состояние
  // фиксируем как «ended»: иначе 'playing' остался бы навсегда (кольцо едет, звук-чип, подписка solo)
  const freeze = useCallback(() => {
    const s = stRef.current
    if (s.status !== 'ended') { trace(`кружок свернули посреди повтора (${s.status} ${s.index + 1}) → фиксируем ended`); apply({ status: 'ended', index: s.index, total: s.total, run: s.run }) }
  }, [apply, trace])

  // Любой жест пользователя по сцене: звук разрешён, автозапуск больше не нужен
  const gesture = useCallback(() => {
    noteSceneGesture()
    unlockSceneAudio()
    startedRef.current = true
    setSoundBlocked(false)
  }, [])

  const startInPlace = useCallback(e => {
    e?.stopPropagation?.()
    if (!ready) return
    gesture()
    apiRef.current?.play()
  }, [gesture, ready])

  const openFs = useCallback(e => {
    e?.stopPropagation?.()
    if (fsOpenRef.current || !ready) return
    gesture()
    fsStartRef.current = fsOpenTransition(stRef.current)
    trace(`полный экран: открыть с реплики ${fsStartRef.current.index}`)
    apiRef.current?.pause()
    fsOpenRef.current = true
    setFsOpen(true)
  }, [gesture, ready, trace])

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
    trace(`полный экран: закрыть → лента с реплики ${tr.index}, ${tr.resume ? 'играет' : 'пауза'}`)
    fsApiRef.current?.pause()
    fsOpenRef.current = false
    setFsOpen(false)
    const api = apiRef.current
    if (!api) return
    if (tr.resume) api.play(tr.index)
    else api.goTo(tr.index)
  }, [trace])

  // Раскрытие кружка (useSceneCircleExpand.js) — жест: звук открыт; до старта/на паузе — пуск, после конца —
  // с начала (рамка ленты в этот момент оживает, см. SceneCircleView), играла без звука — реплика заново со звуком
  const expandPlay = useCallback(() => {
    if (!ready) { trace('раскрытие: сцена ещё не готова (слова пользователя) — ничего'); return }
    // Доигравшая сцена в свёрнутом кружке — статичный кадр без режиссёра: статус в stRef может быть любым
    // (свернули посреди повтора → 'playing'/'paused'), для запуска она — всегда «ended» (с начала)
    const action = expandAction(expandStatusOf(stRef.current.status, ended), soundBlocked)
    trace(`раскрытие: статус=${stRef.current.status} ended=${ended} soundBlocked=${soundBlocked} → ${action ? `${action} через ${SCENE_EXPAND_PLAY_DELAY_MS} мс` : 'без команды (играет со звуком)'}`)
    gesture() // звук открывается СРАЗУ (жест), а тяжёлый пуск режиссёра — после роста кружка (см. ниже)
    if (!action) return
    // Пуск не в первом кадре: старт режиссёра (рендер облачка, аудио, таймеры) на слабом телефоне занимает основной поток на
    // ~100+ мс ровно в начале transform-анимации — кружок и сдвиг истории стояли и затем «прыгали» (замер 4×: 3 long task по
    // 130 мс, 5 кадров вместо 16). Как у видео-кружка (play через 260 мс) — ждём конец анимации
    if (expandTimer.current) clearTimeout(expandTimer.current)
    expandTimer.current = setTimeout(() => { expandTimer.current = null; setCmd({ type: action }) }, SCENE_EXPAND_PLAY_DELAY_MS)
  }, [gesture, soundBlocked, ready, ended, trace])
  useEffect(() => () => { if (expandTimer.current) clearTimeout(expandTimer.current) }, [])

  const handleTap = useCallback(e => {
    e?.stopPropagation?.()
    if (inlineTapAction(stRef.current.status) === 'start') startInPlace()
    else openFs()
  }, [startInPlace, openFs])

  // Чип «Включить звук»: жест → звук, текущая реплика с начала уже со звуком
  const enableSound = useCallback(e => {
    e?.stopPropagation?.()
    trace('чип «Включить звук» → реплика заново со звуком')
    gesture()
    setCmd({ type: 'replay' })
  }, [gesture, trace])

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
    playing: st.status === 'playing', ended, frameFrozen,
    soundChip: soundBlocked && !muted && st.status === 'playing' && !fsOpen,
    manualIdle: start === 'manual' && st.status === 'idle',
    handleTap, expandPlay, freeze, startInPlace, enableSound, togglePause,
    fsOpen, openFs, closeFs, trace, tag, soundBlocked,
  }
}
