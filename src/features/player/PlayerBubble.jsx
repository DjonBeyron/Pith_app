import { useRef, useEffect } from 'react'
import { playSound } from '../../shared/lib/sounds.js'
import { pLog } from '../../shared/lib/debug.js'

let bubbleSeq = 0

// Animated-height bubble wrapper. Smoothly grows as content is added (e.g. typing text).
// Ported directly from MsgBubble in the old project (BlockEditorChat.jsx).
export default function PlayerBubble({ className, children }) {
  const ref      = useRef(null)
  const stRef    = useRef({ prevH: null, tid: null, target: null })
  const readyRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const st = stRef.current

    function scheduleCleanup(target) {
      clearTimeout(st.tid)
      st.target = target
      st.tid = setTimeout(() => {
        st.tid = null
        const t = st.target; st.target = null
        el.style.height = el.style.overflow = el.style.transition = ''
        const actualH = el.scrollHeight
        if (Math.abs(actualH - t) > 2) animateTo(t, actualH)
        else st.prevH = el.getBoundingClientRect().height
      }, 280)
    }

    function animateTo(from, to) {
      el.style.transition = 'none'
      if (to < from) el.style.overflow = 'hidden'
      el.style.height = from + 'px'
      void el.offsetWidth
      el.style.transition = 'height 0.25s cubic-bezier(.16,1,.3,1)'
      el.style.height = to + 'px'
      st.prevH = to
      scheduleCleanup(to)
    }

    const id = ++bubbleSeq
    pLog(`[bubble#${id}] mount — className="${className}"`)
    // Delay matches slide-in animation duration (190ms) so sound lands when message is visible
    const soundTimer = setTimeout(() => {
      pLog(`[bubble#${id}] sound message-in fired (+190ms)`)
      playSound('message-in')
    }, 190)

    st.prevH = el.getBoundingClientRect().height
    const unlock = setTimeout(() => {
      readyRef.current = true
      st.prevH = el.getBoundingClientRect().height
    }, 620)

    const ro = new ResizeObserver(() => {
      const nextH = el.scrollHeight
      const prevH = st.prevH ?? nextH
      if (!readyRef.current) { st.prevH = nextH; return }
      if (Math.abs(nextH - prevH) < 2) return
      if (st.tid !== null) {
        if (nextH <= (st.target ?? 0)) { st.prevH = nextH; return }
        el.style.height = nextH + 'px'
        st.prevH = nextH
        scheduleCleanup(nextH)
      } else {
        animateTo(st.prevH ?? 0, nextH)
      }
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(unlock); clearTimeout(st.tid); clearTimeout(soundTimer) }
  }, [])

  return <div ref={ref} className={className}>{children}</div>
}
