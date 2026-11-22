// Текстовый отчёт «Таймлайна игры» — та же картина без экрана: уходит в GitHub файлом pithy-timeline-….txt (кнопка «В GitHub» на экране таймлайна) и читается разработчиком по слову «читай».
// Хронология по времени: стадии с названием для админа и sid, реплики («+12,340 с  Пит: «текст» (race_good_2, 1,8 с)»), пилюли, ответы игрока и долгие паузы («⚠ пауза 2,4 с — игра молчит: перед: …; после: …; этап: …»),
// затем ВСЕ долгие паузы блоками «перед / после / внутри» с полным текстом реплик (самые долгие сверху) и сводка по этапам. rows() — те же записи объектами (экран «Список» рисует их, а не разбирает текст). Чистые функции.
import { buildPauses } from './timelinePauses.js'
import { buildSummary } from './timelineSummary.js'
import { stamp, dur, quote, lineText, RES, PAUSE_KIND, DEFAULT_THRESHOLD } from './timelineFormat.js'
import { stageTitle, actTitle } from './timelineStageNames.js'
import { sortPauses, pauseTotals, pauseWhere, pauseBlock } from './timelinePauseList.js'

/** Записи хронологии по времени: [{ t, kind: 'stage'|'line'|'pill'|'answer'|'pause'|'count'|'wait'|'hold', text, ref }] (ref — исходный отрезок модели) */
export function rows(m, pauses) {
  const out = []
  for (const s of m.stages) out.push({ t: s.t, kind: 'stage', text: `── стадия ${stageTitle(s)} [${s.sid || '—'}] (${s.act || '—'}, ${s.type || '—'}${s.line ? `, реплика ${s.line}` : ''}) — ${dur(s.end - s.t)}`, ref: s })
  for (const l of m.lines) out.push({ t: l.t, kind: 'line', who: l.who, text: lineText(l), ref: l })
  for (const u of m.turns) if (u.pillT != null) out.push({ t: u.pillT, kind: 'pill', text: `пилюля ${quote(u.word, 60)}${u.lane != null ? ` (дорожка ${u.lane})` : ''}`, ref: u })
  for (const u of m.turns) if (u.phrase) out.push({ t: u.t, kind: 'pill', text: `${u.what ?? 'ход фразы'} ${quote(u.word, 60)}${u.demo ? ' (пример Пита)' : ''}`, ref: u })
  for (const a of m.answers) out.push({ t: a.t, kind: 'answer', res: a.res, text: `игрок: ${RES[a.late && a.res === 'win' ? 'late' : a.res] ?? a.res}${a.word ? ` ${quote(a.word, 60)}` : ''}${a.ms != null ? ` через ${dur(a.ms)}` : ''}${a.final ? '' : ' (пилюля ещё едет)'}`, ref: a })
  for (const c of m.counts) out.push({ t: c.t, kind: 'count', text: `отсчёт тремя нотами — ${dur(c.end - c.t)}`, ref: c })
  for (const w of m.waits) out.push({ t: w.t, kind: 'wait', text: `игра ждёт: ${w.why} — ${dur(w.ms)}`, ref: w })
  for (const h of m.holds) out.push({ t: h.t, kind: 'hold', text: `игра на паузе (${h.why || '—'}) — ${dur(h.end - h.t)}`, ref: h })
  for (const p of pauses) if (p.long) out.push({ t: p.t, kind: 'pause', text: `⚠ пауза ${dur(p.ms)} — ${PAUSE_KIND[p.kind]}: ${pauseWhere(p)}`, ref: p })
  const rank = { stage: 0, pause: 2 }
  return out.sort((a, b) => a.t - b.t || (rank[a.kind] ?? 1) - (rank[b.kind] ?? 1))
}

const metaLine = meta => Object.entries(meta ?? {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join(', ')

/** Модель → строки отчёта. threshold — порог долгой паузы (мс); dropped — сколько событий трассы вытеснено */
export function reportLines(m, { threshold = DEFAULT_THRESHOLD, dropped = 0, title = 'ТАЙМЛАЙН ИГРЫ' } = {}) {
  const pauses = buildPauses(m, threshold), sum = buildSummary(m, pauses), top = sortPauses(pauses), tot = pauseTotals(pauses)
  const out = [`== ${title} ==`, `прохождение: ${dur(sum.dur)}${metaLine(m.meta) ? `; ${metaLine(m.meta)}` : ''}`,
    `говорили: Пит ${dur(sum.speak.pit)}, Мия ${dur(sum.speak.mia)}, диктор (слова голосом Пита) ${dur(sum.speak.dictor)}; ждали игрока ${dur(sum.player)}; игра молчала ${dur(sum.dead)} (из них долгими паузами ${dur(sum.deadLong)})`,
    `порог долгой паузы: ${dur(threshold)}; долгих пауз «игра молчит»: ${sum.longCount}${dropped ? `; ВНИМАНИЕ: начало трассы вытеснено (${dropped} событий)` : ''}`, '']
  if (!m.stages.length && !m.lines.length) return [...out, '(событий сцены нет — игра не запускалась или трасса пуста)']
  out.push('== ХРОНОЛОГИЯ ==')
  for (const r of rows(m, pauses)) out.push(`${stamp(r.t).padStart(12)}  ${r.text}`)
  out.push('', `== ДОЛГИЕ ПАУЗЫ «ИГРА МОЛЧИТ»: ${tot.n}, всего ${dur(tot.ms)} из ${dur(sum.dur)} игры (самые долгие сверху) ==`)
  if (!top.length) out.push('нет')
  top.forEach((p, i) => out.push(...pauseBlock(p, i)))
  out.push('', '== ПО ЭТАПАМ ==')
  for (const a of sum.acts) out.push(`${stamp(a.t).padStart(12)}  ${actTitle(a.act)} [${a.act || '—'}]: ${dur(a.dur)}; Пит ${dur(a.speak.pit)}, Мия ${dur(a.speak.mia)}, диктор ${dur(a.speak.dictor)}; игра молчала ${dur(a.dead)}${a.longCount ? `, долгих пауз ${a.longCount}` : ''}`)
  return out
}

export const reportText = (m, opts) => reportLines(m, opts).join('\n')
