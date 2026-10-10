import { useState, useRef, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { placeInfoPopup } from '../lib/infoPopupPlace.js'

// Кнопка-иконка «i» и попап-пояснение по нажатию: длинный поясняющий текст не висит в панели постоянно, а прячется сюда.
// Попап рисуется ПОРТАЛОМ в body (position: fixed) — не растягивает панель и не обрезается её overflow/масштабом холста;
// положение и защита от выхода за экран — placeInfoPopup. Закрытие: повторное нажатие на «i», тап мимо, Esc, прокрутка/колесо
// вне попапа, resize. Стили — styles/info-popup.css (в духе окошка «Временная память»).
// title — заголовок попапа (и aria-label диалога), children — текст пояснения, label — aria-label кнопки.
const stop = e => e.stopPropagation()

export default function InfoPopup({ title, children, label = 'Пояснение', testId }) {
  const [place, setPlace] = useState(null) // null = закрыт; иначе результат placeInfoPopup
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const id = useId()
  const open = place !== null

  const toggle = () => setPlace(p => (p ? null : placeInfoPopup({
    rect: btnRef.current.getBoundingClientRect(),
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight,
  })))

  useEffect(() => {
    if (!open) return undefined
    const close = () => setPlace(null)
    const inside = e => popRef.current?.contains(e.target)
    const onDown = e => { if (!inside(e) && !btnRef.current?.contains(e.target)) close() }
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const onMove = e => { if (!inside(e)) close() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('wheel', onMove, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('wheel', onMove, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef} type="button" className={`infoPopBtn${open ? ' infoPopBtn--on' : ''}`}
        aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        data-testid={testId} onClick={e => { stop(e); toggle() }} onMouseDown={stop} onPointerDown={stop}
      >
        <Info size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={popRef} id={id} role="dialog" aria-label={title ?? label} className={`infoPop infoPop--${place.side}`}
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, '--caret-x': `${place.caretX}px` }}
          onClick={stop} onMouseDown={stop} onPointerDown={stop}
        >
          {title && <p className="infoPopTitle">{title}</p>}
          <div className="infoPopBody">{children}</div>
        </div>,
        document.body,
      )}
    </>
  )
}
