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

export function useGraphPlayer(nodes) {
  const [visibleNodes, setVisibleNodes] = useState([])
  const [isWaiting,   setIsWaiting]   = useState(false)

  // Stable refs — never cause re-renders, always reflect latest values
  const nodeMapRef = useRef({})
  const firedRef   = useRef(new Set())
  const timersRef  = useRef([])

  // Keep nodeMap always in sync; assigning ref in render is fine for reads
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

  // Reveal the next node after a short typing-dots pause
  const scheduleReveal = useRef(null)
  const activateTimerTrigger = useRef(null)

  scheduleReveal.current = (nextNodeId) => {
    const next = nodeMapRef.current[nextNodeId]
    if (!next) return
    setIsWaiting(true)
    addTimer(() => {
      setVisibleNodes(prev =>
        prev.some(n => n.id === next.id) ? prev : [...prev, next]
      )
      setIsWaiting(false)
      activateTimerTrigger.current(next)
    }, TYPING_DELAY_MS)
  }

  // Start timer if the node has a "timer" trigger
  activateTimerTrigger.current = (node) => {
    const t = (node.triggers ?? []).find(tr => tr.if === 'timer' && tr.then)
    if (!t) return
    const key = `${node.id}:timer`
    console.log('[GraphPlayer] timer trigger for node', node.seq, '→', t.ms, 'ms → next:', t.then)
    addTimer(() => {
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      scheduleReveal.current(t.then)
    }, t.ms ?? 3000)
  }

  // Called by modules/panels when their primary action finishes.
  // Checks triggers in order: played → photo_shown → timer_after_play
  const onNodeDone = useCallback((nodeId) => {
    const node = nodeMapRef.current[nodeId]
    if (!node) return
    const triggers = node.triggers ?? []
    console.log('[GraphPlayer] onNodeDone seq=', node.seq, 'triggers=', triggers)

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
    }
  }, []) // eslint-disable-line

  // Re-initialize when nodes list changes (new lesson, player re-open)
  const nodesKey = nodes.map(n => n.id).join(',')
  useEffect(() => {
    if (!nodes.length) {
      setVisibleNodes([])
      setIsWaiting(false)
      clearTimers()
      return
    }
    clearTimers()
    firedRef.current = new Set()
    const entry = findEntry(nodes)
    console.log('[GraphPlayer] init — entry node seq=', entry?.seq, 'id=', entry?.id)
    if (!entry) return
    setVisibleNodes([entry])
    setIsWaiting(false)
    activateTimerTrigger.current(entry)
    return clearTimers
  }, [nodesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { visibleNodes, isWaiting, onNodeDone }
}
