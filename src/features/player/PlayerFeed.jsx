import { useRef, useEffect, useImperativeHandle, Children } from 'react'

// Isolated scroll layer. Only this component may call scrollTop / scrollTo.
// LessonPlayer passes children (already-mapped messages) and a ref for imperative control.
export default function PlayerFeed({ children, ref }) {
  const scrollRef = useRef(null)
  const lockedRef = useRef(true) // stays locked to bottom unless user scrolls up

  useImperativeHandle(ref, () => ({
    scrollToBottom(animated = true) {
      const el = scrollRef.current
      if (!el) return
      el.scrollTo({ top: el.scrollHeight, behavior: animated ? 'smooth' : 'instant' })
    },
    lockToBottom()  { lockedRef.current = true  },
    unlockScroll()  { lockedRef.current = false },
  }))

  // Scroll to bottom whenever a new child (message) appears
  const childCount = Children.count(children)
  useEffect(() => {
    if (!lockedRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [childCount]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    lockedRef.current = atBottom
  }

  return (
    <div className="playerFeed" ref={scrollRef} onScroll={handleScroll}>
      <div className="playerFeedInner">
        {children}
      </div>
    </div>
  )
}
