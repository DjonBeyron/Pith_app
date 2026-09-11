import { useEffect } from 'react'
import { clampScale, zoomAtPoint } from './canvasZoom.js'
import { isTextZone } from './canvasDragGuard.js'

// Управление холстом пальцами. До этого канвас жил только на мыши: панорама
// была на средней кнопке, зум — на колесе, а на телефоне ни того, ни другого
// нет, и доску нельзя было ни подвинуть, ни приблизить.
//
//  · один палец по пустому месту — панорама;
//  · два пальца — щипок: масштаб вокруг середины между ними плюс сдвиг на её
//    перемещение (двумя пальцами естественно и тащить, и масштабировать разом);
//  · палец, начавшийся НА НОДЕ или в поле ввода, доску не двигает — иначе
//    нельзя было бы ни нажать ноду, ни поставить курсор в текст.
//
// Арифметика та же, что у колеса (canvasZoom.js): точка под пальцами остаётся
// под пальцами. Отдельный хук, а не ветка в useCanvasDrag: там своя модель
// «кнопки мыши + порог протяжки», и смешивать её с мультитачем значит
// переписать оба.
//
// touchmove слушается с passive: false — без этого браузер не отдаёт
// preventDefault и страница уезжает вместе с холстом.

const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const mid  = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

export function useCanvasTouch(boardRef, boardRectRef, scaleRef, setScale, setOffset) {
  useEffect(() => {
    const el = boardRef.current
    if (!el) return

    let mode = null        // null | 'pan' | 'pinch'
    let last = null        // последняя точка (палец или середина щипка)
    let lastDist = 0

    // Прямоугольник доски берём заново на каждом старте жеста: кэш общий с
    // протяжкой и мог устареть — доска съезжает, когда меняется высота шапки
    const freshRect = () => {
      const r = el.getBoundingClientRect()
      boardRectRef.current = r
      return r
    }

    function onStart(e) {
      if (e.touches.length >= 2) {
        mode = 'pinch'
        last = mid(e.touches[0], e.touches[1])
        lastDist = dist(e.touches[0], e.touches[1])
        freshRect()
        return
      }
      const t = e.touches[0]
      if (!t) return
      const onNode = t.target?.closest?.('.canvasNodeWrapper')
      if (onNode || isTextZone(t.target)) { mode = null; return }
      mode = 'pan'
      last = { x: t.clientX, y: t.clientY }
      freshRect()
    }

    function onMove(e) {
      if (!mode) return

      if (mode === 'pinch' && e.touches.length >= 2) {
        e.preventDefault()
        const r = boardRectRef.current
        const m = mid(e.touches[0], e.touches[1])
        const d = dist(e.touches[0], e.touches[1])
        const cur  = scaleRef.current
        const next = clampScale(cur * (lastDist > 0 ? d / lastDist : 1))
        const dx = m.x - last.x
        const dy = m.y - last.y
        // Сначала масштаб вокруг середины, затем сдвиг на её перемещение —
        // обе правки одним setOffset, иначе между ними успевает отрисоваться
        // промежуточный кадр и щипок дёргается
        setOffset(o => {
          const z = zoomAtPoint(o, cur, next, m.x - r.left, m.y - r.top)
          return { x: z.x + dx, y: z.y + dy }
        })
        if (next !== cur) { scaleRef.current = next; setScale(next) }
        last = m
        lastDist = d
        return
      }

      if (mode === 'pan' && e.touches.length === 1) {
        e.preventDefault()
        const t = e.touches[0]
        const dx = t.clientX - last.x
        const dy = t.clientY - last.y
        setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
        last = { x: t.clientX, y: t.clientY }
      }
    }

    function onEnd(e) {
      if (e.touches.length === 0) { mode = null; last = null; lastDist = 0; return }
      // Из щипка убрали палец — оставшийся продолжает как панорама, без рывка:
      // точку отсчёта переставляем на него
      if (e.touches.length === 1) {
        mode = 'pan'
        last = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        lastDist = 0
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [boardRef, boardRectRef, scaleRef, setScale, setOffset])
}
