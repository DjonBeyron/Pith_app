import { useRef, useLayoutEffect, Children } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// column-reverse + reversed DOM order: newest message first in DOM = visual bottom.
// overflow: visible on .playerFeed so msgSlideIn translateY can go below screen edge.
// FLIP: capture row positions before render, animate delta after render → smooth push-up.
export default function PlayerFeed({ children }) {
  const innerRef  = useRef(null)
  const prevPosRef = useRef(new Map())

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const rows = inner.querySelectorAll('.playerMsgRow')
    const newPos = new Map()
    rows.forEach(el => newPos.set(el, el.getBoundingClientRect().top))

    pLog('PlayerFeed: rows=', rows.length, 'children=', Children.count(children))

    // FLIP только когда число сообщений выросло — иначе дёргает при ре-рендерах без новых сообщений
    const prevSize = prevPosRef.current.size
    if (rows.length > prevSize && prevSize > 0) {
      newPos.forEach((newTop, el) => {
        const prevTop = prevPosRef.current.get(el)
        if (prevTop == null) return          // новый элемент — CSS msgSlideIn
        const delta = prevTop - newTop
        if (Math.abs(delta) < 1) return

        el.style.transition = 'none'
        el.style.transform = `translateY(${delta}px)`
        void el.offsetHeight
        el.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
        el.style.transform = ''
      })
    }

    prevPosRef.current = newPos
  })

  return (
    <div className="playerFeed">
      <div className="playerFeedInner" ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
