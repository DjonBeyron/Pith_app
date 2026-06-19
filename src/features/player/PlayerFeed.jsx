import { useRef, useLayoutEffect, Children } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// column-reverse + reversed DOM order: newest message first in DOM = visual bottom.
// overflow: visible on .playerFeed so msgSlideIn translateY goes below screen edge.
// FLIP: captured positions used only when row count increases — no reflow during playback.
export default function PlayerFeed({ children }) {
  const innerRef      = useRef(null)
  const prevPosRef    = useRef(new Map())
  const prevRowCount  = useRef(0)

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const rows     = inner.querySelectorAll('.playerMsgRow')
    const rowCount = rows.length

    pLog('PlayerFeed: rows=', rowCount, 'children=', Children.count(children))

    // Ранний выход если количество строк не изменилось — не форсируем reflow во время воспроизведения
    if (rowCount === prevRowCount.current) return

    // Захватываем позиции (getBoundingClientRect только при изменении состава)
    const newPos = new Map()
    rows.forEach(el => newPos.set(el, el.getBoundingClientRect().top))

    // FLIP: плавно поднимаем существующие сообщения когда добавляется новое
    if (rowCount > prevRowCount.current && prevPosRef.current.size > 0) {
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

    prevPosRef.current  = newPos
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
