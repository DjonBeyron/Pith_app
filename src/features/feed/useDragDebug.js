import { useEffect } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Дебаг «дёрганья» ленты при перетаскивании: на время касания фиксируем
// стартовую точку пальца и позицию видео, а на touchmove/touchend пишем
// в лог реальные смещения — по горизонтали (паразитный сдвиг влево/вправо),
// по вертикали и насколько уехал сам <video>. Так в отчёте DBG видно, есть
// ли горизонтальный скролл контейнера и прыгает ли видео во время жеста.
// reattachKey перевешивает слушатели, когда контейнер появляется/меняется.
export function useDragDebug(scrollRef, reattachKey) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let sx = 0, sy = 0, sLeft = 0, sTop = 0, vLeft = 0, vTop = 0
    let maxDX = 0, maxDY = 0, maxScrollLeft = 0
    const video = () => document.querySelector('.sharedVideo')

    function start(e) {
      const t = e.touches?.[0]
      if (!t) return
      sx = t.clientX; sy = t.clientY
      sLeft = el.scrollLeft; sTop = el.scrollTop
      const r = video()?.getBoundingClientRect()
      vLeft = r?.left ?? 0; vTop = r?.top ?? 0
      maxDX = 0; maxDY = 0; maxScrollLeft = Math.abs(el.scrollLeft)
      fdbg(`drag start: touch=(${sx.toFixed(0)},${sy.toFixed(0)}) scrollLeft=${sLeft.toFixed(1)} vLeft=${vLeft.toFixed(1)}`)
    }
    function move(e) {
      const t = e.touches?.[0]
      if (!t) return
      maxDX = Math.max(maxDX, Math.abs(t.clientX - sx))
      maxDY = Math.max(maxDY, Math.abs(t.clientY - sy))
      maxScrollLeft = Math.max(maxScrollLeft, Math.abs(el.scrollLeft))
    }
    function end() {
      const r = video()?.getBoundingClientRect()
      const vdx = (r?.left ?? vLeft) - vLeft
      const vdy = (r?.top ?? vTop) - vTop
      fdbg(
        `drag end: пальцем dx=${maxDX.toFixed(0)} dy=${maxDY.toFixed(0)} | ` +
        `scrollLeftΔ=${(el.scrollLeft - sLeft).toFixed(1)} maxScrollLeft=${maxScrollLeft.toFixed(1)} ` +
        `scrollTopΔ=${(el.scrollTop - sTop).toFixed(0)} | ` +
        `видео сдвинулось left=${vdx.toFixed(1)} top=${vdy.toFixed(1)} | ` +
        `overflowX=${(el.scrollWidth - el.clientWidth).toFixed(1)}`,
      )
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [scrollRef, reattachKey])
}
