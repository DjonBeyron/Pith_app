import { useRef, useState, useLayoutEffect } from 'react'
import ScTip from '../ScTip.jsx'
import FeedFramePreview from './FeedFramePreview.jsx'
import FeedFrameControls from './FeedFrameControls.jsx'
import '../../../../styles/admin-scenes-feedframe.css'
import { useFeedFrameDraft } from './useFeedFrameDraft.js'
import { deviceById, previewCalc, previewZoom, longestLineIndex } from './feedFrameModel.js'

// Содержимое центральной колонки сборщика в режиме «Как в ленте»: слайд ленты выбранного размера со слоями поверх сцены,
// перетаскивание, ползунки, предупреждение «коты под кнопкой / обрезаны». Значения пишутся в options.feedFrame черновика
// (actions.setFeedFrame). Применяется ТОЛЬКО к ленте — ноду урока, кружок и полный экран не трогает.
export default function FeedFramePanel({ scene, actions }) {
  const [deviceId, setDeviceId] = useState('iphone')
  const [showZones, setShowZones] = useState(true)
  const [pickedLine, setPickedLine] = useState(null)
  const [boxW, setBoxW] = useState(0)
  const wrapRef = useRef(null)
  const device = deviceById(deviceId)
  const { frame, change, commit, reset, isDefault } = useFeedFrameDraft(scene, actions.setFeedFrame)
  const calc = previewCalc(device, frame)
  const total = scene.timeline.length
  const line = Math.min(pickedLine ?? longestLineIndex(scene), Math.max(0, total - 1))

  // Ширина колонки → масштаб макета (ResizeObserver; в тестах/старых браузерах — один замер)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => setBoxW(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="ffpPanel">
      <div className="scbCtlRow">
        <label className="scbField scbFieldInline">
          <span className="scbFieldLabel">Реплика в облачке</span>
          <select className="fsNote" value={line} onChange={e => setPickedLine(Number(e.target.value))} aria-label="Реплика для облачка в предпросмотре">
            {scene.timeline.map((l, i) => <option key={i} value={i}>{i + 1}. {l.who.toUpperCase()}: {String(l.text).slice(0, 26)}{l.text.length > 26 ? '…' : ''}</option>)}
          </select>
        </label>
        <ScTip help="feed_frame" />
      </div>
      <div className="ffpStage" ref={wrapRef}>
        <FeedFramePreview
          scene={scene} device={device} frame={frame} calc={calc} zoom={previewZoom(device, boxW)} lineIndex={line}
          showZones={showZones} onDrag={f => change(f)} onCommit={commit}
        />
      </div>
      <div className={calc.warnings.length ? 'ffpVerdict ffpVerdictBad' : 'ffpVerdict ffpVerdictOk'} role="status" data-warn={calc.warnings.length}>
        {calc.warnings.length
          ? <>Внимание: {[...new Set(calc.warnings.map(w => w.text))].join('; ')}.</>
          : 'Коты видны целиком и не под кнопкой, HUD и фразой.'}
      </div>
      <FeedFrameControls
        device={device} onDevice={setDeviceId} frame={frame} onChange={f => change(f)} onReset={reset} isDefault={isDefault}
        showZones={showZones} onZones={setShowZones}
      />
    </div>
  )
}
