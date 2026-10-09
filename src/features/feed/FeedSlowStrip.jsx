import { useEffect, useRef } from 'react'
import { setFeedPaused } from './feedPauseState.js'
import SlowHint from './SlowHint.jsx'
import { STRIP_HOLD_MS, movedFar, releaseAction } from './catch/slowStripGesture.js'

// Правая полоса видео (пятая часть ширины) в режиме «Ловли слов», пока открыто накрытие: зона замедления — та же механика,
// что у зоны над лайком (useSlowMotion живёт в FeedHud; сюда приходят его обработчики onHoldStart/onHoldEnd). Нижняя граница
// полосы = верхняя граница накрытия: полоса едет вместе с ним по --catch-cover-h (feed-slow-strip.css, transform 260мс на
// тех же кривых). Удержание дольше STRIP_HOLD_MS — замедление 0.5x до отпускания; короткое касание — пауза/пуск видео
// (полоса лежит над видео-слоем и не даёт его onClick, поэтому тап обрабатываем здесь, как SlideVideo.onRootClick).
// Лежит ниже колонки худа и накрытия (z-index 4 < 5 < 8): их кнопки кликаются как обычно. showHint — подсказка
// «Зажми, чтобы замедлить» (useCatchSlowHint): стоит в самом низу полосы, т.е. прямо над накрытием, и едет вместе с ним
export default function FeedSlowStrip({ active, showHint, onHoldStart, onHoldEnd }) {
  const g = useRef({ id: null, x: 0, y: 0, t: 0, moved: false, holding: false, timer: 0 })
  const cb = useRef({ onHoldStart, onHoldEnd })
  useEffect(() => { cb.current = { onHoldStart, onHoldEnd } })

  function finish(canceled) {
    const s = g.current
    if (s.id === null) return
    clearTimeout(s.timer)
    const act = releaseAction({ holding: s.holding, heldMs: performance.now() - s.t, moved: s.moved, canceled })
    if (act === 'endHold') cb.current.onHoldEnd()
    else if (act === 'tap') setFeedPaused(p => !p)
    s.id = null
    s.holding = false
  }

  function onPointerDown(e) {
    const s = g.current
    if (!active || s.id !== null) return
    s.id = e.pointerId
    s.x = e.clientX
    s.y = e.clientY
    s.t = performance.now()
    s.moved = false
    s.holding = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* не критично */ }
    s.timer = setTimeout(() => {
      if (s.moved) return
      s.holding = true
      cb.current.onHoldStart()
    }, STRIP_HOLD_MS)
  }
  function onPointerMove(e) {
    const s = g.current
    if (e.pointerId !== s.id || s.holding || s.moved) return
    if (movedFar(e.clientX - s.x, e.clientY - s.y)) s.moved = true
  }
  const onPointerUp = e => { if (e.pointerId === g.current.id) finish(false) }
  const onPointerCancel = e => { if (e.pointerId === g.current.id) finish(true) }

  // Накрытие закрылось (или слайд размонтировался), пока палец на полосе, — скорость возвращаем к 1x
  useEffect(() => {
    const s = g.current
    const handlers = cb
    return () => {
      clearTimeout(s.timer)
      if (s.holding) handlers.current.onHoldEnd()
    }
  }, [])

  return (
    <div
      className="feedSlowStrip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-hidden="true"
    >
      {showHint && <SlowHint className="feedSlowHintCatch" />}
    </div>
  )
}
