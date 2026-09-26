/* eslint-disable react-hooks/refs */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { appendVisit, forgetNodeKeys } from './graphPlayerVisits.js'
import { useGraphStepControls } from './useGraphStepControls.js'
import { pLog } from '../../shared/lib/debug.js'

// How long "teacher is typing" dots show before a new node appears
const TYPING_DELAY_MS = 1400
// Реакция (эмодзи) не открывает новое сообщение — она прилипает к уже
// показанному пузырю. Полный TYPING_DELAY_MS перед ней выглядит как
// самостоятельный цикл «печатает», хотя на экране пока ничего не появляется:
// студент видит два «печатает» подряд там, где реально появляется только
// одно новое сообщение (следующее ЗА реакцией). См. scheduleReveal ниже.
const REACTION_DELAY_MS = 350

// Start from seq=1; fallback to lowest seq if seq=1 not found.
// startNodeId — админский прогон с середины сценария («играть отсюда»).
function findEntry(nodes, startNodeId) {
  return (
    (startNodeId ? nodes.find(n => n.id === startNodeId) : null) ??
    nodes.find(n => n.seq === 1) ??
    nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0] ??
    null
  )
}

// Чекпойнт «Продолжить урок» (useLessonResume.js): сколько РАЗНЫХ нод нужно
// пройти, прежде чем предлагать резюм при следующем входе — меньше не имеет
// смысла, разница со стартом с нуля незаметна
const CHECKPOINT_THRESHOLD = 6

// Восстановление истории при «Продолжить урок» (historyIds ниже) — не всю
// сразу: у длинного урока это могут быть сотни нод разом в DOM. Изначально
// показываем только «хвост» — столько, сколько обычно видно на экране без
// скролла — остальное подгружается по requestMoreHistory (кнопка/скролл
// вверх в LessonPlayer.jsx)
const HISTORY_PAGE = 8

