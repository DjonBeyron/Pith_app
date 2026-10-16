import { useEffect, useRef } from 'react'
import { useCircleExpand } from '../circle/useCircleExpand.js'

// Раскрытие кружка сцены тапом — ровно как у видео-кружка (circle/useCircleExpand.js): кружок плавно
// увеличивается на ширину рамки плеера (transform: translate + scale, предыдущие сообщения уезжают вверх,
// фон-подложка ловит тап «закрыть», свайп вниз на 80+ px закрывает), возврат на место тем же transform —
// без прыжков. Отличия от видео — только про сцену: тот же ЕДИНСТВЕННЫЙ живой SVG просто растёт (не клон,
// режиссёр и звук те же); раскрытие — это жест: звук открывается, сцена стартует/продолжается
// (onExpand = useScenePlayback.expandPlay); закрытие сцену не останавливает (звучит дальше в кружке).
// Дополнительно (в видео нет): Escape закрывает; сцена доиграла в раскрытом кружке — через 700 мс сам
// возвращается на место (у видео — handleEnded → collapse).
export const SCENE_COLLAPSE_AFTER_END_MS = 700

export function useSceneCircleExpand({ rootRef, size, bottomOffset, onExpand, status, enabled = true }) {
  const ex = useCircleExpand({ wrapRef: rootRef, dims: { w: size }, bottomOffset, onExpand })
  const { expanded } = ex
  // collapse в useCircleExpand — новая функция на каждый рендер: эффекты держат её через ref, таймер не перезапускается
  const collapseRef = useRef(ex.collapse)
  useEffect(() => { collapseRef.current = ex.collapse })

  useEffect(() => {
    if (!enabled || !expanded) return undefined
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); collapseRef.current() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, expanded])

  useEffect(() => {
    if (!expanded || status !== 'ended') return undefined
    const t = setTimeout(() => collapseRef.current(), SCENE_COLLAPSE_AFTER_END_MS)
    return () => clearTimeout(t)
  }, [expanded, status])

  return ex
}
