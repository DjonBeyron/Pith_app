import { useRef, useLayoutEffect } from 'react'
import SlideScene from '../../../feed/scene/SlideScene.jsx'
import { applyFeedFrame } from '../../../feed/scene/useFeedFrame.js'
import { dragFeedFrame } from '../../../feed/scene/feedFrameCalc.js'
import FeedSlideLayers from './FeedSlideLayers.jsx'
import FeedZonePlates from './FeedZonePlates.jsx'
import { previewSlideSpec } from './feedFrameModel.js'

// Слайд ленты в масштабе колонки: настоящий SlideScene (тот же кадр, что в ленте) в настоящем .feedSlide нужного размера,
// поверх — слои ленты (FeedSlideLayers), плашки опасных зон (FeedZonePlates) и слой перетаскивания (pointer events: мышь и
// палец). Пока сцену тащат, новый кадр пишется прямо в CSS-переменные корня сцены (applyFeedFrame) — без перерисовки React;
// в черновик сцены он уходит по отпусканию (onCommit). frame — текущий кадр (локальный), calc — previewCalc(device, frame).
export default function FeedFramePreview({ scene, device, frame, calc, zoom, lineIndex, showZones, onDrag, onCommit }) {
  const boxRef = useRef(null)
  const dragRef = useRef(null)
  const spec = previewSlideSpec(device)

  // Кадр из локального состояния → DOM сцены (SlideScene сам применяет кадр сцены при монтировании и смене сохранённого)
  useLayoutEffect(() => {
    const el = boxRef.current?.querySelector('.slideSceneRoot')
    if (el) applyFeedFrame(el, frame)
  }, [frame, device])

  function down(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, frame }
  }
  function move(e) {
    const d = dragRef.current
    if (!d) return
    onDrag(dragFeedFrame(d.frame, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom, { w: spec.w, h: spec.h }))
  }
  function up() {
    if (!dragRef.current) return
    dragRef.current = null
    onCommit()
  }

  return (
    <div className="ffpBox" ref={boxRef} style={{ width: spec.w * zoom, height: spec.h * zoom }}>
      <div className="ffpScale" style={{ ...spec.style, transform: `scale(${zoom})` }}>
        <section className="feedSlide ffpSlide" data-device={device.id}>
          <SlideScene scene={scene} slideKey={-1} near frameIndex={lineIndex} />
          <FeedSlideLayers />
          {showZones && <FeedZonePlates zones={calc.zones} hit={calc.warnings.map(x => x.zone)} />}
          <div
            className="ffpDrag" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            title="Перетащите сцену мышью или пальцем" role="presentation"
          />
        </section>
      </div>
    </div>
  )
}
