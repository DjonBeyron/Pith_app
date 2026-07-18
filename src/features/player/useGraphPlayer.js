/* eslint-disable react-hooks/refs */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from 'react'

// How long "teacher is typing" dots show before a new node appears
const TYPING_DELAY_MS = 1400

// Start from seq=1; fallback to lowest seq if seq=1 not found
function findEntry(nodes) {
  return (
    nodes.find(n => n.seq === 1) ??
    nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0] ??
    null
  )
}

export function useGraphPlayer(nodes, { onFinish } = {}) {
  const [visibleNodes, setVisibleNodes] = useState([])
  const [pendingNode,  setPendingNode]  = useState(null)
  const [isWaiting,   setIsWaiting]   = useState(false)

  const nodeMapRef  = useRef({})
  const firedRef    = useRef(new Set())
  const timersRef   = useRef([])
  const finishedRef = useRef(false) // финал урока срабатывает ровно один раз
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  nodeMapRef.current = Object.fromEntries(nodes.map(n => [n.id, n]))

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
  const activateTimerTrigger = useRef(null)

  scheduleReveal.current = (nextNodeId) => {
    const next = nodeMapRef.current[nextNodeId]
    if (!next) return
    setPendingNode(next)   // pre-render node off-screen so video can decode
    setIsWaiting(true)
    addTimer(() => {
      setPendingNode(null)
      setVisibleNodes(prev =>
        prev.some(n => n.id === next.id) ? prev : [...prev, next]
      )
      setIsWaiting(false)
      activateTimerTrigger.current(next)
    }, TYPING_DELAY_MS)
  }

  activateTimerTrigger.current = (node) => {
    const t = (node.triggers ?? []).find(tr => tr.if === 'timer' && tr.then)
    if (!t) return
    const key = `${node.id}:timer`
    addTimer(() => {
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      scheduleReveal.current(t.then)
    }, t.ms ?? 3000)
  }

  const onNodeDone = useCallback((nodeId, result = null) => {
    const node = nodeMapRef.current[nodeId]
    if (!node) return
    const triggers = node.triggers ?? []

    if (result) {
      const t = triggers.find(tr => tr.if === result && tr.then)
      if (t) {
        const key = `${nodeId}:${result}`
        if (firedRef.current.has(key)) return
        firedRef.current.add(key)
        scheduleReveal.current(t.then)
        return
      }
    }

    for (const ev of ['played', 'photo_shown']) {
      const t = triggers.find(tr => tr.if === ev && tr.then)
      if (!t) continue
      const key = `${nodeId}:${ev}`
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      scheduleReveal.current(t.then)
      return
    }

    const tap = triggers.find(tr => tr.if === 'timer_after_play' && tr.then)
    if (tap) {
      const key = `${nodeId}:timer_after_play`
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      addTimer(() => scheduleReveal.current(tap.then), tap.ms ?? 3000)
      return
    }

    // Таймер-переход продолжит цепочку сам (activateTimerTrigger) — это не финиш
    if (triggers.some(tr => tr.if === 'timer' && tr.then)) return

    // Nothing left to schedule — lesson is finished (ровно один раз)
    if (finishedRef.current) return
    finishedRef.current = true
    onFinishRef.current?.()
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
    finishedRef.current = false
    const entry = findEntry(nodes)
    if (!entry) return
    setVisibleNodes([entry])
    setIsWaiting(false)
    activateTimerTrigger.current(entry)
    return clearTimers
  }, [nodesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { visibleNodes, pendingNode, isWaiting, onNodeDone }
}
