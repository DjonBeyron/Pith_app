#!/usr/bin/env node
// Регрессия «Записи набора» (CONCEPT_VOICESET.md): прогоняет через настоящий Vosk все наборы из tests/voice-sets/*.zip (scripts/voice-set-run.mjs) и сверяет с базовой линией
// tests/voice-sets/baseline.json: по каждому набору и виду клипов «верно» не должно стать меньше. Одна команда:
//   node scripts/voice-set-regress.mjs --model путь/vosk-model-small-en-us-0.15.tar.gz [--out папка] [--chrome ПУТЬ] [--jobs 3] [--update] [--reuse]
// --update — записать текущий прогон как новую линию (после осознанного улучшения); --reuse — не гонять набор заново, если в --out уже есть его results.json.
// Прогон по очереди (по одному набору), не параллельно: три вкладки Chromium на набор уже заняты. Выход 1 — есть регрессия.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { aggregate, compareBaseline } from '../src/features/pillstand/voiceset/voiceSetBaseline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SETS = path.join(ROOT, 'tests', 'voice-sets'), BASE = path.join(SETS, 'baseline.json')
const argv = process.argv.slice(2), opt = {}
for (let k = 0; k < argv.length; k++) { const a = argv[k]; if (a.startsWith('--')) { const key = a.slice(2); opt[key] = argv[k + 1] == null || argv[k + 1].startsWith('--') ? true : argv[++k] } }
const MODEL = opt.model || process.env.VOSK_EN_MODEL
if (!MODEL || !fs.existsSync(MODEL)) { console.error('Нужна модель Vosk: --model путь/vosk-model-small-en-us-0.15.tar.gz (или переменная VOSK_EN_MODEL)'); process.exit(2) }
const OUT = path.resolve(opt.out || path.join(ROOT, 'report', 'voice-set-regress'))
const zips = fs.readdirSync(SETS).filter(f => f.endsWith('.zip')).sort()
if (!zips.length) { console.error(`В ${SETS} нет наборов (*.zip)`); process.exit(2) }
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {}

const now = {}
for (const z of zips) {
  const name = z.replace(/\.zip$/, ''), dir = path.join(OUT, name), res = path.join(dir, 'results.json')
  if (!(opt.reuse && fs.existsSync(res))) {
    const args = [path.join(ROOT, 'scripts', 'voice-set-run.mjs'), path.join(SETS, z), '--model', MODEL, '--out', dir, '--jobs', String(opt.jobs ?? 3)]
    if (opt.chrome) args.push('--chrome', String(opt.chrome))
    console.log(`== набор ${name}: прогон…`)
    execFileSync('node', args, { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT })
  }
  now[name] = aggregate(JSON.parse(fs.readFileSync(res, 'utf8')).rows)
}

if (opt.update) {
  fs.writeFileSync(BASE, `${JSON.stringify(now, null, 2)}\n`)
  console.log(`Линия записана: ${path.relative(ROOT, BASE)}`)
  process.exit(0)
}

let bad = 0
for (const [name, agg] of Object.entries(now)) {
  const cmp = compareBaseline(base[name], agg)
  const total = Object.values(agg).reduce((n, v) => ({ ok: n.ok + v.ok, total: n.total + v.total }), { ok: 0, total: 0 })
  console.log(`\n${name}: верно ${total.ok} из ${total.total}${base[name] ? '' : ' (линии нет — запусти с --update)'}`)
  for (const l of cmp.regress) console.log(`  ✗ РЕГРЕССИЯ ${l}`)
  for (const l of cmp.better) console.log(`  ↑ лучше линии ${l}`)
  for (const l of cmp.missing) console.log(`  ? не сравнить ${l}`)
  bad += cmp.regress.length + (base[name] ? cmp.missing.length : 1)
}
console.log(bad ? `\nИТОГО: проблем ${bad}` : '\nИТОГО: регрессий нет')
process.exit(bad ? 1 : 0)
