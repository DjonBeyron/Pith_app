import { useRef, useEffect, Children } from 'react'
import WaitingDots from './waiting/WaitingDots.jsx'
import { pLog } from '../../shared/lib/debug.js'

// column-reverse: first DOM item = visual BOTTOM, last DOM item = visual TOP.
// Messages in DOM order [oldest..newest] → oldest at bottom, newest just above.
// WaitingDots last in DOM → appears above latest message (not below it).
export default function PlayerFeed({ children, showDots = false }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    pLog(
      'PlayerFeed layout:',
      'outer.h=', outer.clientHeight,
      'inner.h=', inner.clientHeight,
      'flexDir=', getComputedStyle(inner).flexDirection,
      'childCount=', Children.count(children),
    )
  })

  return (
    <div className="playerFeed" ref={outerRef}>
      <div className="playerFeedInner" ref={innerRef}>
        {children}
        {showDots && <WaitingDots />}
      </div>
    </div>
  )
}
