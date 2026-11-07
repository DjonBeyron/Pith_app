// Хронология переходов между ступенями «Встряхни память» одной группой «[start] переход …» (замечание владельца: «перед этапами какое-то время Пит молчит»). Переход открывается последним событием ступени
// с пилюлями (зачёт / промах / «не успел» / итог хода — last()) или входом в игру (begin('старт')), закрывается первой пилюлей следующей ступени (выезд — spawn, у «Фраз» — начало хода). Строка:
// «[start] переход Пинг-понг A → Пинг-понг B: плашка через N мс, реплика через M мс, первая пилюля через K мс; плашки: «…» +N, …» (нет плашки / реплики — «—»). Между двумя ступенями может быть несколько
// плашек без пилюль (B → «Фразы» → круг 1): каждая смена этапа без пилюль закрывает свой отрезок («первая пилюля —, дальше «…» через N мс»), отсчёт следующего — от этой смены.
// Чистая логика: часы и журнал — аргументами (директор useRaceActs зовёт stage / plate / line / pill / last).
import { pLog } from '../../shared/lib/debug.js'

const NAMES = { sprint: 'Пинг-понг A', sprint2: 'Пинг-понг A, круг 2', catch: 'Пинг-понг B', catch2: 'Пинг-понг B, круг 2', phrases: 'плашка «Фразы»', phrases1: 'Фразы, круг 1', phrases2: 'Фразы, круг 2', climb: 'Финал', descent: 'Спуск', summary: 'Итог' }

/** Отрезок игры стадии: sid без хвостов -ann / -sw (catch-sw, catch-ann, catch → catch), все стадии «Вершины» — climb, итог — summary */
export function segOf(st) {
  if (!st) return null
  if (st.type === 'summary') return 'summary'
  if (st.act === 'climb' || st.act === 'descent') return st.act
  return String(st.sid ?? st.act ?? '').replace(/-(ann|sw)$/, '')
}
export const segName = seg => NAMES[seg] ?? seg
const hasPills = st => st?.type === 'student' && ['sprint', 'catch', 'phrases'].includes(st.act)
const ms = v => (v == null ? '—' : `${Math.round(v)} мс`)

export function createTransChron({ now = () => performance.now(), log = pLog } = {}) {
  let open = null, prev = null, lastAt = null
  const say = t => { try { log(t) } catch { /* журнал не мешает игре */ } }
  const start = (from, to, t0) => { open = { from, to, t0, plate: null, line: null, lineId: null, plates: [] } }
  const line = (pill, tail = '') => {
    const o = open
    const plates = o.plates.length ? `; плашки: ${o.plates.map(p => `«${p.title}» +${Math.round(p.at)}`).join(', ')}` : ''
    say(`[start] переход ${o.from} → ${o.to}: плашка через ${ms(o.plate)}, реплика через ${ms(o.line)}${o.lineId ? ` («${o.lineId}»)` : ''}, первая пилюля через ${ms(pill)}${tail}${plates}`)
  }
  return {
    /** Вход в игру: переход «старт → первая ступень» (куда — узнаем на первой стадии) */
    begin(from = 'старт') { prev = null; lastAt = null; start(from, '…', now()) },
    /** Событие ступени с пилюлями (реакция движка, итог хода): от последнего такого события считается переход */
    last() { lastAt = now() },
    /** Стадия началась */
    stage(st) {
      const seg = segOf(st), t = now()
      if (open && open.to === '…') open.to = segName(seg)
      else if (prev && hasPills(prev) && segOf(prev) !== seg) start(segName(segOf(prev)), segName(seg), lastAt ?? t)
      else if (open && segName(seg) !== open.to) { line(null, `, дальше «${segName(seg)}» через ${Math.round(t - open.t0)} мс`); start(open.to, segName(seg), t) }
      prev = st
    },
    /** Плашка на экране (title — её название) */
    plate(title = '') { if (!open) return; const at = now() - open.t0; if (open.plate == null) open.plate = at; open.plates.push({ title: title || 'подпись', at }) },
    /** Пит начал реплику стадии */
    line(id) { if (open && open.line == null) { open.line = now() - open.t0; open.lineId = id } },
    /** Первая пилюля ступени выехала: строка журнала, переход закрыт */
    pill() { if (!open || open.to === '…') return; line(now() - open.t0); open = null },
    /** Открытый переход (для тестов) */
    current: () => open,
  }
}
