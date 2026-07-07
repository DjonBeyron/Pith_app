import { useEffect } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Лёгкий дебаг жеста ленты: на время касания фиксируем стартовую точку пальца
// и позицию видео, на touchend пишем в лог смещения — горизонтальное (нет ли
// паразитного сдвига влево/вправо), вертикальное и куда уехал сам <video>.
// reattachKey перевешивает слушатели, когда контейнер появляется/меняется.
export function useDragDebug(scrollRef, reattachKey) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let sx = 0, sy = 0, sLeft = 0, sTop = 0, vLeft = 0
    let maxDX = 0, maxDY = 0, maxScrollLeft = 0
    const video = () => document.querySelector('.sharedVideo')

    function start(e) {
      const t = e.touches?.[0]
      if (!t) return
      sx = t.clientX; sy = t.clientY
      sLeft = el.scrollLeft; sTop = el.scrollTop
      vLeft = video()?.getBoundingClientRect().left ?? 0
      maxDX = 0; maxDY = 0; maxScrollLeft = Math.abs(el.scrollLeft)
      fdbg(`drag start: touch=(${sx.toFixed(0)},${sy.toFixed(0)}) vLeft=${vLeft.toFixed(2)}`)
    }
    function move(e) {
      const t = e.touches?.[0]
      if (!t) return
      maxDX = Math.max(maxDX, Math.abs(t.clientX - sx))
      maxDY = Math.max(maxDY, Math.abs(t.clientY - sy))
      maxScrollLeft = Math.max(maxScrollLeft, Math.abs(el.scrollLeft))
    }
    function end() {
      const vdx = (video()?.getBoundingClientRect().left ?? vLeft) - vLeft
      fdbg(
        `drag end: пальцем dx=${maxDX.toFixed(0)} dy=${maxDY.toFixed(0)} | ` +
        `scrollLeftΔ=${(el.scrollLeft - sLeft).toFixed(2)} maxScrollLeft=${maxScrollLeft.toFixed(2)} ` +
        `scrollTopΔ=${(el.scrollTop - sTop).toFixed(0)} | видео left сдвиг=${vdx.toFixed(2)}`,
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
