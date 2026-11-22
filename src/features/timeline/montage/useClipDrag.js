import { useCallback, useEffect, useRef } from 'react'
import { snap, clampTo } from './montageEdits.js'

// Перетаскивание клипа по горизонтали в режиме «Правка» — на pointer events, без библиотек (мышь и палец). Клип тянут за него самого: меняется зазор перед ним.
//  • begin(key) → { from (зазор сейчас, мс), min, max, why } или null (клип двигать нельзя) — пределы считает вызывающий (montageEdits.limitsFor);
//  • move(key, { to, hit, why }) — каждый кадр движения: зазор стал to; hit: 'min' | 'max' — упёрся (why — почему);
//  • end(key, to | null) — отпустили: to — итоговый зазор; null — отмена (Esc, pointercancel) или это был просто щелчок (сдвиг меньше CLICK_PX) → click(key).
// Привязка к шагу SNAP_MS; с Shift — свободно. scale — px на мс (ref.current читается на каждом движении: масштаб мог смениться).
export const CLICK_PX = 4

export function useClipDrag({ enabled, scale, begin, move, end, click }) {
  const cb = useRef({})
  useEffect(() => { cb.current = { scale, begin, move, end, click } })
  const drag = useRef(null)

  const stop = useCallback(commit => {
    const d = drag.current; if (!d) return
    drag.current = null
    window.removeEventListener('pointermove', d.onMove); window.removeEventListener('pointerup', d.onUp); window.removeEventListener('pointercancel', d.onCancel); window.removeEventListener('keydown', d.onKey, true)
    if (!d.moved) { cb.current.end?.(d.key, null); if (commit) cb.current.click?.(d.key); return }
    cb.current.end?.(d.key, commit ? d.to : null)
  }, [])
  useEffect(() => () => stop(false), [stop])

  return useCallback((e, key) => {
    if (!enabled || e.button > 0 || drag.current) return false
    const lim = cb.current.begin?.(key)
    if (!lim) return false
    e.preventDefault(); e.stopPropagation()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* захват указателя не обязателен */ }
    const d = { key, x0: e.clientX, lim, to: lim.from, moved: false }
    d.onMove = ev => {
      const dx = ev.clientX - d.x0
      if (!d.moved && Math.abs(dx) < CLICK_PX) return
      d.moved = true
      const raw = lim.from + dx / cb.current.scale, r = clampTo(lim, ev.shiftKey ? raw : snap(raw))
      d.to = r.to
      cb.current.move?.(key, { to: r.to, hit: r.hit, why: r.hit === 'min' ? lim.why : r.hit })
    }
    d.onUp = () => stop(true)
    d.onCancel = () => stop(false)
    d.onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stop(false) } }
    drag.current = d
    window.addEventListener('pointermove', d.onMove); window.addEventListener('pointerup', d.onUp); window.addEventListener('pointercancel', d.onCancel); window.addEventListener('keydown', d.onKey, true)
    return true
  }, [enabled, stop])
}
