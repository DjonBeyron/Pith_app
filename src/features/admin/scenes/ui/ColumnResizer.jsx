import { useRef } from 'react'
import { dragWidths, toFractions, cssVars, ariaFor, KEY_STEP, MIN_COL } from './columnResize.js'

// Перетаскиваемый разделитель между колонками сборщика (index 0 — между настройками и
// предпросмотром, 1 — между предпросмотром и панелью). Pointer events + setPointerCapture:
// мышь и тач одинаково. Во время жеста ширины пишутся CSS-переменными прямо в style .scbBody
// (сцена не перерисовывается React'ом), итог — onCommit(fractions) один раз на pointerup.
// Клавиатура: ← → шаг KEY_STEP, Home/End — к минимуму/максимуму, двойной клик — сброс (onReset).
// Доступность: role="separator", aria-orientation="vertical", aria-valuenow/min/max.
const measure = body => [...(body?.querySelectorAll('.scbCol') ?? [])].map(el => el.getBoundingClientRect().width)
const applyVars = (body, px) => { for (const [k, v] of Object.entries(cssVars(toFractions(px)))) body.style.setProperty(k, v) }

export default function ColumnResizer({ index, bodyRef, fractions, onCommit, onReset }) {
  const drag = useRef(null) // { startX, startPx }

  const commitPx = px => { if (bodyRef.current) applyVars(bodyRef.current, px); onCommit(toFractions(px)) }

  const onPointerDown = e => {
    const body = bodyRef.current
    if (!body || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { startX: e.clientX, startPx: measure(body) }
    body.dataset.resizing = '1'
  }
  const onPointerMove = e => {
    const d = drag.current
    if (!d || !bodyRef.current) return
    applyVars(bodyRef.current, dragWidths(d.startPx, index, e.clientX - d.startX))
  }
  const onPointerUp = e => {
    const d = drag.current
    if (!d) return
    drag.current = null
    const body = bodyRef.current
    if (body) delete body.dataset.resizing
    commitPx(dragWidths(d.startPx, index, e.clientX - d.startX))
  }
  const onKeyDown = e => {
    const body = bodyRef.current
    if (!body) return
    const px = measure(body)
    const pair = px[index] + px[index + 1]
    const step = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP, Home: -pair, End: pair }[e.key]
    if (step === undefined) return
    e.preventDefault()
    commitPx(dragWidths(px, index, step))
  }

  // aria — из долей при условной ширине окна 1200px (точность до процента достаточна; ref в рендере не читаем)
  const a = ariaFor(fractions.map(f => f * 1200), index, MIN_COL)
  return (
    <div
      role="separator" tabIndex={0} aria-orientation="vertical" aria-label={index === 0 ? 'Ширина колонки настроек' : 'Ширина колонки предпросмотра'}
      aria-valuenow={a.now} aria-valuemin={a.min} aria-valuemax={a.max}
      className="scbSplit" data-index={index}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown} onDoubleClick={onReset} title="Тянуть: ширина колонок · двойной клик: сброс · ← →: шаг"
    >
      <span className="scbSplitGrip" aria-hidden="true" />
    </div>
  )
}
