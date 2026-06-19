import { useRef, useLayoutEffect, Children } from 'react'
import { pLog } from '../../shared/lib/debug.js'

const CSS_GAP = 4 // должно совпадать с gap в .playerFeedInner

// column-reverse + reversed DOM order: newest message first in DOM = visual bottom.
// overflow: visible → msgSlideIn translateY может уйти за нижний край экрана.
// FLIP: сдвиг считается из высоты новых элементов, а не из старых позиций
// (старые позиции стали бы неверны если пузырь вырос во время воспроизведения).
export default function PlayerFeed({ children }) {
  const innerRef    = useRef(null)
  const prevElsRef  = useRef(new Set()) // известные элементы строк
  const prevRowCount = useRef(0)

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const rows     = inner.querySelectorAll('.playerMsgRow')
    const rowCount = rows.length

    const cr = inner.getBoundingClientRect()
    pLog('PlayerFeed: rows=', rowCount, 'children=', Children.count(children), '| container top=', Math.round(cr.top), 'bottom=', Math.round(cr.bottom), 'h=', Math.round(cr.height))

    if (rowCount === prevRowCount.current) return // ничего не изменилось

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current && prevEls.size > 0) {
      let shift = 0

      // Новые элементы: slide-in через Web Animations API с точной стартовой позицией
      rows.forEach(el => {
        if (prevEls.has(el)) return
        const rect   = el.getBoundingClientRect()
        const startY = window.innerHeight - rect.top + rect.height + 24
        shift += rect.height + CSS_GAP
        pLog('PlayerFeed slide-in: h=', Math.round(rect.height), 'top=', Math.round(rect.top), 'startY=', Math.round(startY), 'cls=', el.className)
        el.animate(
          [
            { opacity: '0', transform: `translateY(${startY}px)` },
            { opacity: '1', transform: 'translateY(0)' },
          ],
          { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        )
      })

      pLog('PlayerFeed FLIP: shift=', Math.round(shift), 'to', prevEls.size, 'old rows')
      if (shift > 0) {
        prevEls.forEach(el => {
          const elR = el.getBoundingClientRect()
          pLog('  FLIP old:', el.className.split(' ').slice(-1)[0] || 'row', 'top=', Math.round(elR.top))
          el.style.transition = 'none'
          el.style.transform  = `translateY(${shift}px)`
          void el.offsetHeight
          el.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
          el.style.transform  = ''
        })
      }
    }

    // Обновляем набор известных элементов
    const next = new Set()
    rows.forEach(el => next.add(el))
    prevElsRef.current  = next
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
