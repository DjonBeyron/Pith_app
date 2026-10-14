import { PALETTE_PRESETS } from '../../scene/v2/sceneConstants.js'
import { matchPreset } from './builderModel.js'
import { PRESET_LABEL, PALETTE_KEYS } from './sceneLabels.js'
import ScTip from './ScTip.jsx'

// Палитра кота: пресеты (кружки цветом шерсти) + пять полей цвета. Используется в
// галерее спрайтов (CatControls) и в форме персонажа сборщика (CharacterForm).
// idPrefix — чтобы поля получали id вида f-characters-a-palette-fur (подсветка линтера).

export default function PaletteEditor({ palette, onPreset, onColor, idPrefix = 'pal', compact = false }) {
  const current = matchPreset(palette)
  return (
    <div className="scPalette" id={`${idPrefix}`}>
      <div className="scPaletteHead">
        <span className="scLabel">Палитра</span> <ScTip help="palette" />
        <div className="scPresets" role="radiogroup" aria-label="Готовые палитры">
          {Object.entries(PALETTE_PRESETS).map(([id, p]) => (
            <button
              key={id} type="button" role="radio" aria-checked={current === id} className={current === id ? 'scPreset scPresetOn' : 'scPreset'}
              style={{ '--c': p.fur, '--c2': p.belly }} onClick={e => { e.stopPropagation(); onPreset(id) }} title={PRESET_LABEL[id]} aria-label={`Пресет ${PRESET_LABEL[id]}`}
            />
          ))}
        </div>
      </div>
      {!compact && (
        <div className="scColors">
          {PALETTE_KEYS.map(([k, label]) => (
            <label key={k} className="scColor">
              <input id={`${idPrefix}-${k}`} type="color" value={palette?.[k] ?? '#000000'} onChange={e => onColor(k, e.target.value)} aria-label={`Цвет: ${label}`} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
