/* eslint-disable react-hooks/refs */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { appendVisit, forgetNodeKeys } from './graphPlayerVisits.js'

// How long "teacher is typing" dots show before a new node appears
const TYPING_DELAY_MS = 1400

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

// paused — шаговый режим админа (правка из канваса): переходы замирают.
// Запланированный переход не теряется: он запоминается и отыгрывается, когда
// паузу снимут или нажмут «вперёд».
export function useGraphPlayer(nodes, { onFinish, startNodeId = null, paused = false } = {}) {
  const [visibleNodes, setVisibleNodes] = useState([])
  const [pendingNode,  setPendingNode]  = useState(null)
  const [isWaiting,   setIsWaiting]   = useState(false)

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
  }

  // force — шаг «вперёд» админа: показать не дожидаясь «печатает…» и не
  // спрашивая паузу
  scheduleReveal.current = (nextNodeId, force = false) => {
    const next = nodeMapRef.current[nextNodeId]
    if (!next) return
    if (pausedRef.current && !force) {
      scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
      return
    }
    setPendingNode(next)   // pre-render node off-screen so video can decode
    setIsWaiting(true)
    if (force) { revealNode(next); return }
    scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
    addTimer(() => revealNode(next), TYPING_DELAY_MS)
  }

  // Переход с задержкой: пауза после конца медиа (offsetMs) и «таймер после
  // показа». Помечаем его запланированным ДО таймера — иначе пауза, пришедшая
  // в эти миллисекунды, убила бы таймер вместе с переходом, и цепочка встала
  // бы навсегда: повторного «доиграло» от модуля уже не будет
  scheduleAfter.current = (ms, nextNodeId) => {
    scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }
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

  // Шаг «вперёд», когда переход уже назначен (тикает «печатает…» или лежит
  // отложенным из-за паузы) — показываем следующее сообщение сейчас же.
  // Возвращает true, если было что показать
  const revealNow = useCallback(() => {
    const planned = scheduledRef.current
    if (!planned) return false
    clearTimers()
    scheduledRef.current = null
    if (planned.type === 'reveal') {
      const next = nodeMapRef.current[planned.nodeId]
      if (next) revealNode(next)
      return !!next
    }
    const n = nodeMapRef.current[planned.nodeId]
    const t = (n?.triggers ?? []).find(tr => tr.if === 'timer' && tr.then)
    if (!t) return false
    const key = `${n.id}:timer`
    if (firedRef.current.has(key)) return false
    firedRef.current.add(key)
    scheduleReveal.current(t.then, true)
    return true
  }, [])

  // Шаг «назад»: снимаем последнее сообщение и разрешаем пройти этот кусок
  // заново — забываем сработавшие триггеры снятой ноды И той, что снова стала
  // последней (иначе её нельзя было бы «ответить» ещё раз, дедуп firedRef не
  // пустил бы). Возвращает обе ноды: вызывающий откатывает по ним ответы и XP
  const stepBack = useCallback(() => {
    const prev = visibleRef.current
    if (prev.length <= 1) return null
    const removed = prev[prev.length - 1]
    const last    = prev[prev.length - 2]
    clearTimers()
    scheduledRef.current = null
    finishedRef.current = false
    for (const key of [...firedRef.current]) {
      if (key.startsWith(`${removed.id}:`) || key.startsWith(`${last.id}:`)) firedRef.current.delete(key)
    }
    setPendingNode(null)
    setIsWaiting(false)
    setVisibleNodes(p => p.slice(0, -1))
    return { removed, last }
  }, [])

  const nodesKey = nodes.map(n => n.id).join(',')
  useEffect(() => {
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
    finishedRef.current = false
    const entry = findEntry(nodes, startNodeId)
    if (!entry) return
    setVisibleNodes([entry])
    setIsWaiting(false)
    activateTimerTrigger.current(entry)
    return clearTimers
  }, [nodesKey, startNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // visibleNodes/pendingNode хранят СНИМКИ нод на момент показа. Админ правит
  // урок прямо из плеера (правая панель редактора), и пузырь должен меняться
  // на месте — отдаём наружу всегда свежий объект ноды по id. Порядок показа
  // и прогресс при этом не трогаются: сам список остаётся тем же.
  const freshVisible = useMemo(
    // visit — номер показа этой ноды, он живёт в снимке, а не в самой ноде
    () => visibleNodes.map(n => ({ ...(nodeMapRef.current[n.id] ?? n), visit: n.visit })),
    [visibleNodes, nodes], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const freshPending = pendingNode ? (nodeMapRef.current[pendingNode.id] ?? pendingNode) : null

  return {
    visibleNodes: freshVisible, pendingNode: freshPending, isWaiting, onNodeDone,
    revealNow, stepBack, canStepBack: visibleNodes.length > 1,
  }
}
