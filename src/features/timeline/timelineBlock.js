// «Блок» таймлайна — любой отрезок, который можно выбрать на «Монтаже», «Ленте», в «Списке» и «Паузах»: реплика (Пит / Мия / диктор), этап, пилюля (ход фразы), ответ игрока, тишина (пауза или зазор монтажа),
// отсчёт нотами, ожидание техники, пауза игры. Здесь — единое описание блока для карточки, для комментария в GitHub и для файла-контекста (timelineBlockContext.js). Чистые функции.
// Выбор — { kind, ref }: kind — 'line' | 'stage' | 'turn' | 'answer' | 'pause' | 'gap' | 'count' | 'wait' | 'hold'; ref — отрезок модели (timelineModel.buildTimeline), пауза (timelinePauses.buildPauses)
// или зазор / отметка монтажа (montageModel).
// СТРОКА-АДРЕС блока (CONCEPT_TIMELINE.md, «Комментарий к блоку»): `run:<id прохождения> t=+62,059s <вид>=<что>` — по ней разработчик находит место в журнале (время от начала игры) и в коде (id реплики, sid стадии):
//   clip=pit:pit_forgot#1 (кто:id реплики#N-е появление — тот же ключ, что у правок монтажа) · stage=catch-rev#1 · pill=3:meet · turn=0:nice_to_meet_you (ход фразы) · answer=win:meet · gap=dead:3400ms · count=2500ms · wait=… · hold
// Пробелы внутри значения заменены на «_» (адрес — одно «слово» на поле).
import { dur, clock, WHO, RES, PAUSE_KIND, quote } from './timelineFormat.js'
import { stageTitle } from './timelineStageNames.js'
import { stageAt } from './timelineModel.js'

export const GAP_NAMES = { ...PAUSE_KIND, anim: 'анимация без речи' }
const one = s => String(s ?? '').trim().replace(/\s+/g, '_') || '—'
const nth = (list, item, same) => { let n = 0; for (const x of list) { if (same(x)) n++; if (x === item) return n } return 0 }

/** Ключ клипа «кто:id#N» — N-е появление реплики в игре (тот же, что montageModel.clipsOf и правки монтажа) */
export const clipKey = (m, l) => `${l.who}:${l.id}#${nth(m?.lines ?? [], l, x => x.who === l.who && x.id === l.id) || 1}`

/** Отметка времени для адреса: «+62,059s» */
export const addrTime = ms => `+${(Math.max(0, ms) / 1000).toFixed(3).replace('.', ',')}s`

/**
 * Выбор + модель → описание блока: { kind, t, end, ms, who, id, text, sid, stage (название этапа для админа), part (поле адреса «вид=что»), human («Пит «…»»), src (событие трассы или null) }.
 * null — выбора нет.
 */
export function describeBlock(sel, m) {
  const r = sel?.ref
  if (!r) return null
  const st = stageAt(m ?? { stages: [] }, r.t + 1)
  const base = { kind: sel.kind, t: r.t, end: r.end ?? r.t, ms: Math.max(0, (r.end ?? r.t) - r.t), who: null, id: null, text: '', sid: st?.sid ?? r.sid ?? '', stage: st ? stageTitle(st) : '', src: r.src ?? null }
  switch (sel.kind) {
    case 'line': return { ...base, who: r.who, id: r.id, text: r.text || r.id, part: `clip=${one(clipKey(m, r))}`, human: `${WHO[r.who] ?? r.who} ${quote(r.text || r.id, 80)}` }
    case 'stage': return { ...base, sid: r.sid, stage: stageTitle(r), text: stageTitle(r), part: `stage=${one(r.sid)}#${nth(m?.stages ?? [], r, x => x.sid === r.sid) || 1}`, human: `этап «${stageTitle(r)}»` }
    case 'turn': { const t = r.pillT ?? r.t; return { ...base, t, ms: Math.max(0, r.end - t), text: r.word, part: `${r.phrase ? 'turn' : 'pill'}=${one(r.idx)}:${one(r.word)}`, human: `${r.phrase ? r.what ?? 'ход фразы' : 'пилюля'} ${quote(r.word, 60)} — ${RES[r.res] ?? r.res ?? '—'}` } }
    case 'answer': return { ...base, text: r.word, part: `answer=${one(r.res)}:${one(r.word)}`, human: `ответ игрока: ${RES[r.late && r.res === 'win' ? 'late' : r.res] ?? r.res}${r.word ? ` ${quote(r.word, 60)}` : ''}` }
    case 'pause': case 'gap': { const ms = Math.round(r.ms ?? base.ms); return { ...base, ms, sid: r.sid ?? base.sid, stage: r.stage || base.stage, text: GAP_NAMES[r.kind] ?? r.kind, part: `gap=${one(r.kind)}:${ms}ms`, human: `тишина ${dur(ms)} — ${GAP_NAMES[r.kind] ?? r.kind}` } }
    case 'count': return { ...base, text: r.what || r.text || '', part: `count=${Math.round(base.ms)}ms`, human: `отсчёт тремя нотами ${dur(base.ms)}` }
    case 'hold': return { ...base, text: r.why || r.text || '', part: 'hold', human: `игра на паузе ${dur(base.ms)}` }
    default: return { ...base, text: r.why || r.text || '', part: `wait=${one(r.why || r.text)}`, human: `игра ждёт: ${r.why || r.text || 'технику'} (${dur(base.ms)})` }
  }
}

/** Строка-адрес блока: `run:<id> t=+62,059s clip=pit:pit_forgot#1` */
export const blockAddr = (b, runId) => `run:${runId || '—'} t=${addrTime(b.t)} ${b.part}`

/** Одна человеческая строка: «Блок: Пит «…», +1:02, этап «Конвейер слов — круг»» */
export const blockHuman = b => `Блок: ${b.human}, +${clock(b.t)}${b.stage ? `, этап «${b.stage}»` : ''}`

/** Начало комментария владельца: адрес и человеческая строка (подставляются в окно комментария) */
export function blockHead(sel, m, runId) {
  const b = describeBlock(sel, m)
  return b ? `${blockAddr(b, runId)}\n${blockHuman(b)}` : ''
}

/** Записи хронологии (timelineReport.rows) вокруг блока: { before: [до n], after: [до n] } — без самой записи блока. Блока в хронологии нет (зазор, короткая пауза) — граница по его началу */
export function aroundRows(rows, sel, n = 8) {
  const r = sel?.ref, i = rows.findIndex(x => x.ref === r)
  const mine = x => x.ref === r
  if (i >= 0) return { before: rows.slice(0, i).filter(x => !mine(x)).slice(-n), after: rows.slice(i + 1).filter(x => !mine(x)).slice(0, n) }
  const t = r?.t ?? 0, j = rows.findIndex(x => x.t >= t - 0.5)
  const cut = j < 0 ? rows.length : j
  return { before: rows.slice(0, cut).slice(-n), after: rows.slice(cut).slice(0, n) }
}
