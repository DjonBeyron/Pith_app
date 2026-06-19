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

    pLog('PlayerFeed: rows=', rowCount, 'children=', Children.count(children))

    if (rowCount === prevRowCount.current) return // ничего не изменилось

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current && prevEls.size > 0) {
      // Считаем суммарную высоту новых элементов для точного FLIP-сдвига
      let shift = 0
      rows.forEach(el => {
        if (!prevEls.has(el)) shift += el.getBoundingClientRect().height + CSS_GAP
      })

      if (shift > 0) {
        prevEls.forEach(el => {
          el.style.transition = 'none'
          el.style.transform  = `translateY(${shift}px)`
          void el.offsetHeight
          el.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
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
