import { useRef, useLayoutEffect, useEffect } from 'react'

// Плавный скролл с кастомным easing — синхронизирован с slide-in анимацией
function smoothScrollToBottom(feed, duration = 380) {
  const start = feed.scrollTop
  const end   = feed.scrollHeight - feed.clientHeight
  if (end <= start + 1) return
  const diff      = end - start
  const startTime = performance.now()
  function step(now) {
    const t    = Math.min((now - startTime) / duration, 1)
    const ease = 1 - Math.pow(1 - t, 3) // cubic ease-out
    feed.scrollTop = start + diff * ease
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export default function PlayerFeed({ children }) {
  const feedRef        = useRef(null)
  const innerRef       = useRef(null)
  const prevElsRef     = useRef(new Set())
  const prevRowCount   = useRef(0)
  const userScrolledUp = useRef(false)

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    function onScroll() {
      const atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 60
      userScrolledUp.current = !atBottom
    }
    feed.addEventListener('scroll', onScroll, { passive: true })
    return () => feed.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const rows     = inner.querySelectorAll('.playerMsgRow')
    const rowCount = rows.length
    if (rowCount === prevRowCount.current) return

    const prevEls  = prevElsRef.current
    const feed     = feedRef.current
    const hasNew   = rowCount > prevRowCount.current

    if (hasNew) {
      const feedBottom = feed
        ? feed.getBoundingClientRect().bottom
        : window.innerHeight

      rows.forEach(el => {
        if (prevEls.has(el)) return
        const rect   = el.getBoundingClientRect()
        const startY = feedBottom - rect.top + rect.height + 16
        el.animate(
          [
            { opacity: '0', transform: `translateY(${startY}px)` },
            { opacity: '1', transform: 'translateY(0)' },
          ],
          { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        )
      })

      // Плавный скролл синхронно со slide-in — старые сообщения уходят вверх
      // без мгновенного прыжка
      if (!userScrolledUp.current && feed) {
        smoothScrollToBottom(feed, 380)
      }
    }

    const next = new Set()
    rows.forEach(el => next.add(el))
    prevElsRef.current  = next
    prevRowCount.current = rowCount
  })

  return (
    <div className="playerFeed" ref={feedRef}>
      <div className="playerFeedInner" ref={innerRef}>
        <div className="playerFeedSpacer" />
        {children}
      </div>
    </div>
  )
}
