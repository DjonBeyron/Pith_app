// Паузы «Таймлайна игры» (CONCEPT_TIMELINE.md, «Что такое пауза»). Пауза — промежуток, когда НИКТО не говорит: ни Пит, ни Мия, ни диктор (слово / перевод / фраза голосом Пита).
// Каждый такой промежуток режется по тому, чем игра в это время занята:
//   paused — игра на паузе (свернули, попап);  player — ждём игрока (на экране пилюля без исхода, идёт ход фразы, стадия ученика без пилюль);
//   count — звучит отсчёт тремя нотами;        wait — игра ждёт технику (Пит выныривает, переключение модели слуха);
//   dead — «ИГРА МОЛЧИТ»: никто не говорит и игрока не ждём. Это то, что ищет владелец; длиннее порога — «долгая».
// У куска: начало, длина, что было ПЕРЕД ним и что ПОСЛЕ (кто и полный текст — timelinePauseSides.js), что шло внутри (стадия-анимация, начавшиеся стадии), стадия с названием для админа. Чистые функции без React.
import { unionSpans, stageAt } from './timelineModel.js'
import { DEFAULT_THRESHOLD } from './timelineFormat.js'
import { stageTitle } from './timelineStageNames.js'
import { markers, insideOf, SIDE_START, SIDE_END } from './timelinePauseSides.js'

export const MIN_PIECE_MS = 40 // куски короче — шум округления, не показываем
export const ORDER = ['paused', 'player', 'count', 'wait'] // кто главнее, когда причины накладываются
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

export const cutBy = (pieces, spans, kind) => { // куски без причины режутся отрезками spans: пересечение получает причину kind
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

/** Чем игра занята, пока никто не говорит: отрезки по причинам (их же режет «Монтаж» — montage/montageModel.js) */
export const causeSpans = m => ({ paused: unionSpans(m.holds), player: playerSpans(m), count: unionSpans(m.counts), wait: unionSpans(m.waits) })

/** Модель → куски пауз по времени: [{ t, end, ms, kind, long, sid, act, stage, before, after, saidBefore, saidAfter, mid, inside }]. threshold — порог «долгой» для dead, мс */
export function buildPauses(m, threshold = DEFAULT_THRESHOLD) {
  const speech = unionSpans(m.lines)
  let pieces = [], at = 0
  for (const s of speech) { if (s.t > at) pieces.push({ t: at, end: s.t, kind: null }); at = Math.max(at, s.end) }
  if (m.dur > at) pieces.push({ t: at, end: m.dur, kind: null })
  const by = causeSpans(m)
  for (const k of ORDER) pieces = cutBy(pieces, by[k], k)
  const marks = markers(m), lineEnds = marks.filter(x => x.rank === 0 && x.edge === 'end'), lineStarts = marks.filter(x => x.rank === 0 && x.edge === 'start')
  const firstFrom = (list, t) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].t < t) lo = mid + 1; else hi = mid } return lo } // индекс первого события с t ≥ заданного
  const best = (list, dir) => list.reduce((r, x) => (!r || x.rank < r.rank || (x.rank === r.rank && dir < 0) ? x : r), null) // на самой границе несколько событий: главнее реплика, потом ответ игрока, отсчёт…
  const edgeOf = (t, dir) => { // событие на границе паузы (в пределах EDGE_MS), иначе ближайшее с нужной стороны
    const i = firstFrom(marks, t - EDGE_MS), j = firstFrom(marks, t + EDGE_MS + 0.001), near = marks.slice(i, j)
    return near.length ? best(near, dir) : dir < 0 ? marks[i - 1] ?? null : marks[j] ?? null
  }
  return pieces.filter(p => p.end - p.t >= MIN_PIECE_MS).map(p => {
    const kind = p.kind ?? 'dead', ms = Math.round(p.end - p.t), st = stageAt(m, p.t + 1), b = edgeOf(p.t, -1), a = edgeOf(p.end, 1)
    const mid = marks.slice(firstFrom(marks, p.t + EDGE_MS + 0.001), firstFrom(marks, p.end - EDGE_MS)).filter(x => x.stage).map(x => x.stage) // стадии, начавшиеся ВНУТРИ паузы (плашка вышла, а все молчат)
    const saidB = b?.rank === 0 ? null : lineEnds[firstFrom(lineEnds, p.t + EDGE_MS + 0.001) - 1] ?? null, saidA = a?.rank === 0 ? null : lineStarts[firstFrom(lineStarts, p.end - EDGE_MS)] ?? null
    return {
      t: p.t, end: p.end, ms, kind, long: kind === 'dead' && ms >= threshold, sid: st?.sid ?? '', act: st?.act ?? '', stage: stageTitle(st),
      before: b?.side ?? SIDE_START, after: a?.side ?? SIDE_END, // что было на границе: кто и полный текст (timelinePauseSides.js)
      saidBefore: saidB ? { ...saidB.side, note: '', ago: Math.round(p.t - saidB.t) } : null, saidAfter: saidA ? { ...saidA.side, note: '', ago: Math.round(saidA.t - p.end) } : null, // ближайшая реплика, если на границе не речь
      mid: mid.map(x => stageTitle(x)), inside: insideOf(st, mid),
    }
  })
}

/** Долгие паузы «игра молчит», самые длинные первыми (не больше top). Все паузы с сортировкой и группами — timelinePauseList.js */
export const topDead = (pauses, top = 10) => pauses.filter(p => p.long).sort((a, b) => b.ms - a.ms).slice(0, top)
