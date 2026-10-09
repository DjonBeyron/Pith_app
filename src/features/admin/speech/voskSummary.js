// Сводки усложнённого теста Vosk: по стилям словаря (A, C), ловушкам (B), условиям (D), задержкам (F) и порогу уверенности (E).
// Один источник для экрана и для «Скопировать итог Vosk-серии»: строки текста. Чистые функции без React.
import { STYLES, STYLE_LABEL } from './voskGrammar.js'
import { condLabel, CONDS } from './voskSeries.js'
import { trapCount } from './voskTraps.js'
import { summarize, sec } from './voskTiming.js'

const count = (list, out) => list.filter(r => r.out === out).length

/** Итог по типу прогонов (ctx | pair) и стилю: ошибки — поймано (движок сохранил ошибку) / подменил; контроль — ложные тревоги (принял правильное за ошибочное) */
export function kindSummary(runs, kind, style = null) {
  const k = runs.filter(r => r.kind === kind && (!style || r.style === style))
  const err = k.filter(r => r.mode === 'error')
  const ctl = k.filter(r => r.mode === 'control')
  return { nErr: err.length, caught: count(err, 'asis'), swapped: count(err, 'swapped'), nCtl: ctl.length, falseAlarms: count(ctl, 'swapped'), okCtl: count(ctl, 'asis') }
}

const sumText = s => `поймано ошибок ${s.caught} из ${s.nErr} (подменил ${s.swapped}) · ложных тревог ${s.falseAlarms} из ${s.nCtl}`

/** Отметки шагов A по последнему прогону каждого шага: «1✅ 2✅ 3⚠ 4–» */
export function stepMarks(runs, style, mode) {
  return [0, 1, 2, 3].map(i => {
    const r = [...runs].reverse().find(x => x.kind === 'ctx' && x.step === i && x.mode === mode && x.style === style)
    return `${i + 1}${!r ? '–' : r.out === 'asis' ? '✅' : '⚠'}`
  }).join(' ')
}

/** Условие → «правильно понято X из N» (как сказано) и разбивка ошибки/контроль. Только шаги A и пары C; условия без прогонов пропущены */
export function condRows(runs) {
  const ok = runs.filter(r => r.kind === 'ctx' || r.kind === 'pair')
  return CONDS.map(c => {
    const l = ok.filter(r => r.cond === c.id)
    const part = mode => { const m = l.filter(r => r.mode === mode); return { n: m.length, ok: count(m, 'asis') } }
    return { id: c.id, n: l.length, ok: count(l, 'asis'), err: part('error'), ctl: part('control') }
  }).filter(r => r.n)
}

/** Задержки по прогонам: медиана/макс «до первого partial», «до итога», «итог после конца слова», «старт записи» */
export function timingStats(runs) {
  const pick = k => summarize(runs.map(r => r.tm?.[k]))
  return { n: runs.length, fp: pick('fp'), res: pick('res'), end: pick('end'), tap: pick('tap') }
}

const tLine = (name, s) => (s.n ? `${name}: медиана ${sec(s.med)}, макс ${sec(s.max)}` : `${name}: нет данных`)

/** Строки сводки: [{ key, text }] (key нужен экрану; отчёт берёт text) */
export function summaryLines(state) {
  const runs = state.runs
  const out = []
  for (const st of STYLES) {
    const s = kindSummary(runs, 'ctx', st)
    if (s.nErr || s.nCtl) out.push({ key: `ctx-${st}`, text: `A. Контекст · ${STYLE_LABEL[st]}: ${sumText(s)} · с ошибкой ${stepMarks(runs, st, 'error')} · контроль ${stepMarks(runs, st, 'control')}` })
  }
  for (const st of STYLES) {
    const s = kindSummary(runs, 'pair', st)
    if (s.nErr || s.nCtl) out.push({ key: `pair-${st}`, text: `C. Пары · ${STYLE_LABEL[st]}: ${sumText(s)}` })
  }
  const t = trapCount(runs)
  if (t.n) out.push({ key: 'trap', text: `B. Ловушки: ложных принятий ${t.bad} из ${t.n}${t.silence ? ` (тишина: ${t.silenceBad} из ${t.silence})` : ''}` })
  const conds = condRows(runs)
  if (conds.length) out.push({ key: 'cond', text: `D. Условия: ${conds.map(c => `${condLabel(c.id)} — понято ${c.ok} из ${c.n} (ошибки ${c.err.ok}/${c.err.n} · контроль ${c.ctl.ok}/${c.ctl.n})`).join('; ')}` })
  const tm = timingStats(runs)
  if (tm.n) {
    out.push({ key: 'tm', text: `F. Задержки (${tm.n} прогонов): ${[tLine('до первого partial', tm.fp), tLine('до итога', tm.res), tLine('итог после конца слова', tm.end), tLine('старт записи после «Сказать»', tm.tap)].join(' · ')}` })
  }
  return out
}
