// Отчёт покрытия плана нового пользователя: что из PLAN_NEW_USER.md / CHECK_NEW_USER.md проверено и что увидел симулированный человек.
// Читает test-results/results.json (JSON-репортер Playwright, playwright.config.js) после прогона `npx playwright test e2e/newbie-*.spec.js --project=newbie`
// и пишет report/newbie-coverage.md: «Пункт плана | Сценарий/персона | Статус | Что увидел пользователь | Видео/трасса».
// Связь пункта с тестами — тег в названии `[B2.sound] ...`, «что увидел» — вложение `итог` (e2e/helpers/newbieEvidence.js), список пунктов — newbieCoverageItems.mjs.
// Без зависимостей. Запуск: node scripts/newbie-coverage-report.mjs [results.json] [report/newbie-coverage.md]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { SECTIONS } from './newbieCoverageItems.mjs'

const root = process.cwd()
const inFile = resolve(process.argv[2] ?? 'test-results/results.json')
const outFile = resolve(process.argv[3] ?? 'report/newbie-coverage.md')
if (!existsSync(inFile)) { console.error(`Нет ${inFile}: сначала прогон Playwright (проект newbie) с JSON-репортером`); process.exit(1) }
const data = JSON.parse(readFileSync(inFile, 'utf8'))

// ---------- сбор тестов ----------
const tests = [] // { file, title, tags, status, attachments, error }
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    const tags = /^\[([^\]]+)\]/.exec(spec.title)?.[1].split(',').map(s => s.trim()).filter(Boolean) ?? []
    for (const t of spec.tests ?? []) {
      const last = t.results?.at(-1) ?? {}
      tests.push({ file: spec.file, title: spec.title, tags, status: t.status, attachments: last.attachments ?? [], error: last.error?.message ?? '' })
    }
  }
  for (const s of suite.suites ?? []) walk(s)
}
for (const s of data.suites ?? []) walk(s)

const proofsOf = test => test.attachments.filter(a => a.name === 'итог').flatMap(a => {
  try {
    const raw = a.body ? Buffer.from(a.body, 'base64').toString('utf8') : readFileSync(a.path, 'utf8')
    return [JSON.parse(raw)]
  } catch { return [] }
})
const rel = p => relative(root, p).replaceAll('\\', '/')
const cell = s => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').replaceAll('|', '\\|').trim()
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const passed = t => t.status === 'expected' || t.status === 'flaky'

function who(t) {
  const base = t.file.replace(/^.*\//, '').replace('.spec.js', '')
  const kind = base.startsWith('newbie-coverage-') ? 'прогон' : 'персона'
  return `${kind} ${base.replace('newbie-', '')}: ${short(t.title.replace(/^\[[^\]]+\]\s*/, ''), 60)}`
}

function media(t) {
  return t.attachments.filter(a => a.path && (a.name === 'video' || a.name === 'trace')).map(a => `\`${rel(a.path)}\``)
}

// Скриншоты ключевых моментов пункта (e2e/helpers/newbieEvidence.js: shot → report/newbie-screens/<пункт>-<slug>.png): вставка картинок рядом с отчётом
function screens(tests, id) {
  const names = tests.flatMap(t => t.attachments.filter(a => a.name.startsWith('скриншот ')).map(a => a.name.slice('скриншот '.length)))
  return [...new Set(names)].filter(n => n.startsWith(`${id}-`)).map(n => `![${n.slice(id.length + 1).replaceAll('-', ' ')}](newbie-screens/${n}.png)`)
}

// ---------- строки таблицы ----------
const counts = { 'прошёл': 0, 'баг': 0, 'только руками': 0, 'не запускался': 0 }
const bugs = []
const rows = []
for (const section of SECTIONS) {
  rows.push({ section: section.name })
  for (const item of section.items) {
    const mine = tests.filter(t => t.tags.includes(item.id))
    const proofs = mine.flatMap(t => proofsOf(t).filter(p => p.item === item.id).map(p => ({ ...p, t })))
    const failed = mine.filter(t => !passed(t) && t.status !== 'skipped')
    let status
    if (!mine.length) status = 'не запускался'
    else if (failed.length) status = 'баг'
    else if (proofs.length && proofs.every(p => p.manual)) status = 'только руками'
    else status = 'прошёл'
    counts[status]++
    for (const t of failed) bugs.push({ id: item.id, test: who(t), error: short(cell(t.error), 400) })

    const seen = proofs.map(p => (p.manual ? `ВРУЧНУЮ: ${p.why}` : p.seen))
    if (failed.length) seen.push(...failed.map(t => `УПАЛ: ${short(cell(t.error), 200)}`))
    const withMedia = mine.filter(t => !proofsOf(t).some(p => p.item === item.id && p.manual)).slice(0, 3)
    rows.push({
      id: item.id,
      title: item.title,
      scenario: [...new Set(mine.map(who))].join('<br>') || '—',
      status: status + (mine.some(t => t.status === 'flaky') ? ' (с повтором)' : ''),
      seen: [...[...new Set(seen)].map(s => short(cell(s), 500)), ...screens(mine, item.id)].join('<br>') || '—',
      media: withMedia.flatMap(t => media(t)).join('<br>') || '—',
    })
  }
}

// ---------- вывод ----------
const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(existsSync('src/shared/lib/version.js') ? readFileSync('src/shared/lib/version.js', 'utf8') : '')?.[1] ?? '?'
const out = [
  '# Покрытие плана нового пользователя: что увидели симулированные люди',
  '',
  `Версия приложения ${version}. Прогон: ${new Date(data.stats?.startTime ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')} UTC, тестов с тегом пункта: ${tests.filter(t => t.tags.length).length}.`,
  `Итог по пунктам: прошёл — ${counts['прошёл']}, баг — ${counts['баг']}, только руками — ${counts['только руками']}, не запускался — ${counts['не запускался']}.`,
  'Видео и трасса записаны для каждого сценария (`npx playwright show-trace <trace.zip>`; видео — `video.webm` рядом). «Только руками» — пункты, которые нельзя проверить автоматически: причина в столбце «Что увидел», проверять по CHECK_NEW_USER.md.',
  '',
]
for (const r of rows) {
  if (r.section) { out.push('', `## ${r.section}`, '', '| Пункт плана | Сценарий / персона | Статус | Что увидел пользователь | Видео / трасса |', '|---|---|---|---|---|'); continue }
  out.push(`| **${r.id}** ${cell(r.title)} | ${r.scenario} | ${r.status} | ${r.seen} | ${r.media} |`)
}
if (bugs.length) {
  out.push('', '## Упавшие сценарии', '')
  for (const b of bugs) out.push(`- **${b.id}** — ${b.test}: ${b.error}`)
}
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${out.join('\n')}\n`)
console.log(`Отчёт: ${rel(outFile)} (прошёл ${counts['прошёл']}, баг ${counts['баг']}, только руками ${counts['только руками']}, не запускался ${counts['не запускался']})`)
