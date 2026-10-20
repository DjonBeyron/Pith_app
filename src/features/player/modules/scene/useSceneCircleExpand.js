import { useCallback, useEffect, useRef, useState } from 'react'
import { useCircleExpand } from '../circle/useCircleExpand.js'
import { SCENE_EXPAND_PLAY_DELAY_MS } from './sceneFullscreenModel.js'

// Раскрытие кружка сцены тапом — ровно как у видео-кружка (circle/useCircleExpand.js): кружок плавно
// увеличивается на ширину рамки плеера (transform: translate + scale, предыдущие сообщения уезжают вверх,
// фон-подложка ловит тап «закрыть», свайп вниз на 80+ px закрывает), возврат на место тем же transform —
// без прыжков. Отличия от видео — только про сцену: тот же ЕДИНСТВЕННЫЙ живой SVG просто растёт (не клон,
// режиссёр и звук те же); раскрытие — это жест: звук открывается, сцена стартует/продолжается
// (onExpand = useScenePlayback.expandPlay); закрытие сцену не останавливает (звучит дальше в кружке).
// Дополнительно (в видео нет): Escape закрывает; сцена доиграла в раскрытом кружке — через 700 мс сам
// возвращается на место (у видео — handleEnded → collapse).
// trace(msg) — трасса сцены (sceneTrace.js): решения по тапам (из useCircleExpand), Esc, авто-сворачивание, «дорос».
export const SCENE_COLLAPSE_AFTER_END_MS = 700

// grown — кружок «дорос»: через SCENE_EXPAND_PLAY_DELAY_MS после тапа (и до конца сворачивания). До этого доигравшая
// сцена остаётся лёгким статичным кадром: монтаж живого SVG (~190 узлов) в первом кадре роста стоил 170–210 мс на 4×–6×
// и анимация стояла (SceneCircleView: frozenEnded = ended && !(open && grown))
const COLLAPSE_MS = 500 // как collapseTimer в useCircleExpand
const NOOP = () => {}

export function useSceneCircleExpand({ rootRef, size, bottomOffset, onExpand, status, enabled = true, trace = NOOP }) {
  const [grown, setGrown] = useState(false)
  const growTimer = useRef(null)
  const traceRef = useRef(trace)
  useEffect(() => { traceRef.current = trace }, [trace])
  const onExpandGrow = useCallback(() => {
    if (growTimer.current) clearTimeout(growTimer.current)
    growTimer.current = setTimeout(() => { growTimer.current = null; traceRef.current('кружок дорос → живой SVG можно монтировать'); setGrown(true) }, SCENE_EXPAND_PLAY_DELAY_MS + 40)
    onExpand?.()
  }, [onExpand])
  const onCollapseGrow = useCallback(() => {
    if (growTimer.current) clearTimeout(growTimer.current)
    growTimer.current = setTimeout(() => { growTimer.current = null; setGrown(false) }, COLLAPSE_MS)
  }, [])
  useEffect(() => () => { if (growTimer.current) clearTimeout(growTimer.current) }, [])

  const ex = useCircleExpand({ wrapRef: rootRef, dims: { w: size }, bottomOffset, onExpand: onExpandGrow, onCollapse: onCollapseGrow, onTrace: trace })
  const { expanded } = ex
  // collapse в useCircleExpand — новая функция на каждый рендер: эффекты держат её через ref, таймер не перезапускается
  const collapseRef = useRef(ex.collapse)
  useEffect(() => { collapseRef.current = ex.collapse })

  useEffect(() => {
    if (!enabled || !expanded) return undefined
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); collapseRef.current('Esc') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, expanded])

  // Раскрыт и статус 'ended' → свернуть через 700 мс. Внимание: тап по ДОИГРАВШЕМУ кружку тоже даёт эту пару (статус ещё 'ended',
  // пока живой рендерер не смонтирован и команда restart не дошла) — таймер должен быть отменён сменой статуса раньше, чем сработает
  useEffect(() => {
    if (!expanded || status !== 'ended') return undefined
    traceRef.current(`раскрыт при статусе ended → авто-сворачивание через ${SCENE_COLLAPSE_AFTER_END_MS} мс, если статус не сменится`)
    const armed = performance.now()
    const t = setTimeout(() => collapseRef.current('авто после конца сцены'), SCENE_COLLAPSE_AFTER_END_MS)
    return () => {
      clearTimeout(t)
      if (performance.now() - armed < SCENE_COLLAPSE_AFTER_END_MS) traceRef.current(`авто-сворачивание отменено через ${Math.round(performance.now() - armed)} мс`)
    }
  }, [expanded, status])

  return { ...ex, grown }
}
