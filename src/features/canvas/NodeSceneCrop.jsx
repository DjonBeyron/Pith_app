import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import SceneRenderer from '../scene/v2/SceneRenderer.jsx'
import { isSolo } from '../scene/v2/scenePit.js'
import { normalizeSceneCrop, isDefaultCrop, SCENE_CROP_LIMITS, SCENE_CROP_REF_W } from '../scene/v2/sceneNodeCrop.js'
import { sceneBubbleCropStyle } from '../scene/v2/sceneCropStyle.js'
import { sceneCircleFit } from '../player/modules/scene/sceneCircleFit.js'
import { useCropGestures } from './useCropGestures.js'
import NodeCropControls from './NodeCropControls.jsx'

// Масштаб и положение сцены в ноде (typeData.scene.crop) — ТОТ ЖЕ редактор, что у видео/кружка (NodeMediaCrop):
// рамка с живым превью, перетаскивание пальцем/мышью сдвигает кадр, колесо и ± масштабируют, плюс ползунок
// и «сбросить» (общее: useCropGestures.js, NodeCropControls.jsx). Превью считается ТЕМИ ЖЕ функциями, что плеер:
// кружок — sceneCircleFit (внутри круга), пузырь/полный экран — sceneBubbleCropStyle (внутри рамки 9:16),
// поэтому в плеере получится ровно то, что видно здесь. Единицы x/y — px кадра шириной 200 (sceneNodeCrop.js),
// рамка превью меряется и переводится в них (unit). Умолчание не пишется в данные (crop: undefined).
const FRAME_PX = { circle: 150, bubble: 112 }

export default function NodeSceneCrop({ tData, scene, mode, onChange }) {
  const crop = useMemo(() => normalizeSceneCrop(tData?.crop), [tData?.crop])
  const [w, setW] = useState(FRAME_PX[mode] ?? 150)
  const circle = mode === 'circle'
  const frameRef = useRef(null)
  const g = useCropGestures({
    frameRef, crop, attachKey: mode, unit: (w || FRAME_PX.circle) / SCENE_CROP_REF_W,
    limits: { min: SCENE_CROP_LIMITS.scaleMin, max: SCENE_CROP_LIMITS.scaleMax },
    onCropChange: c => { const n = normalizeSceneCrop(c); onChange({ crop: isDefaultCrop(n) ? undefined : n }) },
  })
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const set = () => setW(el.clientWidth)
    set()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  const preview = (
    <SceneRenderer scene={scene} mode="static" frameIndex={0} showBubbles={circle ? false : tData?.showBubbles !== false} display={circle ? 'none' : tData?.display} lite />
  )
  return (
    <div className="nodeSceneCrop" aria-label="Масштаб и положение сцены">
      <div className="nodeSceneCropLabel">Масштаб и положение</div>
      <div
        ref={frameRef} {...g.frameProps} data-scene-crop={mode}
        className={`mediaCropFrame nodeSceneCropFrame nodeSceneCropFrame--${mode}${circle ? ' mediaCropFrameCircle' : ''}`}
        style={{ width: FRAME_PX[mode] + 'px' }}
      >
        {circle
          ? <div className="playerSceneCircleInner" style={sceneCircleFit(w, { solo: isSolo(scene), crop })}>{preview}</div>
          : <div className="playerSceneCrop" style={sceneBubbleCropStyle(crop) ?? { position: 'absolute', inset: 0 }}>{preview}</div>}
      </div>
      <NodeCropControls
        scale={crop.scale} onZoom={g.zoomBy} onReset={g.reset}
        slider={{ min: SCENE_CROP_LIMITS.scaleMin, max: SCENE_CROP_LIMITS.scaleMax, step: 0.05, onChange: g.setScale }}
      />
      <p className="nodeSceneHint">
        Тяните сцену — сдвиг, колесо мыши или ползунок — масштаб. Так будет и в кружке, и в пузыре, и на весь экран;
        «сбросить» — как раньше.
      </p>
    </div>
  )
}
