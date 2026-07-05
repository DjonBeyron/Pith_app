import { useRef, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

let bubbleSeq = 0

// Animated-height bubble wrapper. Smoothly grows as content is added (e.g. typing text).
// Ported directly from MsgBubble in the old project (BlockEditorChat.jsx).
// follow=true — режим «просто следуй»: свои анимации высоты выключены, пузырь
// с авто-высотой едет за контентом. Включается на время CSS-переходов контента
// (grid-анимация секции перевода) — два аниматора высоты иначе дерутся:
// RO видел scrollHeight >= зафиксированной высоты как «рост», ставил высоту
// мгновенно и уходил в циклы RE-ANIMATE (дёрганое закрытие перевода).
export default function PlayerBubble({ className, children, follow = false }) {
  const ref       = useRef(null)
  const stRef     = useRef({ prevH: null, tid: null, target: null })
  const readyRef  = useRef(false)
  const idRef     = useRef(0) // номер пузыря для дебаг-лога
  const followRef = useRef(false)

  useEffect(() => {
    followRef.current = !!follow
    if (!follow) return
    // Вход в follow: срубить свою анимацию и вернуть авто-высоту
    const st = stRef.current
    clearTimeout(st.tid)
    st.tid = null
    st.target = null
    const el = ref.current
    if (el) {
      el.style.height = el.style.overflow = el.style.transition = ''
      st.prevH = el.getBoundingClientRect().height
      pLog(`[bubble#${idRef.current}] follow ON (h=${Math.round(st.prevH)})`)
    }
  }, [follow])

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
        pLog(`[bubble#${idRef.current}] cleanup: target=${t} actual=${actualH}${Math.abs(actualH - t) > 2 ? ' → RE-ANIMATE (вот возможный дёрг)' : ' ok'}`)
        if (Math.abs(actualH - t) > 2) animateTo(t, actualH)
        else st.prevH = el.getBoundingClientRect().height
      }, 280)
    }

    function animateTo(from, to) {
      pLog(`[bubble#${idRef.current}] animateTo ${Math.round(from)}→${Math.round(to)} (${to < from ? 'сжатие' : 'рост'})`)
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
    idRef.current = id
    pLog(`[bubble#${id}] mount — className="${className}"`)

    st.prevH = el.getBoundingClientRect().height
    const unlock = setTimeout(() => {
      readyRef.current = true
      st.prevH = el.getBoundingClientRect().height
    }, 620)

    const ro = new ResizeObserver(() => {
      const nextH = el.scrollHeight
      const prevH = st.prevH ?? nextH
      if (!readyRef.current) { st.prevH = nextH; return }
      // follow: плавность даёт CSS-переход контента, пузырь только запоминает
      if (followRef.current) { st.prevH = nextH; return }
      if (Math.abs(nextH - prevH) < 2) return
      pLog(`[bubble#${id}] RO ${Math.round(prevH)}→${nextH}${st.tid !== null ? ` (анимация активна, target=${st.target})` : ''}`)
      if (st.tid !== null) {
        if (nextH <= (st.target ?? 0)) { st.prevH = nextH; return }
        // Рост во время активной анимации: высота ставится МГНОВЕННО (без
        // transition) — если это случается при закрытии, будет виден дёрг
        pLog(`[bubble#${id}] мгновенный height=${nextH} (рост поверх анимации)`)
        el.style.height = nextH + 'px'
        st.prevH = nextH
        scheduleCleanup(nextH)
      } else {
        animateTo(st.prevH ?? 0, nextH)
      }
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(unlock); clearTimeout(st.tid) }
  }, [])

  return <div ref={ref} className={className}>{children}</div>
}
