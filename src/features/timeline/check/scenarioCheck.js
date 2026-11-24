// Проверка всего сценария «Встряхни память» по текущим настройкам реплик (CONCEPT_TIMELINE.md, «Проверка сценария»): сценарий из кода (scenarioBuild.js) + проверка каждой реплики (lineCheck.js)
// + риски сцены от длины (sceneRisks.js) → светофор по блокам и общий, список действий простыми словами. Вход — то, что уже есть у карточки реплики (useLineEdit): audit — карта аудита озвучки
// { [id]: { status, now, was } }, lines — реплики из настроек (normalizeLines), orphans — записи озвучки удалённых реплик.
// → { ready, light, blocks: [{ …блок, light, bad, parts: [{ …часть, items: [{ …реплика, check }] }] }], risks, actions: [{ k, n, text, ids }], need (id — то же число, что на вкладке «Голос»), unused, orphans }
// Чистые функции без React.
import { MIN_CAPTION_MS } from '../../pitrace/mia/miaSpeech.js'
import { scenarioNow, whoOf } from './scenarioBuild.js'
import { needEntries } from './scenarioNeed.js'
import { checkLine, worst, ICON } from './lineCheck.js'
import { sceneRisks, risksById } from './sceneRisks.js'

export const LIGHT = { ok: 'green', skip: 'green', note: 'yellow', warn: 'red', todo: 'red' }
export const LIGHT_ICON = { green: '✅', yellow: '🟡', red: '🔴' }

/** Длина реплики для расчёта сцены: файл с длительностью — она; иначе оценка по тексту (как считает игра: 65 мс на знак, у Мии не короче подписи) */
export const durOfLines = (lines, audit) => id => {
  const rec = lines?.[id], a = audit?.[id]
  if (a?.status === 'ok' && rec?.duration > 0) return { ms: rec.duration * 1000, est: false }
  const text = a?.now ?? rec?.text ?? ''
  return { ms: Math.max(whoOf(id) === 'mia' ? MIN_CAPTION_MS : 400, text.length * 65), est: true }
}

const plural = (n, one, few, many) => { const d = n % 10, h = n % 100; return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many }
const repl = n => `${n} ${plural(n, 'реплику', 'реплики', 'реплик')}`

/** Проверка одной реплики вместе с рисками сцены */
function withRisks(c, risks) {
  const flags = [...c.flags, ...(risks ?? []).map(r => ({ k: 'risk', icon: ICON.risk, level: r.status === 'bad' ? 'warn' : 'note', text: `${r.title} — ${r.text}` }))]
  return { ...c, flags, level: c.level === 'skip' ? 'skip' : worst(flags.map(f => f.level)) }
}

