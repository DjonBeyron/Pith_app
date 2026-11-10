import PillStandVoskWords from './PillStandVoskWords.jsx'
import { pastRows, rowMark } from './pillStandHistory.js'

// Прошлые цели под крупной строкой «Vosk: …» стенда пилюль (pillStandHistory.js): «#4 wonderful → Vosk: «wonderful» ✓ 320 мс», новая сверху, слова в цвете (как у текущей), «очистить» — единственный
// способ убрать строки (сами не стираются ни «Следующей», ни «авто»).
export default function PillStandHistory({ hist, onClear }) {
  const rows = pastRows(hist)
  if (!rows.length) return null
  return (
    <div className="psPast" data-testid="ps-past">
      <div className="psPastHead"><span>прошлые цели</span><button type="button" className="psBtn psBtn--tiny" onClick={onClear} data-testid="ps-past-clear">очистить</button></div>
      {rows.map(r => {
        const text = r.final || r.partial
        return (
          <p key={`${r.gen}-${r.n}-${r.t}`} className="psPastRow" data-ok={r.ok == null ? undefined : r.ok ? '1' : '0'} data-testid="ps-past-row">
            #{r.n + 1} {r.say}{r.shown && r.shown !== r.say ? ` (${r.shown})` : ''} → Vosk: {text ? <>«<PillStandVoskWords text={text} kind={r.final ? 'final' : 'partial'} say={r.say} state={r.state} />»</> : '—'} <b className="psPastMark">{rowMark(r)}</b>{r.ms != null ? ` ${r.ms} мс` : ''}
          </p>
        )
      })}
    </div>
  )
}
