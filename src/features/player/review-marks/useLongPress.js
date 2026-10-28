import { useCallback, useEffect, useRef } from 'react'

// Долгое нажатие по сообщению в плеере (админ, телефон): палец/мышь не сдвинулись больше moveTolerance за ms → onFire(payload).
// Скролл ленты (сдвиг) и отпускание отменяют. После срабатывания следующий click по тому же месту гасится (тот же жест
// заканчивается тапом — иначе он открыл бы медиа/кнопку под пальцем). bind(payload) — обработчики на обёртку сообщения
export function useLongPress(onFire, { ms = 550, moveTolerance = 10 } = {}) {
  const fireRef = useRef(onFire)
  useEffect(() => { fireRef.current = onFire })
  const pressRef = useRef(null) // { x, y, timer }
  const swallowUntil = useRef(0)
  const cancel = () => { if (pressRef.current) { clearTimeout(pressRef.current.timer); pressRef.current = null } }
  return useCallback(payload => ({
    onPointerDown: e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      cancel()
      const x = e.clientX, y = e.clientY
      pressRef.current = { x, y, timer: setTimeout(() => { pressRef.current = null; swallowUntil.current = Date.now() + 700; fireRef.current(payload) }, ms) }
    },
    onPointerMove: e => { const p = pressRef.current; if (p && (Math.abs(e.clientX - p.x) > moveTolerance || Math.abs(e.clientY - p.y) > moveTolerance)) cancel() },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: e => e.preventDefault(), // Android/Chrome: системное меню долгого нажатия
    onClickCapture: e => { if (Date.now() < swallowUntil.current) { e.stopPropagation(); e.preventDefault() } },
  }), [ms, moveTolerance])
}
