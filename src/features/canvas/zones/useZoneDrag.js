import { useCallback } from 'react'
import { applyZoneMove, applyZoneResize } from './zoneOps.js'

// Перетаскивание и растягивание существующей зоны — тот же приём, что у
// стикера комментария продакшена (useNoteBoxDrag.js): слушатели вешаются на
// window на время протяжки, а не через общий drag-стейт доски (зона не нода,
// своя протяжка ей не мешает). Экранные пиксели делим на текущий scale холста:
// зона живёт в тех же мировых координатах, что и ноды (node.x/y), а не в
// CSS-пикселях родителя, поэтому важен именно scaleRef, а не offsetLeft/Top.
export function useZoneDrag({ scaleRef, onChange }) {
  const start = useCallback((zone, e, dir) => {
    e.preventDefault()
    e.stopPropagation()
    const from = { x: zone.x, y: zone.y, width: zone.width, height: zone.height }
    const startX = e.clientX
    const startY = e.clientY

    const onMove = mv => {
      const s = scaleRef?.current ?? 1
      const dx = (mv.clientX - startX) / s
      const dy = (mv.clientY - startY) / s
      onChange(zone.id, dir === 'move' ? applyZoneMove(from, dx, dy) : applyZoneResize(from, dir, dx, dy))
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
  }, [scaleRef, onChange])

  return start
}