// paused — шаговый режим админа (правка из канваса): переходы замирают.
// Запланированный переход не теряется: он запоминается и отыгрывается, когда
// паузу снимут или нажмут «вперёд».
// historyIds — id нод, показанных ДО startNodeId в прошлой сессии
// (useLessonResume.js/checkpoint) — восстанавливаются в ленту как read-only
// история (node.isHistory=true), без повторного запуска их триггеров/XP.
export function useGraphPlayer(nodes, { onFinish, onCheckpoint, startNodeId = null, historyIds = null, paused = false } = {}) {
  const [visibleNodes, setVisibleNodes] = useState([])
  const [pendingNode,  setPendingNode]  = useState(null)
  const [isWaiting,   setIsWaiting]   = useState(false)
  const [historyShown, setHistoryShown] = useState(0)

  const nodeMapRef  = useRef({})
  // Сколько раз каждая нода уже показывалась. Сценарий бывает цикличным
  // («ошибся — подсказка — снова тот же вопрос»), и номер показа нужен, чтобы
  // панель ответа пересобралась заново, а не осталась в состоянии «отвечено»
  const visitsRef   = useRef(new Map())
  const visibleRef  = useRef([])
  const firedRef    = useRef(new Set())
  const timersRef   = useRef([])
  const finishedRef = useRef(false) // финал урока срабатывает ровно один раз
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const onCheckpointRef = useRef(onCheckpoint)
  onCheckpointRef.current = onCheckpoint
  // Разные ноды, показанные хоть раз за эту сессию плеера — для порога чекпойнта
  const seenIdsRef = useRef(new Set())
  // Порядок показа по id — то, что уходит в чекпойнт целиком (история ДО
  // резюма + всё показанное в этой живой сессии), см. revealNode ниже
  const visitedIdsRef = useRef([])
  // Полный список восстановленных исторических нод (объекты, старые→новые) —
  // из него requestMoreHistory достаёт следующую пачку «показать раньше»
  const historyRef = useRef([])

  nodeMapRef.current = Object.fromEntries(nodes.map(n => [n.id, n]))
  visibleRef.current = visibleNodes

  function addTimer(fn, ms) {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }

  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const scheduleReveal = useRef(null)
  const scheduleAfter  = useRef(null)
  const activateTimerTrigger = useRef(null)
  // Что сейчас запланировано (тикает таймер) либо отложено паузой. Ровно одно
  // действие за раз — цепочка линейна: либо ждём показа следующей ноды, либо
  // тикает таймер-триггер текущей
  const scheduledRef = useRef(null)
  // Сколько миллисекунд осталось «докрутить» запланированному действию, если
  // время двигают руками (дебаг-тулбар, stepTime в useGraphStepControls.js). На обычной паузе
  // таймеры убиты, и без этого счётчика «печатает…» висело бы вечно
  const pendingMsRef = useRef(0)
  const pausedRef = useRef(paused)

  function revealNode(next) {
    scheduledRef.current = null
    setPendingNode(null)
    const visit = (visitsRef.current.get(next.id) ?? 0) + 1
    visitsRef.current.set(next.id, visit)
    // Возврат на уже показанную ноду и сброс её сработавших триггеров —
    // graphPlayerVisits.js
    setVisibleNodes(prev => appendVisit(prev, next, visit))
    setIsWaiting(false)
    firedRef.current = forgetNodeKeys(firedRef.current, next.id)
    activateTimerTrigger.current(next)
    seenIdsRef.current.add(next.id)
    // Тот же приём, что у appendVisit: повторный показ не дублирует id в
    // истории, а сдвигает его в конец — чекпойнт отражает реальный порядок
    visitedIdsRef.current = [...visitedIdsRef.current.filter(id => id !== next.id), next.id]
    if (seenIdsRef.current.size >= CHECKPOINT_THRESHOLD) onCheckpointRef.current?.(next.id, visitedIdsRef.current)
  }

  // force — шаг «вперёд» админа: показать не дожидаясь «печатает…» и не
  // спрашивая паузу
  scheduleReveal.current = (nextNodeId, force = false) => {
    const next = nodeMapRef.current[nextNodeId]
    // Переход ведёт на ноду, которой в уроке нет — сценарий на этом встаёт.
    // Молча выходить нельзя: со стороны это выглядит как «плеер завис»
    if (!next) {
      pLog(`[graph] ⚠ переход в никуда: нет ноды ${String(nextNodeId).slice(0, 8)} — сценарий остановился`)
      return
    }
    if (pausedRef.current && !force) {
      scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
      pendingMsRef.current = TYPING_DELAY_MS
      return
    }
    setPendingNode(next)   // pre-render node off-screen so video can decode
    // Реакция — без индикатора «печатает…» и с короткой паузой вместо полной
    // задержки набора текста (см. REACTION_DELAY_MS выше)
    const isReaction = next.type === 'reaction'
    const delay = isReaction ? REACTION_DELAY_MS : TYPING_DELAY_MS
    setIsWaiting(!isReaction)
    if (force) { revealNode(next); return }
    scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
    pendingMsRef.current = delay
    addTimer(() => revealNode(next), delay)
  }

  // Переход с задержкой: пауза после конца медиа (offsetMs) и «таймер после
  // показа». Помечаем его запланированным ДО таймера — иначе пауза, пришедшая
  // в эти миллисекунды, убила бы таймер вместе с переходом, и цепочка встала
  // бы навсегда: повторного «доиграло» от модуля уже не будет
  scheduleAfter.current = (ms, nextNodeId) => {
    scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
    pendingMsRef.current = ms
    if (pausedRef.current) return
    addTimer(() => {
      scheduledRef.current = null
      scheduleReveal.current(nextNodeId)
    }, ms)
  }

  activateTimerTrigger.current = (node, force = false) => {
    const t = (node.triggers ?? []).find(tr => tr.if === 'timer' && tr.then)
    if (!t) return
    const key = `${node.id}:timer`
    pendingMsRef.current = t.ms ?? 3000
    if (pausedRef.current && !force) {
      scheduledRef.current = { type: 'timer', nodeId: node.id }
      return
    }
    scheduledRef.current = { type: 'timer', nodeId: node.id }
    addTimer(() => {
      scheduledRef.current = null
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      scheduleReveal.current(t.then)
    }, t.ms ?? 3000)
  }

  // Пауза: останавливаем тикающие таймеры, но помним, что было запланировано
  // (scheduledRef). Снятие паузы — запускаем это заново с начала: доигрывать
  // остаток миллисекунд ради отладочного режима не стоит усложнения
  useEffect(() => {
    pausedRef.current = paused
    if (paused) { clearTimers(); return }
    const planned = scheduledRef.current
    if (!planned) return
    scheduledRef.current = null
    if (planned.type === 'reveal') scheduleReveal.current(planned.nodeId)
    else {
      const n = nodeMapRef.current[planned.nodeId]
      if (n) activateTimerTrigger.current(n)
    }
  }, [paused])

  // force — шаг «вперёд»: переход отыгрывается сразу, даже если стоит пауза
  const onNodeDone = useCallback((nodeId, result = null, variantId = null, force = false) => {
    const node = nodeMapRef.current[nodeId]
    if (!node) return
    const triggers = node.triggers ?? []

    // Особый переход конкретного варианта ответа (nodeVariants.js) — если
    // задан, замещает собой обычный верно/неверно именно для этого варианта
    if (variantId) {
      const vt = triggers.find(tr => tr.if === variantId && tr.then)
      if (vt) {
        const key = `${nodeId}:${variantId}`
        if (firedRef.current.has(key)) return
        firedRef.current.add(key)
        scheduleReveal.current(vt.then, force)
        return
      }
    }

    if (result) {
      const t = triggers.find(tr => tr.if === result && tr.then)
      if (t) {
        const key = `${nodeId}:${result}`
        if (firedRef.current.has(key)) return
        firedRef.current.add(key)
        scheduleReveal.current(t.then, force)
        return
      }
    }

    for (const ev of ['played', 'photo_shown']) {
      const t = triggers.find(tr => tr.if === ev && tr.then)
      if (!t) continue
      const key = `${nodeId}:${ev}`
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      // Положительный офсет played = пауза после конца медиа. Отрицательный
      // отрабатывает сам модуль (usePlayedOffset) — сюда приходит уже раньше
      // времени, добавлять нечего.
      const offset = ev === 'played' && t.offsetOn ? (t.offsetMs ?? 0) : 0
      if (offset > 0 && !force) scheduleAfter.current(offset, t.then)
      else scheduleReveal.current(t.then, force)
      return
    }

    const tap = triggers.find(tr => tr.if === 'timer_after_play' && tr.then)
    if (tap) {
      const key = `${nodeId}:timer_after_play`
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      if (force) scheduleReveal.current(tap.then, true)
      else scheduleAfter.current(tap.ms ?? 3000, tap.then)
      return
    }

    // Таймер-переход продолжит цепочку сам (activateTimerTrigger) — это не финиш
    if (triggers.some(tr => tr.if === 'timer' && tr.then)) return

    // Nothing left to schedule — lesson is finished (ровно один раз)
    if (finishedRef.current) return
    finishedRef.current = true
    onFinishRef.current?.()
  }, [])  

  // Пошаговое управление (админ, дебаг): «показать сейчас», «сдвинуть время»,
  // «шаг назад» — useGraphStepControls.js
  const { revealNow, stepTime, stepBack } = useGraphStepControls({
    scheduledRef, nodeMapRef, firedRef, scheduleReveal, pendingMsRef, visibleRef, finishedRef,
    clearTimers, revealNode, setPendingNode, setIsWaiting, setVisibleNodes,
  })

  const nodesKey = nodes.map(n => n.id).join(',')
  // useLayoutEffect, а НЕ useEffect: заполнение visibleNodes (особенно при
  // «Продолжить урок» — сразу 8+ исторических строк) должно случиться ДО
  // того, как браузер покажет кадр — иначе первый кадр рисуется с пустой
  // лентой (visibleNodes всё ещё [] от useState), и через мгновение она
  // разом заполняется — тот самый «скачок» с пустого на полное
  useLayoutEffect(() => {
    if (!nodes.length) {
      setVisibleNodes([])
      setPendingNode(null)
      setIsWaiting(false)
      clearTimers()
      return
    }
    clearTimers()
    firedRef.current = new Set()
    visitsRef.current = new Map()
    seenIdsRef.current = new Set()
    finishedRef.current = false
    const entry = findEntry(nodes, startNodeId)
    const ids = new Set(nodes.map(n => n.id))
    const broken = nodes.reduce((sum, n) =>
      sum + (n.triggers ?? []).filter(t => t.then && !ids.has(t.then)).length, 0)
    pLog(`[graph] старт: ${nodes.length} нод, вход #${entry?.seq ?? '—'}` +
      (broken ? `, СВЯЗЕЙ В НИКУДА: ${broken}` : ''))
    if (!entry) return
    // Восстановление истории при «Продолжить урок» (historyIds —
    // useLessonResume.js/resume): id нод из прошлой сессии, показанных ДО
    // точки входа. Сама entry сюда не входит — заводится ниже как живая
    // нода, как и при обычном старте. Изначально в ленту попадает только
    // «хвост» (HISTORY_PAGE) — requestMoreHistory подгружает остальное
    const historyNodes = (historyIds ?? []).map(id => nodeMapRef.current[id]).filter(Boolean)
    historyRef.current = historyNodes
    const initialPage = historyNodes.slice(-HISTORY_PAGE).map(n => ({ ...n, isHistory: true }))
    setHistoryShown(initialPage.length)
    if (startNodeId && entry.seq > 1) {
      pLog(`[graph] возобновление: лента стартует с #${entry.seq}, восстановлено истории ${historyNodes.length}/${(historyIds ?? []).length} нод (показано сразу ${initialPage.length})`)
    }
    visitedIdsRef.current = [...historyNodes.map(n => n.id), entry.id]
    setVisibleNodes([...initialPage, entry])
    seenIdsRef.current = new Set(visitedIdsRef.current)
    setIsWaiting(false)
    activateTimerTrigger.current(entry)
    return clearTimers
  }, [nodesKey, startNodeId, historyIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Подгрузка более ранней истории по требованию (кнопка/скролл вверх) —
  // следующая пачка HISTORY_PAGE, старше уже показанных. НЕ трогает
  // visitedIdsRef/seenIdsRef — те уже содержат ПОЛНУЮ историю с момента
  // инициализации, подгрузка меняет только то, что нарисовано в ленте
  const requestMoreHistory = useCallback(() => {
    setHistoryShown(shown => {
      const total = historyRef.current.length
      if (shown >= total) return shown
      const nextShown = Math.min(total, shown + HISTORY_PAGE)
      const older = historyRef.current
        .slice(total - nextShown, total - shown)
        .map(n => ({ ...n, isHistory: true }))
      setVisibleNodes(prev => [...older, ...prev])
      return nextShown
    })
  }, [])
  const hasMoreHistory = historyShown < historyRef.current.length

  // visibleNodes/pendingNode хранят СНИМКИ нод на момент показа. Админ правит
  // урок прямо из плеера (правая панель редактора), и пузырь должен меняться
  // на месте — отдаём наружу всегда свежий объект ноды по id. Порядок показа
  // и прогресс при этом не трогаются: сам список остаётся тем же.
  const freshVisible = useMemo(
    // visit — номер показа этой ноды, он живёт в снимке, а не в самой ноде.
    // isHistory — так же: снимок-флаг «это восстановленная история», не
    // часть самой ноды урока, иначе бы потерялся при подмешивании свежей
    () => visibleNodes.map(n => ({ ...(nodeMapRef.current[n.id] ?? n), visit: n.visit, isHistory: n.isHistory })),
    [visibleNodes, nodes], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const freshPending = pendingNode ? (nodeMapRef.current[pendingNode.id] ?? pendingNode) : null

  return {
    visibleNodes: freshVisible, pendingNode: freshPending, isWaiting, onNodeDone,
    revealNow, stepTime, stepBack, canStepBack: visibleNodes.length > 1,
    requestMoreHistory, hasMoreHistory,
  }
}
