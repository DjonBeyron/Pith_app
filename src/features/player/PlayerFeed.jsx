import { useRef, useLayoutEffect, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

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
    const feed  = feedRef.current
    if (!inner || !feed) return

    const rows     = inner.querySelectorAll('.playerMsgRow')
    const rowCount = rows.length
    if (rowCount === prevRowCount.current) return

    const prevEls = prevElsRef.current
    const hasNew  = rowCount > prevRowCount.current

    pLog(`[Feed] rowCount=${rowCount} prev=${prevRowCount.current}`)
    pLog(`[Feed] feed: h=${feed.clientHeight} scrollTop=${feed.scrollTop.toFixed(0)} scrollH=${feed.scrollHeight}`)
    pLog(`[Feed] inner: offsetH=${inner.offsetHeight} offsetTop=${inner.offsetTop}`)
    pLog(`[Feed] feedRect: top=${feed.getBoundingClientRect().top.toFixed(0)} bottom=${feed.getBoundingClientRect().bottom.toFixed(0)}`)

    if (hasNew) {
      const feedRect = feed.getBoundingClientRect()

      rows.forEach(el => {
        if (prevEls.has(el)) return
        const rect = el.getBoundingClientRect()
        pLog(`[Feed] NEW row: rect.top=${rect.top.toFixed(0)} rect.bottom=${rect.bottom.toFixed(0)} h=${rect.height.toFixed(0)}`)
        pLog(`[Feed] feedRect.bottom=${feedRect.bottom.toFixed(0)} window.innerH=${window.innerHeight}`)

        const startY = feedRect.bottom - rect.top + rect.height + 16
        pLog(`[Feed] startY=${startY.toFixed(0)} (feedBottom - rect.top + h + 16)`)

        el.animate(
          [
            { opacity: '0', transform: `translateY(${startY}px)` },
            { opacity: '1', transform: 'translateY(0)' },
          ],
          { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        )
      })

      if (!userScrolledUp.current) {
        const before = feed.scrollTop
        feed.scrollTop = feed.scrollHeight
        pLog(`[Feed] scroll: ${before.toFixed(0)} → ${feed.scrollTop.toFixed(0)} (scrollH=${feed.scrollHeight})`)
      }
    }

    const next = new Set()
    rows.forEach(el => next.add(el))
    prevElsRef.current   = next
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
