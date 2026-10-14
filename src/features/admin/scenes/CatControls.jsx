import { EMOTIONS, PALETTE_PRESETS } from '../../scene/v2/sceneConstants.js'
import { EMOTION_LABEL, MOUTH_LABEL, GENDER_LABEL } from './sceneLabels.js'
import PaletteEditor from './PaletteEditor.jsx'
import ScTip from './ScTip.jsx'

// Переключатели карточки кота в галерее: пол ♂/♀, эмоция, форма рта (визема), палитра.
// value — { gender, emotion, mouth, palette, stripes }; onChange получает новый объект.
const MOUTHS = Object.entries(MOUTH_LABEL)

function Seg({ label, options, value, onPick, tip }) {
  return (
    <div className="scSeg">
      <span className="scLabel">{label}</span>{tip && <ScTip help={tip} />}
      <div className="scSegBtns" role="radiogroup" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => onPick(id)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CatControls({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch })
  return (
    <div className="scCatCtl">
      <Seg label="Пол" options={Object.entries(GENDER_LABEL)} value={value.gender} onPick={gender => set({ gender })} />
      <Seg label="Эмоция" tip="emotion" options={EMOTIONS.map(e => [e, EMOTION_LABEL[e]])} value={value.emotion} onPick={emotion => set({ emotion })} />
      <Seg label="Рот" tip="viseme" options={MOUTHS} value={value.mouth} onPick={mouth => set({ mouth })} />
      <PaletteEditor
        palette={value.palette} idPrefix={`gal-${value.gender}`}
        onPreset={id => set({ palette: { ...PALETTE_PRESETS[id] } })}
        onColor={(k, v) => set({ palette: { ...value.palette, [k]: v } })}
      />
      <div className="scCheckRow">
        <label className="scCheck">
          <input type="checkbox" checked={value.stripes} onChange={e => set({ stripes: e.target.checked })} /> Полоски
        </label>
        <ScTip help="stripes" />
      </div>
    </div>
  )
}
