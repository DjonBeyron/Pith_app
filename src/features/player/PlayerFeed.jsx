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

    const rows     = inner.querySelectorAll('.playerMsgRow')
    const rowCount = rows.length
    if (rowCount === prevRowCount.current) return

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current) {
      rows.forEach(el => {
        if (prevEls.has(el)) return

        const doAnimate = () => {
          el.style.opacity = ''
          el.animate(
            [{ opacity: '1', transform: 'translateY(60px)' }, { opacity: '1', transform: 'translateY(0)' }],
            { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
          )
        }

        const video = el.querySelector('video')
        // If a video element is present but its first frame isn't decoded yet,
        // hold opacity:0 and wait for canplay before starting the slide-in animation.
        // This prevents the empty-container flash during the 400ms slide.
        // Fallback fires after 300ms so the row always appears even if canplay never fires.
        if (video && video.src && video.readyState < 2) {
          el.style.opacity = '0'
          const timer = setTimeout(doAnimate, 300)
          video.addEventListener('canplay', () => { clearTimeout(timer); doAnimate() }, { once: true })
        } else {
          doAnimate()
        }
      })
    }

    const next = new Set()
    rows.forEach(el => next.add(el))
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
