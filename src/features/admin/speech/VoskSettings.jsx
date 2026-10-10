import { STYLES, STYLE_LABEL } from './voskGrammar.js'
import { CONDS } from './voskSeries.js'
import { AUTOSTOP_PRESETS } from '../../../shared/lib/vosk/voskTiming.js'

// Настройки «Теста 3»: стиль словаря, условие записи (метка идёт в карточку и в итог), авто-стоп, аудиосессия iPhone
export default function VoskSettings({ state, patch, setAutoStop, busy }) {
  const chip = (on, label, onClick, key, tid) => <button key={key} className={`aspChip${on ? ' aspChipOn' : ''}`} disabled={busy} aria-pressed={on} data-testid={tid} onClick={onClick}>{label}</button>
  return (
    <div className="vkSettings">
      <div className="aspRow" role="group" aria-label="Стиль словаря"><span className="aspLabelInline">Словарь</span>
        {STYLES.map(s => chip(state.style === s, STYLE_LABEL[s], () => patch({ style: s }), s, `vk-style-${s}`))}</div>
      <div className="aspRow" role="group" aria-label="Как говорю"><span className="aspLabelInline">Как говорю</span>
        {CONDS.map(c => chip(state.cond === c.id, c.label, () => patch({ cond: c.id }), c.id, `vk-cond-${c.id}`))}</div>
      <div className="aspRow" role="group" aria-label="Авто-стоп"><span className="aspLabelInline">Авто-стоп</span>
        {AUTOSTOP_PRESETS.map(v => chip(state.autoStop === v, v ? `${v} мс` : 'выкл.', () => setAutoStop(v), v, `vk-auto-${v}`))}</div>
      <p className="aspHint">Авто-стоп: итог просим сами, когда текст не менялся столько мс после последнего слова; «Стоп» всегда работает.</p>
      <label className="apToggle"><input type="checkbox" checked={state.session} disabled={busy} onChange={e => patch({ session: e.target.checked })} />
        <span>Аудиосессия play-and-record на время записи (iPhone, S6)</span></label>
    </div>
  )
}
