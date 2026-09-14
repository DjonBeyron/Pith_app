import { useState } from 'react'
import { rectFromDrag } from './zoneOps.js'

// Рисование новой зоны протяжкой — тот же приём, что рамка выделения
// (useCanvasSelection.js: startMarquee/updateMarquee/endMarquee), но вместо
// подсветки нод под курсором результат протяжки становится новой зоной.
//
// В отличие от marquee (там рамка живёт в экранных пикселях — своя причина,
// см. комментарий у .canvasMarquee), черновик зоны сразу переводится в
// мировые координаты через toWorld: так его можно рисовать внутри того же
// трансформированного слоя, что и сами зоны (ZonesLayer.jsx), не гадая
// отдельно с офсетом/масштабом холста.
export function useZoneDraw() {
  const [draft, setDraft] = useState(null) // { x0, y0, x1, y1 } — мировые координаты

  function startZoneDraw(e, toWorld) {
    const p = toWorld(e.clientX, e.clientY)
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  function updateZoneDraw(e, toWorld) {
    if (!draft) return false
    const p = toWorld(e.clientX, e.clientY)
    setDraft(d => ({ ...d, x1: p.x, y1: p.y }))
    return true
  }

  // onCreate(zone) вызывается, только если протяжка была не крошечной
  // (см. MIN_DRAG в zoneOps.js) — иначе обычный клик плодил бы зоны-точки
  function endZoneDraw(onCreate) {
    if (!draft) return false
    const zone = rectFromDrag({ x: draft.x0, y: draft.y0 }, { x: draft.x1, y: draft.y1 })
    setDraft(null)
    if (zone) onCreate(zone)
    return true
  }

  return { zoneDraft: draft, startZoneDraw, updateZoneDraw, endZoneDraw }
}
