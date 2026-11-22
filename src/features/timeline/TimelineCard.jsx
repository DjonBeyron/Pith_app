import { stamp, dur, WHO, RES, PAUSE_KIND } from './timelineFormat.js'
import { stageTitle } from './timelineStageNames.js'
import TimelinePauseCard from './TimelinePauseCard.jsx'

// Карточка отрезка «Таймлайна игры» (нажатие на блок ленты или строку списка): кто, полный текст, id, когда началось, длина, что было до и после, строка-источник (событие трассы «[scene] {…}»).
// Пауза — та же карточка, что на вкладке «Паузы» (TimelinePauseCard): кто и что сказал перед тишиной и после, что шло внутри. Стадия — с названием для админа, sid отдельной строкой.
// near — соседние записи хронологии { prev, next } (timelineReport.rows): «до» и «после» этого отрезка.
const src = e => (e ? `[scene] ${JSON.stringify(e)}` : '')

function body(sel) {
  const r = sel.ref
  if (sel.kind === 'line') return { title: `${WHO[r.who] ?? r.who}${r.silent ? ' — без озвучки (подпись)' : ''}`, text: r.text || r.id, rows: [['id', r.id], ['начало', stamp(r.t)], ['длина', `${dur(r.end - r.t)}${r.ms ? ` (по звуку ${dur(r.ms)})` : ''}`], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—'], ...(r.why && r.why !== 'done' ? [['конец', r.why]] : []), ...(r.reason ? [['почему без звука', r.reason]] : [])], src: src(r.src) }
  if (sel.kind === 'stage') return { title: 'Стадия', text: stageTitle(r), rows: [['sid', r.sid || '—'], ['акт / вид', `${r.act || '—'} / ${r.type || '—'}`], ['начало', stamp(r.t)], ['длина', dur(r.end - r.t)], ['реплика стадии', r.line || '—'], ['ход кончен', r.out != null ? `${stamp(r.out)} (дальше ${dur(r.end - r.out)} до следующей стадии)` : '—']], src: src(r.src) }
  if (sel.kind === 'turn') return { title: r.what ?? (r.phrase ? 'Ход фразы' : 'Пилюля'), text: r.word, rows: [['исход', RES[r.res] ?? r.res], ['появилась', stamp(r.pillT ?? r.t)], ['на экране', dur(r.end - (r.pillT ?? r.t))], ['слово принято', r.claimT != null ? `через ${dur(r.ms)}` : '—'], ['дорожка', r.lane ?? '—'], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—']], src: src(r.src) }
  if (sel.kind === 'answer') return { title: 'Ответ игрока', text: `${RES[r.res] ?? r.res}${r.word ? ` — ${r.word}` : ''}`, rows: [['когда', stamp(r.t)], ['после появления', r.ms != null ? dur(r.ms) : '—'], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—']], src: src(r.src) }
  return { title: sel.kind === 'count' ? 'Отсчёт тремя нотами' : sel.kind === 'hold' ? 'Игра на паузе' : 'Игра ждёт', text: r.text || r.why || r.what || '', rows: [['начало', stamp(r.t)], ['длина', dur(r.end - r.t)]], src: '' }
}

export default function TimelineCard({ sel, near = null, onClose }) {
  if (!sel) return null
  if (sel.kind === 'pause') {
    return (
      <aside className="tlCard" data-testid="tl-card" data-kind="pause">
        <div className="tlCardHead"><b>Пауза — {PAUSE_KIND[sel.ref.kind]}</b><button type="button" className="tlBtn" onClick={onClose} aria-label="Закрыть карточку">✕</button></div>
        <TimelinePauseCard p={sel.ref} />
        <dl className="tlCardRows"><div><dt>начало — конец</dt><dd>{stamp(sel.ref.t)} — {stamp(sel.ref.end)}</dd></div></dl>
      </aside>
    )
  }
  const b = body(sel)
  return (
    <aside className="tlCard" data-testid="tl-card" data-kind={sel.kind}>
      <div className="tlCardHead"><b>{b.title}</b><button type="button" className="tlBtn" onClick={onClose} aria-label="Закрыть карточку">✕</button></div>
      <p className="tlCardText">{b.text}</p>
      <dl className="tlCardRows">{b.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
      {near && <dl className="tlCardRows tlCardNear"><div><dt>до</dt><dd>{near.prev ? `${stamp(near.prev.t)} ${near.prev.text}` : '—'}</dd></div><div><dt>после</dt><dd>{near.next ? `${stamp(near.next.t)} ${near.next.text}` : '—'}</dd></div></dl>}
      {b.src && <code className="tlCardSrc">{b.src}</code>}
    </aside>
  )
}
