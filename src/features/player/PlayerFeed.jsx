import { useRef, useLayoutEffect, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

const CSS_GAP = 4 // должно совпадать с gap в .playerFeedInner

// Spacer сверху + overflow-y:auto на .playerFeed — вместо justify-content:flex-end.
// Новые сообщения авто-скроллятся вниз если пользователь у дна.
// Если пользователь скроллит вверх — авто-скролл не перебивает.
export default function PlayerFeed({ children }) {
  const feedRef     = useRef(null)
  const innerRef    = useRef(null)
  const prevElsRef  = useRef(new Set())
  const prevRowCount = useRef(0)
  const userScrolledUp = useRef(false)

  // Detect if user scrolled away from bottom
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

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current) {
      rows.forEach(el => {
        if (prevEls.has(el)) return
        const feed   = feedRef.current
        const feedBottom = feed ? feed.getBoundingClientRect().bottom : window.innerHeight
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
    }

    // Auto-scroll to bottom on new message unless user scrolled up
    if (!userScrolledUp.current) {
      const feed = feedRef.current
      if (feed) feed.scrollTop = feed.scrollHeight
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
