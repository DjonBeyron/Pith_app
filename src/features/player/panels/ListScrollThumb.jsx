import { useState, useEffect } from 'react'

// Всегда видимая полоса прокрутки для списка слов вне таблицы.
//
// Родная не годится: на iOS полоса накладная (overlay) — она проступает во
// время прокрутки и через секунду гаснет, а ::-webkit-scrollbar там просто
// игнорируется. По неподвижному экрану ученик не понимает, что список длиннее
// видимой части, и нижние слова остаются ненайденными.
//
// Поэтому рисуем свою: следим за scrollTop/scrollHeight цели и держим ползунок
// пропорциональной высоты. Пока список влезает целиком, полосы нет вовсе —
// показывать нечего.
export default function ListScrollThumb({ targetRef }) {
  const [thumb, setThumb] = useState(null)

  useEffect(() => {
    const el = targetRef?.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      // +1 — запас на дробные высоты: без него полоса появлялась бы на списке,
      // который влезает, но чей scrollHeight на сотую больше clientHeight
      if (scrollHeight <= clientHeight + 1) { setThumb(null); return }
      setThumb({
        // Минимум в 14% — чтобы на длинном списке ползунок не превращался
        // в точку, по которой не понять ни положения, ни направления
        h: Math.max(14, (clientHeight / scrollHeight) * 100),
        t: (scrollTop / scrollHeight) * 100,
      })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    // Список приходит не сразу и меняется по ходу разбора — ResizeObserver
    // ловит и появление слов, и смену высоты сцены
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [targetRef])

  if (!thumb) return null

  return (
    <div className="listScrollTrack" aria-hidden="true">
      <div className="listScrollThumb" style={{ top: `${thumb.t}%`, height: `${thumb.h}%` }} />
    </div>
  )
}
