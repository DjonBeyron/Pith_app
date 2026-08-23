import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Выпадающее меню особой ячейки: тап по «he/she/it» в таблице открывает
// список её вариантов, и в собранную фразу уходит выбранный. Тёмное, с узкой
// полосой прокрутки — чтобы длинный список не занимал пол-экрана.
//
// Рисуется порталом в body, а не на месте. На десктопе плеер живёт в рамке
// «телефона», у которой есть transform, — а он делает себя точкой отсчёта для
// position:fixed внутри. Координаты ячейки при этом остаются оконными, и меню
// уезжало ровно на смещение рамки. Из body отсчёт снова оконный.
export default function CellOptionsMenu({ options, anchorRect, onPick, onClose }) {
  const ref = useRef(null)

  // Esc закрывает — тем же жестом, что и тап мимо меню
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!anchorRect) return null

  // Держимся под ячейкой, но не вылезаем за края экрана
  const width = Math.max(96, Math.min(180, anchorRect.width))
  const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - width - 8)
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const openUp = spaceBelow < 140
  const pos = openUp
    ? { bottom: window.innerHeight - anchorRect.top + 4 }
    : { top: anchorRect.bottom + 4 }

  return createPortal(
    <>
      <div className="cellMenuOverlay" onClick={onClose} />
      <div ref={ref} className="cellMenu" style={{ left, width, ...pos }}>
        {options.map(opt => (
          <button key={opt} className="cellMenuItem" onClick={() => onPick(opt)}>{opt}</button>
        ))}
      </div>
    </>,
    document.body,
  )
}
