import { stamp, dur, WHO, RES, PAUSE_KIND } from './timelineFormat.js'
import { stageTitle } from './timelineStageNames.js'
import { aroundRows, GAP_NAMES } from './timelineBlock.js'
import TimelinePauseCard from './TimelinePauseCard.jsx'
import TimelineClipPlay from './TimelineClipPlay.jsx'
import TimelineBlockComment from './TimelineBlockComment.jsx'
import TimelineLineEditor from './TimelineLineEditor.jsx'

// Карточка блока «Таймлайна игры» (нажатие на блок монтажа, ленты или строку списка): кто, полный текст, id, когда началось, длина, что было до и после, строка-источник (событие трассы «[scene] {…}»).
// У реплики — «▶ Слушать» (TimelineClipPlay: озвучка из текущих настроек); у ЛЮБОГО блока — «💬 Комментарий в GitHub» (TimelineBlockComment: адрес блока подставляется в комментарий, в отправку уходит контекст).
// Пауза — та же карточка, что на вкладке «Паузы» (TimelinePauseCard); зазор монтажа (kind 'gap') — причина тишины и длина. Стадия — с названием для админа, sid отдельной строкой.
// rows — хронология (timelineReport.rows): по ней считаются «до» и «после»; near — готовые соседи { prev, next } (вместо rows). audio — useClipAudio, block — { head, send } (TimelineScreen); side — карточка
// стоит в боковой панели монтажа (не поверх экрана).
const src = e => (e ? `[scene] ${JSON.stringify(e)}` : '')

function body(sel) {
  const r = sel.ref
  if (sel.kind === 'line') return { title: `${WHO[r.who] ?? r.who}${r.silent ? ' — без озвучки (подпись)' : ''}`, text: r.text || r.id, rows: [['id', r.id], ['начало', stamp(r.t)], ['длина', `${dur(r.end - r.t)}${r.ms ? ` (по звуку ${dur(r.ms)})` : ''}`], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—'], ...(r.why && r.why !== 'done' ? [['конец', r.why]] : []), ...(r.reason ? [['почему без звука', r.reason]] : [])], src: src(r.src) }
  if (sel.kind === 'stage') return { title: 'Стадия', text: stageTitle(r), rows: [['sid', r.sid || '—'], ['акт / вид', `${r.act || '—'} / ${r.type || '—'}`], ['начало', stamp(r.t)], ['длина', dur(r.end - r.t)], ['реплика стадии', r.line || '—'], ['ход кончен', r.out != null ? `${stamp(r.out)} (дальше ${dur(r.end - r.out)} до следующей стадии)` : '—']], src: src(r.src) }
  if (sel.kind === 'turn') return { title: r.what ?? (r.phrase ? 'Ход фразы' : 'Пилюля'), text: r.word, rows: [['исход', RES[r.res] ?? r.res], ['появилась', stamp(r.pillT ?? r.t)], ['на экране', dur(r.end - (r.pillT ?? r.t))], ['слово принято', r.claimT != null ? `через ${dur(r.ms)}` : '—'], ['дорожка', r.lane ?? '—'], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—']], src: src(r.src) }
  if (sel.kind === 'answer') return { title: 'Ответ игрока', text: `${RES[r.res] ?? r.res}${r.word ? ` — ${r.word}` : ''}`, rows: [['когда', stamp(r.t)], ['после появления', r.ms != null ? dur(r.ms) : '—'], ['стадия', r.sid ? `${stageTitle(r.sid)} (${r.sid})` : '—']], src: src(r.src) }
  if (sel.kind === 'gap') return { title: `Тишина — ${GAP_NAMES[r.kind] ?? r.kind}`, text: `${dur(r.ms)}${r.long ? ' — игра молчит дольше порога' : ''}`, rows: [['начало — конец', `${stamp(r.t)} — ${stamp(r.end)}`], ['стадия', r.stage ? `${r.stage}${r.sid ? ` (${r.sid})` : ''}` : '—']], src: '' }
  return { title: sel.kind === 'count' ? 'Отсчёт тремя нотами' : sel.kind === 'hold' ? 'Игра на паузе' : 'Игра ждёт', text: r.text || r.why || r.what || '', rows: [['начало', stamp(r.t)], ['длина', dur(r.end - r.t)]], src: '' }
}

export default function TimelineCard({ sel, rows = null, near = null, onClose, audio = null, block = null, side = false, edit = null }) { // edit — useLineEdit: правка текста и озвучки реплики прямо в карточке (TimelineLineEditor)
  if (!sel) return null
  const cls = `tlCard${side ? ' tlCardSide' : ''}`
  const close = <button type="button" className="tlBtn" onClick={onClose} aria-label="Закрыть карточку">✕</button>
  const acts = <div className="tlCardActs" data-testid="tl-card-acts">{sel.kind === 'line' && <TimelineClipPlay line={sel.ref} audio={audio} />}<TimelineBlockComment key={block ? block.head(sel) : ''} sel={sel} block={block} /></div>
  if (sel.kind === 'pause') {
    return (
      <aside className={cls} data-testid="tl-card" data-kind="pause">
        <div className="tlCardHead"><b>Пауза — {PAUSE_KIND[sel.ref.kind]}</b>{close}</div>
        <TimelinePauseCard p={sel.ref} />
        <dl className="tlCardRows"><div><dt>начало — конец</dt><dd>{stamp(sel.ref.t)} — {stamp(sel.ref.end)}</dd></div></dl>
        {acts}
      </aside>
    )
  }
  const b = body(sel), around = near ? null : rows ? aroundRows(rows, sel, 1) : null
  const nb = near ?? (around ? { prev: around.before[0] ?? null, next: around.after[0] ?? null } : null)
  return (
    <aside className={cls} data-testid="tl-card" data-kind={sel.kind}>
      <div className="tlCardHead"><b>{b.title}</b>{close}</div>
      <p className="tlCardText">{b.text}</p>
      {acts}
      {sel.kind === 'line' && <TimelineLineEditor key={`${sel.ref.who}:${sel.ref.id}`} line={sel.ref} edit={edit} />}
      <dl className="tlCardRows">{b.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
      {nb && <dl className="tlCardRows tlCardNear"><div><dt>до</dt><dd>{nb.prev ? `${stamp(nb.prev.t)} ${nb.prev.text}` : '—'}</dd></div><div><dt>после</dt><dd>{nb.next ? `${stamp(nb.next.t)} ${nb.next.text}` : '—'}</dd></div></dl>}
      {b.src && <code className="tlCardSrc">{b.src}</code>}
    </aside>
  )
}
