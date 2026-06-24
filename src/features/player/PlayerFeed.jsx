import { useRef, useLayoutEffect } from 'react'

// Double scaleY(-1) trick: outer container flipped → scrollTop=0 = visual bottom.
// Inner content flipped back → messages appear normal.
// No JS scroll management needed — new messages always at bottom automatically.
// Works on iOS Safari (unlike flex column-reverse negative scrollTop).
export default function PlayerFeed({ children }) {
  const innerRef     = useRef(null)
  const prevElsRef   = useRef(new Set())
  const prevRowCount = useRef(0)

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    // Exclude rows inside [data-pending] wrappers — they are pre-rendered off-screen.
    // When a pending node becomes active its wrapper loses data-pending, and the same
    // DOM element enters the active count for the first time → animation fires.
    const rows = [...inner.querySelectorAll('.playerMsgRow')]
      .filter(el => !el.closest('[data-pending]'))
    const rowCount = rows.length
    if (rowCount === prevRowCount.current) return

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current) {
      rows.forEach(el => {
        if (prevEls.has(el)) return
        // 200px offset in double-flipped space = element starts below the feed viewport.
        // fill:'backwards' holds it there from the very first paint (via useLayoutEffect).
        // As it animates to translateY(0) it enters from the bottom — always at opacity:1.
        el.animate(
          [{ transform: 'translateY(200px)' }, { transform: 'translateY(0)' }],
          { duration: 380, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'backwards' },
        )
      })
    }

    const next = new Set(rows)
    prevElsRef.current   = next
    prevRowCount.current = rowCount
  })

  return (
    <div className="playerFeed">
      <div className="playerFeedInner" ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
