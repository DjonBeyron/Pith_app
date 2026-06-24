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
      const newRows      = rows.filter(el => !prevEls.has(el))
      const existingRows = rows.filter(el =>  prevEls.has(el))

      // Measure how far existing rows already jumped (layout reflow before this effect).
      // wrapper div height + CSS gap (4px) = exact shift amount.
      let shiftPx = 0
      newRows.forEach(el => {
        shiftPx += (el.parentElement?.offsetHeight ?? el.offsetHeight) + 4
      })

      // New rows: slide in from below.
      newRows.forEach(el => {
        el.animate(
          [{ transform: 'translateY(200px)' }, { transform: 'translateY(0)' }],
          { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'backwards' },
        )
      })

      // Existing rows: FLIP — instantly push back to where they were, animate up in sync.
      // fill:'backwards' holds the start frame from first paint so there's no visible jump.
      if (existingRows.length && shiftPx > 0) {
        existingRows.forEach(el => {
          el.animate(
            [{ transform: `translateY(${shiftPx}px)` }, { transform: 'translateY(0)' }],
            { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'backwards' },
          )
        })
      }
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
