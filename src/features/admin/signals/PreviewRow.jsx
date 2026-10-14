import { signalById } from '../../../shared/lib/ranking/signalRegistry.js'
import { shiftLabel } from './orderDiff.js'
import { GROUP_COLORS } from './signalTexts.js'
import HelpTip from './HelpTip.jsx'

// Одна фраза предпросмотра: позиция, заголовок, метки сдвига (к активной / к legacy),
// полоса score, разложенная на вклады сигналов (цвета групп), до 3 причин.
export default function PreviewRow({ item, pos, mode, vsActive, vsLegacy, changed }) {
  const { module, score, parts, reasons } = item
  const hasScore = typeof score === 'number'
  const a = mode === 'active' ? '' : shiftLabel(vsActive)
  const l = mode === 'legacy' ? '' : shiftLabel(vsLegacy)
  const segs = parts.filter(p => p.contribution > 0)
  const barTitle = segs.map(p => `${p.title}: ${p.value.toFixed(2)} × ${Math.round(p.weight * 100)}% = ${p.contribution.toFixed(2)}`).join('\n')

  return (
    <li className={changed ? 'fpRow fpRowChanged' : 'fpRow'}>
      <span className="fpPos" aria-label={`Позиция ${pos}`}>{pos}</span>
      <div className="fpMain">
        <div className="fpTitleLine">
          <span className="fpTitle">{module.title || module.id}</span>
          <span className="fpShifts">
            {a && <span className={`fpShift ${a.startsWith('↑') ? 'fpUp' : a.startsWith('↓') ? 'fpDown' : 'fpNew'}`} title="Сдвиг относительно активной версии">акт. {a}</span>}
            {l && <span className={`fpShift ${l.startsWith('↑') ? 'fpUp' : l.startsWith('↓') ? 'fpDown' : 'fpNew'}`} title="Сдвиг относительно legacy">legacy {l}</span>}
            {(a || l) && <HelpTip help="shift_tag" />}
          </span>
        </div>
        {hasScore ? (
          <div className="fpScoreLine">
            <div className="fpBar" role="img" aria-label={`Итог ${score.toFixed(2)}`} title={barTitle}>
              {segs.map(p => (
                <span key={p.id} className="fpSeg" style={{ width: `${p.contribution * 100}%`, background: GROUP_COLORS[signalById(p.id)?.group] ?? '#888' }} />
              ))}
            </div>
            <HelpTip help="preview_bar" />
            <span className="fpScore">{score.toFixed(2)}</span>
            <HelpTip help="preview_score" />
          </div>
        ) : (
          <p className="fpNoScore">legacy: порядок по ступеням памяти, без весов<HelpTip help="preview_legacy_note" /></p>
        )}
        {reasons.length > 0 && (
          <ul className="fpReasons">
            {reasons.slice(0, 3).map((r, i, arr) => <li key={r}>{r}{i === arr.length - 1 && <HelpTip help="preview_reasons" />}</li>)}
          </ul>
        )}
      </div>
    </li>
  )
}
