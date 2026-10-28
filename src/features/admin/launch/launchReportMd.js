// Отчёт «Запуск» в Markdown — для scripts/launch-stats.mjs (stdout и GITHUB_STEP_SUMMARY).
// Чистая функция: берёт результат buildLaunchStats и ничего не читает из сети.

const MARK = { ok: '✅', fail: '❌', nodata: '❔', info: 'ℹ️' }
const MAX_ITEMS = 25 // сколько конкретных фраз/слов печатать под строкой

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const unit = r => (r.kind === 'percent' ? '%' : '')

function haveText(r) {
  if (r.status === 'nodata') return 'нет данных'
  if (r.kind === 'bool') return r.have ? 'да' : 'нет'
  if (r.kind === 'percent') return `${r.have}% (${r.count} из ${r.total})`
  return String(r.have ?? '—')
}

function needText(r) {
  if (r.need == null) return '—'
  if (r.kind === 'bool') return 'все 3'
  if (r.limit === 'max') return `не больше ${r.need}`
  return `не меньше ${r.need}${unit(r)}`
}

function missingText(r) {
  if (r.status === 'nodata' || r.status === 'info') return '—'
  if (r.ok) return '✓'
  if (r.kind === 'percent') return `ещё ${r.missing} шт.`
  if (r.kind === 'bool') return `выключено: ${r.missing}`
  return r.limit === 'max' ? `лишних: ${r.missing}` : String(r.missing)
}

function itemsBlock(r) {
  if (!r.items?.length || (r.status === 'ok' && r.id !== 'decks')) return []
  const shown = r.items.slice(0, MAX_ITEMS).map(i => `- ${i.id === i.title ? `**${cell(i.title)}**` : `\`${i.id}\` — ${cell(i.title)}`}${i.note ? ` (${cell(i.note)})` : ''}`)
  const rest = r.items.length - shown.length
  return ['', `**${r.itemsLabel} (${r.items.length}):**`, ...shown, ...(rest > 0 ? [`- … и ещё ${rest}`] : [])]
}

export function formatLaunchReport({ rows, summary }, { header = '' } = {}) {
  const out = [`# ${summary.text}`, '', ...(header ? [header, ''] : [])]
  out.push('| | Условие | Есть | Нужно | Не хватает |', '|---|---|---|---|---|')
  for (const r of rows) out.push(`| ${MARK[r.status]} | ${cell(r.title)} | ${haveText(r)} | ${needText(r)} | ${missingText(r)} |`)
  out.push('')
  for (const r of rows) {
    const extra = itemsBlock(r)
    const notes = [r.status === 'ok' || r.status === 'info' ? '' : r.why, r.hint, r.note].filter(Boolean)
    if (!extra.length && !(r.status === 'fail' || r.status === 'nodata')) continue
    out.push(`## ${MARK[r.status]} ${cell(r.title)}`, ...notes.map(n => `${cell(n)}`).flatMap(n => ['', n]), ...extra, '')
  }
  return out.join('\n')
}
