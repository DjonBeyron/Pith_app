import ScTip from '../ScTip.jsx'
import { FEED_FRAME_LIMITS, FEED_FRAME_ANCHORS } from '../../../scene/v2/sceneFeedFrame.js'
import { FEED_DEVICES } from '../../../feed/scene/feedSlideGeometry.js'

// Органы управления кадром в ленте: размер экрана, масштаб, сдвиг X/Y, якорь, «Сбросить», зоны. Только вид — состояние
// и запись в сцену у FeedFramePanel. «?» — scenesHelpFeed.js.
const ANCHOR_LABEL = { top: 'Верх', center: 'Центр', bottom: 'Низ' }
const L = FEED_FRAME_LIMITS

function Slider({ id, label, help, value, min, max, step, onChange, fmt }) {
  return (
    <label className="scbField ffpSlider" id={id}>
      <span className="scbFieldLabel">{label} <ScTip help={help} /></span>
      <span className="ffpSliderRow">
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} />
        <output>{fmt(value)}</output>
      </span>
    </label>
  )
}

export default function FeedFrameControls({ device, onDevice, frame, onChange, onReset, isDefault, showZones, onZones }) {
  const set = patch => onChange({ ...frame, ...patch })
  return (
    <div className="ffpControls">
      <div className="scbField">
        <span className="scbFieldLabel">Экран <ScTip help="feed_frame_device" /></span>
        <div className="scSegBtns ffpDevices" role="radiogroup" aria-label="Размер экрана">
          {FEED_DEVICES.map(d => (
            <button key={d.id} type="button" role="radio" aria-checked={device.id === d.id} className={device.id === d.id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => onDevice(d.id)}>{d.label}</button>
          ))}
        </div>
      </div>
      <Slider id="f-options-feedFrame-scale" label="Масштаб" help="feed_frame_scale" value={frame.scale} min={L.scaleMin} max={L.scaleMax} step={0.01} onChange={v => set({ scale: v })} fmt={v => `×${v.toFixed(2)}`} />
      <Slider id="f-options-feedFrame-x" label="Сдвиг по горизонтали (X)" help="feed_frame_shift" value={frame.x} min={L.shiftMin} max={L.shiftMax} step={0.01} onChange={v => set({ x: v })} fmt={v => v.toFixed(2)} />
      <Slider id="f-options-feedFrame-y" label="Сдвиг по вертикали (Y)" help="feed_frame_shift" value={frame.y} min={L.shiftMin} max={L.shiftMax} step={0.01} onChange={v => set({ y: v })} fmt={v => v.toFixed(2)} />
      <div className="scbField" id="f-options-feedFrame-anchor">
        <span className="scbFieldLabel">Якорь <ScTip help="feed_frame_anchor" /></span>
        <div className="scSegBtns" role="radiogroup" aria-label="Якорь кадра">
          {FEED_FRAME_ANCHORS.map(a => (
            <button key={a} type="button" role="radio" aria-checked={frame.anchor === a} className={frame.anchor === a ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => set({ anchor: a })}>{ANCHOR_LABEL[a]}</button>
          ))}
        </div>
      </div>
      <div className="scbCtlRow">
        <button type="button" className="fsBtn" onClick={onReset} disabled={isDefault}>Сбросить</button>
        <label className="scCheck"><input type="checkbox" checked={showZones} onChange={e => onZones(e.target.checked)} /> опасные зоны</label>
        <ScTip help="feed_frame_zones" />
      </div>
    </div>
  )
}
