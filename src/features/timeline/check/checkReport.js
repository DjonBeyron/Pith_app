// «📋 Скопировать отчёт проверки» — текст для вставки в чат программисту (по образцу timelineReport.js): версия, дата, итог, проблемы по блокам сценария, риски сцены, лишние записи.
// res — scenarioCheck.checkScenario. Чистая функция.
import { sec } from './lineCheck.js'
import { LIGHT_ICON, summaryLine } from './scenarioCheck.js'

const WHO = { pit: 'Пит', mia: 'Мия' }
const KIND = { seq: 'подряд', variants: 'одна из (случайно)', branch: 'одна из (по условию)' }

export function checkReportText(res, { version = '', date = new Date() } = {}) {
  if (!res?.ready) return 'ПРОВЕРКА СЦЕНАРИЯ «ВСТРЯХНИ ПАМЯТЬ»: настройки реплик не загружены'
  const out = [`ПРОВЕРКА СЦЕНАРИЯ «ВСТРЯХНИ ПАМЯТЬ» — приложение ${version || '—'}, ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    'Сценарий собран из кода игры (все ветки), озвучка — из текущих настроек реплик.',
    `ИТОГ: ${LIGHT_ICON[res.light]} ${summaryLine(res)}`, `Нужно озвучить / переозвучить (то же число, что на вкладке «Голос»): ${res.need.length}${res.need.length ? ` — ${res.need.join(', ')}` : ''}`, '']
  for (const b of res.blocks) {
    out.push(`${LIGHT_ICON[b.light]} ${b.title.toUpperCase()} — ${b.bad ? `требуют внимания ${b.bad} из ${b.total}` : `все ${b.total} в порядке`}`)
    for (const p of b.parts) {
      const bad = p.items.filter(x => !x.again && x.check.flags.length)
      if (!bad.length) continue
      out.push(`  ${p.title}${p.alt ? ' [ветка]' : ''} (${KIND[p.kind]}):`)
      for (const x of bad) { out.push(`    ${WHO[x.who] ?? x.who} ${x.id}${x.check.dur ? ` (${sec(x.check.dur)})` : ''}: «${x.check.text}»`); for (const f of x.check.flags) out.push(`      ${f.icon} ${f.text}`) }
    }
  }
  const risks = res.risks.filter(r => r.status !== 'ok')
  out.push('', `РИСКИ СЦЕНЫ ОТ ДЛИНЫ РЕПЛИК: проверок ${res.risks.length}, требуют внимания ${risks.length}`)
  for (const r of risks) out.push(`  ${r.status === 'bad' ? '🔴' : '🟡'} ${r.title} [${r.ids.join(', ')}]: ${r.text} (число: ${r.source})`)
  const spare = res.unused.filter(u => u.check.level === 'todo')
  out.push('', `НЕ ЗВУЧАТ В ИГРЕ (запас каталога): ${res.unused.length}${spare.length ? `, из них без актуальной озвучки ${spare.length} (${spare.map(u => u.id).join(', ')}) — на игру не влияет` : ''}`)
  if (res.orphans.length) out.push(`ЛИШНИЕ ЗАПИСИ ОЗВУЧКИ (реплик с такими id больше нет): ${res.orphans.join(', ')}`)
  return out.join('\n')
}
