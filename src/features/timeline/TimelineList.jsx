import { useState } from 'react'
import { stamp, dur, WHO } from './timelineFormat.js'

// «Список» — та же хронология текстом сверху вниз (на телефоне основной способ чтения): время, кто, текст и тишина перед записью. Долгие паузы «игра молчит» — красные строки.
// rows — записи timelineReport.rows; pauses — куски пауз. Строк может быть тысячи: показывается первая порция, дальше — кнопкой (PAGE).
export const PAGE = 300
const TAG = { stage: 'этап', pill: 'пилюля', answer: 'игрок', count: 'ноты', wait: 'ждёт', hold: 'пауза', pause: 'тишина' }

export default function TimelineList({ rows, pauses, selected = null, onPick }) {
  const [shown, setShown] = useState(PAGE)
  const dead = pauses.filter(p => p.kind === 'dead' && p.ms >= 300)
  const quietBefore = t => dead.find(p => Math.abs(p.end - t) <= 40) // тишина, кончившаяся этой записью
  return (
    <div className="tlList" data-testid="tl-list">
      {rows.slice(0, shown).map((r, i) => {
        const q = r.kind === 'line' ? quietBefore(r.t) : null
        return (
          <button key={i} type="button" className={`tlItem${selected?.ref === r.ref ? ' tlItemOn' : ''}`} data-kind={r.kind} data-who={r.who} data-res={r.res} onClick={() => onPick?.({ kind: r.kind === 'pill' ? 'turn' : r.kind, ref: r.ref })}>
            <span className="tlItemT">{stamp(r.t)}</span>
            <span className="tlItemWho">{r.kind === 'line' ? WHO[r.who] : TAG[r.kind]}</span>
            <span className="tlItemText">{r.text.replace(r.kind === 'line' ? /^[^:]+: / : /^(игрок: |пилюля |── )/, '')}{q && <i className="tlItemQuiet" data-long={q.long ? '1' : '0'}> · тишина перед: {dur(q.ms)}</i>}</span>
          </button>
        )
      })}
      {rows.length > shown && <button type="button" className="tlBtn tlMore" onClick={() => setShown(n => n + PAGE)}>Показать ещё ({rows.length - shown})</button>}
    </div>
  )
}
