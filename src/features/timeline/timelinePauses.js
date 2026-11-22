// Паузы «Таймлайна игры» (CONCEPT_TIMELINE.md, «Что такое пауза»). Пауза — промежуток, когда НИКТО не говорит: ни Пит, ни Мия, ни диктор (слово / перевод / фраза голосом Пита).
// Каждый такой промежуток режется по тому, чем игра в это время занята:
//   paused — игра на паузе (свернули, попап);  player — ждём игрока (на экране пилюля без исхода, идёт ход фразы, стадия ученика без пилюль);
//   count — звучит отсчёт тремя нотами;        wait — игра ждёт технику (Пит выныривает, переключение модели слуха);
//   dead — «ИГРА МОЛЧИТ»: никто не говорит и игрока не ждём. Это то, что ищет владелец; длиннее порога — «долгая».
// У куска: начало, длина, что было перед ним и что после (ближайшие события), стадия. Чистые функции без React.
import { unionSpans, stageAt } from './timelineModel.js'
import { WHO_GEN, RES, quote, stageName, DEFAULT_THRESHOLD } from './timelineFormat.js'

export const MIN_PIECE_MS = 40 // куски короче — шум округления, не показываем
const ORDER = ['paused', 'player', 'count', 'wait'] // кто главнее, когда причины накладываются
const EDGE_MS = 30 // событие «на границе» куска: в пределах стольких мс

/** Когда игра ждёт игрока: пилюля от появления до принятия слова (или исхода), ход фразы целиком, стадия ученика без единой пилюли */
export function playerSpans(m) {
  const spans = m.turns.filter(u => !u.demo).map(u => ({ t: u.pillT ?? u.t, end: u.claimT ?? u.end }))
  for (const s of m.stages) {
    if (!['student', 'turn', 'take', 'warmup'].includes(s.type)) continue
    if (!m.turns.some(u => u.t >= s.t && u.t < s.end)) spans.push({ t: s.t, end: s.out ?? s.end }) // ступень без пилюль («Вершина»): ученик говорит весь ход
  }
  return unionSpans(spans)
}

/** Опорные события для «после чего / до чего»: [{ t, text }] по времени */
export function markers(m) {
  const out = []
  for (const l of m.lines) { const name = `${WHO_GEN[l.who] ?? l.who} ${l.who === 'dictor' ? quote(l.text, 40) : l.id}`; out.push({ t: l.t, edge: 'start', text: `реплики ${name}` }, { t: l.end, edge: 'end', text: `реплики ${name}` }) }
  for (const s of m.stages) { out.push({ t: s.t, edge: 'start', stage: true, text: `стадии ${stageName(s)}` }); if (s.out != null) out.push({ t: s.out, edge: 'end', text: `хода стадии ${s.sid}` }) }
  for (const u of m.turns) if (u.pillT != null) out.push({ t: u.pillT, edge: 'start', text: `пилюли ${quote(u.word, 40)}` })
  for (const a of m.answers) out.push({ t: a.t, edge: 'end', text: `ответа «${RES[a.res] ?? a.res}»${a.word ? ` ${quote(a.word, 40)}` : ''}` })
  for (const c of m.counts) out.push({ t: c.t, edge: 'start', text: 'отсчёта нотами' }, { t: c.end, edge: 'end', text: 'отсчёта нотами' })
  for (const w of m.waits) out.push({ t: w.end, edge: 'end', text: `ожидания (${w.why})` })
  for (const h of m.holds) out.push({ t: h.t, edge: 'start', text: 'паузы игры' }, { t: h.end, edge: 'end', text: 'паузы игры' })
  return out.sort((a, b) => a.t - b.t)
}

const cutBy = (pieces, spans, kind) => { // куски без причины режутся отрезками spans: пересечение получает причину kind
  const out = []
  for (const p of pieces) {
    if (p.kind) { out.push(p); continue }
    let at = p.t
    for (const s of spans) {
      if (s.end <= at) continue
      if (s.t >= p.end) break
      if (s.t > at) out.push({ t: at, end: s.t, kind: null })
      out.push({ t: Math.max(at, s.t), end: Math.min(p.end, s.end), kind }); at = Math.min(p.end, s.end)
    }
    if (at < p.end) out.push({ t: at, end: p.end, kind: null })
  }
  return out
}

/** Модель → куски пауз по времени: [{ t, end, ms, kind, before, after, mid, sid, stage, long }]. threshold — порог «долгой» для dead, мс */
export function buildPauses(m, threshold = DEFAULT_THRESHOLD) {
  const speech = unionSpans(m.lines)
  let pieces = [], at = 0
  for (const s of speech) { if (s.t > at) pieces.push({ t: at, end: s.t, kind: null }); at = Math.max(at, s.end) }
  if (m.dur > at) pieces.push({ t: at, end: m.dur, kind: null })
  const by = { paused: unionSpans(m.holds), player: playerSpans(m), count: unionSpans(m.counts), wait: unionSpans(m.waits) }
  for (const k of ORDER) pieces = cutBy(pieces, by[k], k)
  const marks = markers(m)
  const before = t => { let r = null; for (const x of marks) { if (x.t > t + EDGE_MS) break; r = x } return r }
  const after = t => marks.find(x => x.t >= t - EDGE_MS) ?? null
  return pieces.filter(p => p.end - p.t >= MIN_PIECE_MS).map(p => {
    const kind = p.kind ?? 'dead', ms = Math.round(p.end - p.t), st = stageAt(m, p.t + 1), b = before(p.t), a = after(p.end)
    const mid = marks.filter(x => x.stage && x.t > p.t + EDGE_MS && x.t < p.end - EDGE_MS).map(x => x.text.replace('стадии ', '')) // стадии, начавшиеся ВНУТРИ паузы (плашка вышла, а все молчат)
    return { t: p.t, end: p.end, ms, kind, mid, before: b ? `после ${b.edge === 'start' ? 'начала ' : ''}${b.text}` : 'с начала игры', after: a ? `до ${a.edge === 'end' ? 'конца ' : ''}${a.text}` : 'до конца игры', sid: st?.sid ?? '', stage: stageName(st), long: kind === 'dead' && ms >= threshold }
  })
}

/** Долгие паузы «игра молчит», самые длинные первыми (не больше top) */
export const topDead = (pauses, top = 10) => pauses.filter(p => p.long).sort((a, b) => b.ms - a.ms).slice(0, top)
