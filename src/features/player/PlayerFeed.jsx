import { useRef, useEffect, Children } from 'react'
import WaitingDots from './waiting/WaitingDots.jsx'
import { pLog } from '../../shared/lib/debug.js'

// column-reverse feed: newest message is last in DOM = visually at bottom.
// No scrollToBottom needed — scrollTop=0 always shows the bottom in column-reverse.
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
      'inner.minH=', inner.style.minHeight || getComputedStyle(inner).minHeight,
      'flexDir=', getComputedStyle(inner).flexDirection,
      'childCount=', Children.count(children),
    )
  })

  return (
    <div className="playerFeed" ref={outerRef}>
      <div className="playerFeedInner" ref={innerRef}>
        {showDots && <WaitingDots />}
        {children}
      </div>
    </div>
  )
}
