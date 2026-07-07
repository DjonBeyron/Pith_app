import { useEffect } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Дебаг «дёрганья» ленты при перетаскивании. Ключевое: сам твич видео по X
// случается ПОСЛЕ отрыва пальца — во время доводки scroll-snap. Поэтому мало
// мерить старт/конец жеста, нужен сэмплер доводки: после touchend гоняем rAF
// и каждый кадр читаем rect.left/top общего <video> с точностью до сотых,
// пока скролл не успокоится. Так видно, реально ли X-координата видео
// прыгает на settle (и когда), и совпадает ли это с переносом элемента
// в новый слайд (REPARENT). reattachKey перевешивает слушатели при появлении
// контейнера.
export function useDragDebug(scrollRef, reattachKey) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let sx = 0, sy = 0, sLeft = 0, sTop = 0, vLeft = 0
    let maxDX = 0, maxDY = 0, maxScrollLeft = 0
    let settling = false
    const video = () => document.querySelector('.sharedVideo')

    // Сэмплер доводки: ловим X-сдвиг видео покадрово, пока scrollTop не замрёт
    function trackSettle() {
      if (settling) return
      settling = true
      const t0 = performance.now()
      let pLeft = null, pParent = null, pScroll = el.scrollTop
      let stableSince = t0
      const ev = []
      function frame() {
        const now = performance.now()
        const v = video()
        if (v) {
          const r = v.getBoundingClientRect()
          if (pLeft !== null && Math.abs(r.left - pLeft) > 0.02) {
            ev.push(`+${(now - t0).toFixed(0)}ms Δx=${(r.left - pLeft).toFixed(2)} left=${r.left.toFixed(2)}`)
          }
          if (pParent && v.parentElement !== pParent) {
            ev.push(`+${(now - t0).toFixed(0)}ms REPARENT`)
          }
          pLeft = r.left; pParent = v.parentElement
        }
        if (Math.abs(el.scrollTop - pScroll) > 0.5) stableSince = now
        pScroll = el.scrollTop
        // Крутимся, пока скролл не стоит 160мс подряд (но не дольше 1.6с)
        if (now - stableSince < 160 && now - t0 < 1600) {
          requestAnimationFrame(frame)
        } else {
          settling = false
          fdbg(ev.length
            ? `settle X-дёрг: ${ev.join(' | ')}`
            : `settle: X стабилен (left=${pLeft?.toFixed(2)}) длит=${(now - t0).toFixed(0)}ms`)
        }
      }
      requestAnimationFrame(frame)
    }

    function start(e) {
      const t = e.touches?.[0]
      if (!t) return
      sx = t.clientX; sy = t.clientY
      sLeft = el.scrollLeft; sTop = el.scrollTop
      const r = video()?.getBoundingClientRect()
      vLeft = r?.left ?? 0
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
      const r = video()?.getBoundingClientRect()
      const vdx = (r?.left ?? vLeft) - vLeft
      fdbg(
        `drag end: пальцем dx=${maxDX.toFixed(0)} dy=${maxDY.toFixed(0)} | ` +
        `scrollLeftΔ=${(el.scrollLeft - sLeft).toFixed(2)} maxScrollLeft=${maxScrollLeft.toFixed(2)} ` +
        `scrollTopΔ=${(el.scrollTop - sTop).toFixed(0)} | видео left сдвиг=${vdx.toFixed(2)}`,
      )
      trackSettle() // ← ловим X-твич во время доводки snap (после отрыва пальца)
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
