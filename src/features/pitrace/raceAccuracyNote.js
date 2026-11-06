// Короткая расшифровка точности слова для итога «Встряхни память» и строка журнала (CONCEPT_RACE.md, раздел 0, «Точность слова»): по wordAccuracy (raceAccuracy.js) — одна строка мелким под полосой,
// например «A 1,8 с · B промах · доп. круг ✓ · во фразе Nice to meet you спутал». Проход: время зачёта; «после промаха 2,1 с»; «промах» (было «не то» и зачёта нет); «не успел» (молчал); ловушка B — «ловушка ✓» / «поверил». Чистые функции без React.
import { fmtMs } from './raceMetrics.js'
import { phraseNote } from './raceStatePhrases.js'

/** Пометка одного результата пилюли */
function resNote(r) {
  if (r?.trap) return r.hit && !r.miss ? 'ловушка ✓' : 'поверил'
  if (!r?.hit) return (r?.wrong ?? 0) > 0 ? 'промах' : 'не успел'
  const t = Number.isFinite(r.ms) && r.ms > 0 ? fmtMs(r.ms) : 'верно'
  return r.miss ? `после промаха ${t}` : t
}

/** Пометка прохода: по первой обычной пилюле слова (ловушка — если других нет); слово только в доп. круге — по нему */
function passNote(p) {
  const list = p.first.length ? p.first : p.extra?.results ?? []
  return resNote(list.find(r => !r?.trap) ?? list[0])
}

/** Расшифровка точности acc = wordAccuracy(…): «A 1,8 с · B промах · доп. круг ✓»; нечего сказать — '' */
export function accNote(acc) {
  if (!acc) return ''
  const parts = [['A', acc.a], ['B', acc.b]].filter(([, p]) => p)
  const out = parts.map(([k, p]) => `${k} ${passNote(p)}`)
  const ex = parts.filter(([, p]) => p.extra && p.first.length)
  if (ex.length === 1) out.push(`доп. круг ${ex[0][1].extra.done ? '✓' : '✗'}`)
  else if (ex.length === 2) out.push(`доп. круг ${ex.map(([k, p]) => `${k} ${p.extra.done ? '✓' : '✗'}`).join(' ')}`)
  const ph = phraseNote(acc.f) // этап «Фразы»: «во фразе Nice to meet you спутал»
  if (ph) out.push(ph)
  return out.join(' · ')
}

/** Строка журнала гонки на одно слово итога w = { text, acc }: «итог: «learn» 73 % (A 1,8 с · B промах)» (префикс [race] ставит вызывающий) */
export const accLogLine = w => `итог: «${w.text}» ${w.acc?.pct ?? 0} %${accNote(w.acc) ? ` (${accNote(w.acc)})` : ''}`
