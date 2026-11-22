// Список правок монтажа словами: для экрана (короткая строка), для буфера обмена и для файла, который уходит в GitHub вместе с логами (pithy-timeline-edits-<дата>.txt — shared/lib/logUpload.collectLogs, extra).
// Строка правки читается без кода: «после Пит «…» [race_reverse] → перед Диктор «…», этап «Разворот конвейера» [catch-rev]: зазор 5,5 с → 2,0 с (−3,5 с)». Чистые функции.
import { WHO, PAUSE_KIND, dur, clock, quote } from '../timelineFormat.js'

export const GAP_KIND = { ...PAUSE_KIND, anim: 'анимация без речи' }
export const MODE = { ripple: 'сдвиг со шлейфом', solo: 'только этот клип' }
/** Почему клип упёрся (режим «Правка»): причина из montageEdits.limitsFor → слова для владельца */
export const WHY = {
  player: 'меньше нельзя: внутри этой тишины игра ждёт игрока (или идёт отсчёт / техника) — это время от монтажа не зависит',
  same: 'меньше нельзя: клип упёрся в предыдущую реплику того же говорящего — сам на себя он наложиться не может',
  order: 'меньше нельзя: раньше начала предыдущего клипа не поставить',
  start: 'меньше нельзя: начало игры',
  max: 'больше нельзя: предел сдвига (в режиме «только этот клип» — следующая реплика этого говорящего)',
}
/** Секунды для правок: до сотых, если нужно («2,65 с», «2,0 с») — шаг правки 50 мс, одной десятой мало */
export const sec = ms => { const cs = Math.round(Math.abs(ms) / 10); return `${(cs / 100).toFixed(cs % 10 === 0 ? 1 : 2).replace('.', ',')} с` }
const signed = ms => `${ms < 0 ? '−' : '+'}${sec(ms)}`
/** Зазор словами: «2,0 с», «встык», «наложение 0,3 с» */
export const gapText = ms => (ms < -1 ? `наложение ${sec(ms)}` : ms < 1 ? 'встык' : sec(ms))
const who = x => (x ? `${WHO[x.who] ?? x.who} ${quote(x.text || x.id, 70)}${x.who !== 'dictor' && x.id ? ` [${x.id}]` : ''}` : 'начало игры')

/** Правка коротко — строка списка на экране: «зазор перед «…» 5,5 с → 2,0 с (−3,5 с)» */
export const editShort = e => `зазор перед ${WHO[e.who] ?? e.who} ${quote(e.text || e.id, 36)} ${gapText(e.from)} → ${gapText(e.to)} (${signed(e.to - e.from)})`

/** Правка полностью — строка для разработчика: якоря (кто до, кто после, стадия), исходный и новый зазор, режим, что внутри не меняется */
export function editLine(e) {
  const inside = (e.inside ?? []).map(p => `${GAP_KIND[p.kind] ?? p.kind} ${dur(p.ms)}`).join(', ')
  return `после ${who(e.prev)} → перед ${who(e)}, этап «${e.stage || '—'}»${e.sid ? ` [${e.sid}]` : ''}: зазор ${gapText(e.from)} → ${gapText(e.to)} (${signed(e.to - e.from)}), ${MODE[e.mode] ?? e.mode}`
    + `${inside ? `; внутри не меняется: ${inside}` : ''}${e.to < -1 ? '; ЗВУЧАТ ОДНОВРЕМЕННО' : ''}; в игре на ${clock(e.at ?? 0)}`
}

/** Итог одной строкой: «игра 2:49 → 2:31, убрано 18,4 с тишины» */
export function summaryText(sum) {
  if (!sum.count) return `игра ${clock(sum.before)} — правок нет`
  const d = sum.removed
  return `игра ${clock(sum.before)} → ${clock(sum.after)}, ${Math.abs(d) < 1 ? 'длина та же' : d > 0 ? `убрано ${dur(d)} тишины` : `добавлено ${dur(-d)} тишины`}`
}

/** Весь список правок текстом (файл для GitHub, буфер обмена). missing — правки, клип которых в этой игре не найден */
export function editsText(edits, sum, { title = 'ЧЕРНОВИК МОНТАЖА — список правок', label = '', missing = [] } = {}) {
  const gone = new Set(missing.map(e => e.key))
  return [
    title, label || null, `Правок: ${edits.length} · ${summaryText(sum)}`,
    'Это черновик монтажа: игра от него не меняется. Каждая строка — «какую тишину сделать какой»; якоря (id реплик, стадия) — чтобы найти место в коде и в другой игре.', '',
    ...edits.map((e, i) => `${i + 1}. ${editLine(e)}${gone.has(e.key) ? ' — В ЭТОЙ ИГРЕ ТАКОГО КЛИПА НЕТ (правка не применена)' : ''}`),
    ...(edits.length ? [] : ['(правок нет)']),
  ].filter(s => s != null).join('\n')
}

const tag = at => at.toISOString().slice(0, 19).replace(/[:T]/g, '-')
/** Текст списка правок → файл { name, text } для отправки логов */
export const editsFile = (text, at = new Date()) => ({ name: `pithy-timeline-edits-${tag(at)}.txt`, text })
