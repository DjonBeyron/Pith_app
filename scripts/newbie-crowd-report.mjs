// Отчёт массового прогона «случайные пользователи» (e2e/newbie-crowd.spec.js): сколько людей, сколько сбоев, по каждому сбою — seed, профиль, что нарушено.
// Читает test-results/results.json (JSON-репортер Playwright) и пишет report/newbie-crowd.md. Без зависимостей.
// Запуск: node scripts/newbie-crowd-report.mjs [results.json] [report/newbie-crowd.md]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const inFile = resolve(process.argv[2] ?? 'test-results/results.json')
const outFile = resolve(process.argv[3] ?? 'report/newbie-crowd.md')
if (!existsSync(inFile)) { console.error(`Нет ${inFile}: сначала прогон e2e/newbie-crowd.spec.js`); process.exit(1) }
const data = JSON.parse(readFileSync(inFile, 'utf8'))

const users = []
const walk = suite => {
  for (const spec of suite.specs ?? []) {
    if (!spec.title.startsWith('[CROWD] #')) continue
    for (const t of spec.tests ?? []) {
      const last = t.results?.at(-1) ?? {}
      const att = (last.attachments ?? []).find(a => a.name === 'crowd')
      let summary = null
      try { summary = att ? JSON.parse(att.body ? Buffer.from(att.body, 'base64').toString('utf8') : readFileSync(att.path, 'utf8')) : null } catch { /* нет вложения */ }
      users.push({ title: spec.title, status: t.status, summary, error: (last.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, ''), attachments: last.attachments ?? [] })
    }
  }
  for (const s of suite.suites ?? []) walk(s)
}
for (const s of data.suites ?? []) walk(s)

const ok = u => u.status === 'expected' || u.status === 'flaky'
const bad = users.filter(u => !ok(u) && u.status !== 'skipped')
const tally = {}
for (const u of users) for (const [k, n] of Object.entries(u.summary?.stat ?? {})) tally[k] = (tally[k] ?? 0) + n
const steps = users.reduce((n, u) => n + (u.summary?.steps ?? 0), 0)

const out = [
  '# Массовый прогон: случайные пользователи',
  '',
  `Людей: ${users.length}, без нарушений: ${users.length - bad.length}, со сбоем: ${bad.length}. Действий всего: ${steps}.`,
  `Действия по видам: ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}.`,
  '',
]
if (bad.length) {
  out.push('## Сбои', '')
  for (const u of bad) {
    const p = u.summary?.profile
    out.push(`### seed ${p?.seed ?? u.title}`, '', `Профиль: ${p ? `${p.width} px, ${p.sound ? 'со звуком' : 'без звука'}, группа ${p.group}, день ${p.day}, темп ${p.tempo}, обезьяна ${Math.round(p.monkey * 100)}%, ${Math.round(p.durationMs / 1000)} с` : u.title}.`, '')
    for (const v of u.summary?.violations ?? []) out.push(`- ${v.text} — ×${v.n}, на шаге ${v.step} (${v.sec} с); перед этим: ${v.recent.join(' → ')}`)
    if (!(u.summary?.violations ?? []).length) out.push(`- ${u.error.split('\n').slice(0, 6).join(' ').slice(0, 600)}`)
    const media = u.attachments.filter(a => a.path && (a.name === 'video' || a.name === 'trace')).map(a => `\`${relative(process.cwd(), a.path)}\``)
    if (media.length) out.push('', `Видео/трасса: ${media.join(', ')}`)
    out.push('', `Повтор: \`CROWD_SEED=${p?.seed} CROWD_N=1 npx playwright test e2e/newbie-crowd.spec.js --project=newbie\``, '')
  }
}
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${out.join('\n')}\n`)
console.log(`Отчёт: ${relative(process.cwd(), outFile)} (людей ${users.length}, сбоев ${bad.length})`)
