import { useEffect, useRef } from 'react'

// Жесты рамки кадрирования — общие для NodeMediaCrop (фото/видео/кружок/стикер) и NodeSceneCrop (сцена):
// перетаскивание мышью/пальцем сдвигает кадр, колесо мыши масштабирует (wheel с passive:false — иначе
// preventDefault не работает), кнопки ± и «сбросить» — через zoomBy/reset. crop = { x, y, scale }.
// unit — сколько px экрана в одной единице crop.x/y (у видео 1: сдвиг в px рамки; у сцены рамка в редакторе
// меньше эталонной 200 px, поэтому unit = ширина_рамки / 200 — sceneNodeCrop.js). limits — границы scale.
// attachKey — любое значение, при смене которого рамка могла пересоздаться (колесо перевешивается).
// frameRef — ref рамки создаёт вызывающий (useRef) и передаёт сюда: колесо вешается на него. Возвращает frameProps
// (обработчики мыши/касаний — раскладываются на рамку), zoomBy / setScale / reset.
export const MEDIA_CROP_LIMITS = Object.freeze({ min: 0.15, max: 6 })
const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

export function useCropGestures({ frameRef, crop, onCropChange, unit = 1, limits = MEDIA_CROP_LIMITS, attachKey = null }) {
  const dragRef = useRef(null)
  const cropRef = useRef(crop)
  const changeRef = useRef(onCropChange)
  const limitsRef = useRef(limits)
  useEffect(() => { cropRef.current = crop }, [crop])
  useEffect(() => { changeRef.current = onCropChange }, [onCropChange])
  useEffect(() => { limitsRef.current = limits }, [limits])

  const clampScale = v => Math.min(limitsRef.current.max, Math.max(limitsRef.current.min, v))

  // Колесо мыши — масштаб; passive:false нужен ради preventDefault
  useEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    function onWheel(e) {
      e.preventDefault()
      const cur = cropRef.current
      changeRef.current({ ...cur, scale: clampScale(cur.scale * (e.deltaY > 0 ? 0.9 : 1.1)) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachKey])

  const startDrag = (cx, cy) => { dragRef.current = { sx: cx, sy: cy, ox: crop.x, oy: crop.y } }
  const moveDrag = (cx, cy) => {
    const d = dragRef.current
    if (!d) return
    onCropChange({ ...crop, x: d.ox + (cx - d.sx) / unit, y: d.oy + (cy - d.sy) / unit })
  }
  const endDrag = () => { dragRef.current = null }

  const frameProps = {
    onMouseDown: e => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY) },
    onMouseMove: e => moveDrag(e.clientX, e.clientY),
    onMouseUp: endDrag,
    onMouseLeave: endDrag,
    onTouchStart: e => { if (e.touches.length === 1) { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY) } },
    onTouchMove: e => { if (e.touches.length === 1) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) } },
    onTouchEnd: endDrag,
  }
  return {
    frameProps,
    zoomBy: factor => onCropChange({ ...crop, scale: clampScale(crop.scale * factor) }),
    setScale: v => onCropChange({ ...crop, scale: clampScale(v) }),
    reset: () => onCropChange({ ...DEFAULT_CROP }),
  }
}
