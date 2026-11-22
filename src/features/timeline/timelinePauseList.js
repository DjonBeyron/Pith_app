// Список долгих пауз «игра молчит» для вкладки «Паузы» и текстового отчёта: итог («долгих пауз N, всего X с из Y с игры»), сортировка (самые долгие сверху / по времени), группы по этапам
// (сколько молчания на каждом) и пауза текстом — одной строкой (хронология) и блоком «перед / после / внутри» (раздел отчёта: его читает разработчик без экрана). Чистые функции без React.
import { stamp, dur, atClock } from './timelineFormat.js'
import { actTitle } from './timelineStageNames.js'
import { sideLine } from './timelinePauseSides.js'

export const SORTS = [['long', 'самые долгие'], ['time', 'по времени']]

/** Долгие паузы в нужном порядке: 'long' — самые долгие сверху, 'time' — по времени; act — только этого этапа (null — все) */
export function sortPauses(pauses, sort = 'long', act = null) {
  const list = pauses.filter(p => p.long && (act == null || p.act === act))
  return sort === 'time' ? list.sort((a, b) => a.t - b.t) : list.sort((a, b) => b.ms - a.ms || a.t - b.t)
}

/** Итог по долгим паузам: { n, ms } */
export const pauseTotals = pauses => { const list = pauses.filter(p => p.long); return { n: list.length, ms: list.reduce((s, p) => s + p.ms, 0) } }

/** Группы по этапам в порядке игры: [{ act, title, n, ms }] */
export function pauseGroups(pauses) {
  const out = []
  for (const p of pauses) {
    if (!p.long) continue
    let g = out.find(x => x.act === p.act)
    if (!g) { g = { act: p.act, title: actTitle(p.act), n: 0, ms: 0 }; out.push(g) }
    g.n += 1; g.ms += p.ms
  }
  return out
}

const said = (s, word) => (s ? `${word}: ${sideLine(s)} — ${dur(s.ago)} ${word.startsWith('след') ? 'после паузы' : 'до паузы'}` : '')

/** Пауза одной строкой (хронология отчёта, «Список»): «перед: Пит: «…» [id]; после: …; этап: …; внутри: …» */
export const pauseWhere = p => `перед: ${sideLine(p.before)}; после: ${sideLine(p.after)}; этап: ${p.stage}${p.inside?.length ? `; внутри: ${p.inside.join('; ')}` : ''}`

/** Пауза блоком строк для раздела отчёта: длина, когда, этап, что прозвучало перед и после (полный текст), что шло внутри */
export function pauseBlock(p, i) {
  const pad = '   ', out = [`${i + 1}. ${dur(p.ms)} ${atClock(p.t)} (${stamp(p.t)}) — этап: ${p.stage}${p.sid ? ` [${p.sid}]` : ''}`, `${pad}перед:  ${sideLine(p.before)}`]
  if (p.saidBefore) out.push(`${pad}        ${said(p.saidBefore, 'последняя реплика')}`)
  out.push(`${pad}после:  ${sideLine(p.after)}`)
  if (p.saidAfter) out.push(`${pad}        ${said(p.saidAfter, 'следующая реплика')}`)
  if (p.inside?.length) out.push(`${pad}внутри: ${p.inside.join('; ')}`)
  return out
}