export function checkScenario({ audit, lines, orphans = [], scenario = scenarioNow() } = {}) {
  if (!audit) return { ready: false, light: null, blocks: [], risks: [], actions: [], need: [], unused: [], orphans: [] }
  const recOf = id => (audit[id]?.status === 'ok' && lines?.[id] ? { ...lines[id], text: audit[id].now } : null) // запись реплики, которую игра реально играет (устаревший звук она не играет)
  const risks = sceneRisks(scenario, durOfLines(lines, audit), { recOf }), byId = risksById(risks)
  const of = id => withRisks(checkLine(id, audit[id], lines?.[id]), byId[id])
  const all = new Map([...scenario.ids].map(id => [id, of(id)]))
  const blocks = scenario.blocks.map(b => {
    const parts = b.parts.map(p => ({ ...p, items: p.items.map(x => ({ ...x, check: all.get(x.id) })) }))
    const own = parts.flatMap(p => p.items.filter(x => !x.again)), level = worst(own.map(x => (x.check.level === 'skip' ? 'ok' : x.check.level)))
    return { ...b, parts, light: LIGHT[level], bad: own.filter(x => LIGHT[x.check.level] !== 'green').length, total: own.length, sec: own.reduce((a, x) => a + (x.check.dur ?? 0), 0) }
  })
  const list = [...all.values()], having = (k, level) => list.filter(c => c.flags.some(f => f.k === k && (!level || f.level === level))).map(c => c.id)
  const by = st => list.filter(c => st.includes(c.status)).map(c => c.id)
  const act = (k, ids, text, level) => (ids.length ? [{ k, n: ids.length, ids, text: text(ids.length), level }] : [])
  const actions = [
    ...act('voice', by(['new', 'none']), n => `озвучить ${repl(n)} (звука нет)`, 'todo'),
    ...act('revoice', by(['stale']), n => `переозвучить ${repl(n)} (текст изменён, файл говорит прежнее)`, 'todo'),
    ...act('nodur', by(['nodur']), n => `переозвучить ${repl(n)} (у звука нет длительности)`, 'todo'),
    ...act('length', having('length', 'warn'), n => `проверить длину: ${repl(n)} (файл слишком короткий или длинный для текста)`, 'warn'),
    ...act('silence', having('silence'), n => `тишина в файле: ${repl(n)} (в игре будет пауза)`, 'warn'),
    ...act('risk', having('risk', 'warn'), n => `риск сцены: ${repl(n)} (длина не помещается)`, 'warn'),
    ...act('edge', having('risk', 'note'), n => `посмотреть: ${repl(n)} (длина на грани или тишина в церемонии)`, 'note'),
    ...act('mouth', having('mouth'), n => `нет разметки рта: ${repl(n)} (рот пойдёт по тексту)`, 'note'),
    ...(orphans.length ? [{ k: 'orphans', n: orphans.length, ids: orphans, text: `лишние записи озвучки: ${orphans.length} (реплик с такими id в игре больше нет — можно не трогать)`, level: 'note' }] : []),
  ]
  const light = LIGHT[worst(actions.filter(a => a.k !== 'orphans').map(a => a.level))]
  const unused = scenario.unused.map(u => ({ ...u, check: checkLine(u.id, audit[u.id], lines?.[u.id]) }))
  return { ready: true, light, blocks, risks, actions, need: needEntries(audit, scenario.ids).map(e => e.id), unused, orphans, of: id => all.get(id) ?? null }
}

/** Одна строка-итог по сценарию: «✅ всё озвучено и согласовано» либо действия через « · » */
export const summaryLine = res => (!res.ready ? 'загружаю настройки реплик…' : res.actions.filter(a => a.k !== 'orphans').length ? res.actions.map(a => a.text).join(' · ') : `всё озвучено и согласовано${res.orphans.length ? ` · лишних записей озвучки: ${res.orphans.length}` : ''}`)

/** Короткий заголовок светофора (подробности — списком «что сделать» под ним): «Сценарий в порядке: всё озвучено и согласовано» / «Сценарий требует действий: озвучить или переозвучить 4 · проверить 6 · посмотреть 4» */
export function headLine(res) {
  if (!res.ready) return 'загружаю настройки реплик…'
  const sum = level => new Set(res.actions.filter(a => a.level === level && a.k !== 'orphans').flatMap(a => a.ids)).size
  const parts = [[sum('todo'), 'озвучить или переозвучить'], [sum('warn'), 'проверить'], [sum('note'), 'посмотреть']].filter(([n]) => n).map(([n, t]) => `${t} ${n}`)
  return parts.length ? `${res.light === 'red' ? 'Сценарий требует действий' : 'Сценарий в порядке, но посмотри'}: ${parts.join(' · ')}` : 'Сценарий в порядке: всё озвучено и согласовано'
}

/** Проверка ОДНОЙ реплики сразу после сохранения (карточка): was — её запись до правки. → { light, title, notes: [текст…] } */
export function verdictOf(id, { audit, lines, was = null, scenario = scenarioNow() } = {}) {
  if (!audit?.[id]) return null
  const res = checkScenario({ audit, lines, scenario }), c = res.of(id) ?? checkLine(id, audit[id], lines?.[id])
  const notes = c.flags.map(f => `${f.icon} ${f.text}`), now = c.dur, old = was?.duration > 0 ? was.duration : null
  if (now && old && Math.abs(now - old) >= 0.3) notes.push(`⏱ стала ${now > old ? 'длиннее' : 'короче'} на ${(Math.abs(now - old)).toFixed(1).replace('.', ',')} с (было ${old.toFixed(1).replace('.', ',')} с, стало ${now.toFixed(1).replace('.', ',')} с) — игра ждёт конца звука, следующая реплика сдвинется сама`)
  if (!scenario.ids.has(id)) notes.push('в сегодняшней игре эта реплика не звучит')
  const light = LIGHT[c.level]
  return { light, title: light === 'green' ? 'подходит: звук есть, текст совпадает, длина в порядке' : light === 'yellow' ? 'подходит, но посмотри' : 'требует действия', notes }
}
