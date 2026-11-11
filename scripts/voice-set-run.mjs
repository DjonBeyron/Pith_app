#!/usr/bin/env node
// Прогон «Записи набора» через НАСТОЯЩИЙ Vosk и настоящие слушатели игры (CONCEPT_VOICESET.md). Одна команда:
//   node scripts/voice-set-run.mjs <набор.zip | папка набора> [вторая часть.zip …] --model путь/vosk-model-small-en-us-0.15.tar.gz [--out папка]
// Что делает: распаковывает архив(ы), поднимает dev-сервер Vite этого репозитория, открывает в Chromium страницу _stand/voice_set/ и подаёт клипы подряд в одну сессию (модель грузится один раз):
// слово → слушатель слов с правилом честного зачёта, фраза → слушатель фраз, тишина / фон / «не слова» → слушатель слов с целями-пробами (зачёта быть не должно). Итог — results.json и table.txt.
// Параметры: --repeat N (каждый клип N раз: подача идёт в реальном времени, пограничные клипы срабатывают по-разному — таблица покажет устойчивость),
// --mic-gain 1|2|4 («Чувствительность микрофона» игры; по умолчанию — как при записи, из манифеста), --only РЕГВЫР (по имени файла клипа), --limit N, --jobs N (вкладок сразу: быстрее,
// но процессор должен успевать в реальном времени), --probes house,nice (цели для клипов без слова), --phrase-pass 1|2 (проход «по словам» / «быстро», по умолчанию 2), --tail МС (ждать после
// клипа), --no-bed (без подложки-тишины между клипами), --no-hf (без поправки тракта: шум выше 9,5 кГц по огибающей исходного звука из манифеста — возвращает кускам громкость, срезанную
// хранением в 16 кГц; см. _stand/voice_set/index.html), --no-ear (без правила честного зачёта), --url АДРЕС (готовый dev-сервер), --chrome ПУТЬ. Модель — --model или переменная VOSK_EN_MODEL.
// Клипы набора — данные: имена файлов из манифеста проверяются (только clips/*.wav), в страницу отдаются по номеру.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { renderTable, rowOk } from '../src/features/pillstand/voiceset/voiceSetTable.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2), opt = {}, inputs = []
for (let k = 0; k < argv.length; k++) { const a = argv[k]; if (a.startsWith('--')) { const key = a.slice(2); opt[key] = key.startsWith('no-') || argv[k + 1] == null || argv[k + 1].startsWith('--') ? true : argv[++k] } else inputs.push(a) }
if (!inputs.length) { console.error('Использование: node scripts/voice-set-run.mjs <набор.zip | папка> [ещё части…] --model путь.tar.gz [--out папка] (остальное — в шапке файла)'); process.exit(2) }
const MODEL = opt.model || process.env.VOSK_EN_MODEL
if (!MODEL || !fs.existsSync(MODEL)) { console.error('Нужна модель Vosk: --model путь/vosk-model-small-en-us-0.15.tar.gz (или переменная VOSK_EN_MODEL)'); process.exit(2) }
const OUT = path.resolve(opt.out || path.join(path.dirname(path.resolve(inputs[0])), 'voice-set-run'))
fs.mkdirSync(OUT, { recursive: true })

// 1. Набор: архивы распаковываются в свою пустую папку; манифесты частей склеиваются
const clips = new Map(), files = new Map()
let head = null
inputs.forEach((src, n) => {
  let dir = path.resolve(src)
  if (/\.zip$/i.test(src)) { dir = path.join(OUT, 'set', `part${n + 1}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-q', '-o', path.resolve(src), '-d', dir]) }
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  if (m.kind !== 'pithy-voiceset') throw new Error(`${src}: это не набор (manifest.kind = ${m.kind})`)
  head ??= m
  for (const c of m.clips ?? []) {
    if (!Number.isInteger(c.i) || !/^clips\/[A-Za-z0-9._-]+\.wav$/.test(String(c.file))) { console.warn(`пропущен клип с плохим именем: ${JSON.stringify(c.file)}`); continue }
    const f = path.join(dir, c.file)
    if (!fs.existsSync(f)) { console.warn(`нет файла ${c.file}`); continue }
    clips.set(c.i, c); files.set(c.i, f)
  }
})
const only = opt.only ? new RegExp(opt.only) : null
let list = [...clips.values()].sort((a, b) => a.i - b.i).filter(c => !only || only.test(c.file))
if (opt.limit) list = list.slice(0, Number(opt.limit))
const repeat = Math.max(1, Number(opt.repeat ?? 1)), queue = Array.from({ length: repeat }, (_, run) => list.map(c => ({ c, run }))).flat()
const micGain = Number(opt['mic-gain'] ?? head.audio?.micGain ?? 2), tailMs = Number(opt.tail ?? 1000), jobs = Math.max(1, Number(opt.jobs ?? 1)), ear = !opt['no-ear']
const probes = String(opt.probes ?? 'house,nice').split(',').map(s => s.trim()).filter(Boolean), wordByWord = String(opt['phrase-pass'] ?? '2') === '1'
const silence = opt['no-bed'] ? null : [...clips.values()].find(c => c.id === 'silence')
const hfOf = c => (opt['no-hf'] || !c.env?.length ? null : { env: c.env, chunkMs: c.chunkMs, seed: c.i })
const title = `${head.device ?? '?'}, v${head.version ?? '?'}, записан ${String(head.createdAt ?? '').slice(0, 16).replace('T', ' ')}; частей ${inputs.length}${head.parts > inputs.length ? ` из ${head.parts}` : ''}`
console.log(`Набор: ${title}\nклипов к прогону ${list.length} из ${clips.size}${repeat > 1 ? ` × ${repeat} повторов` : ''}; micGain ×${micGain}; подложка: ${silence ? silence.file : 'нет'}; вкладок ${jobs}; вывод — ${OUT}`)

// 2. Dev-сервер Vite (свой или готовый) и Chromium
let server = null, base = opt.url
if (!base) {
  const { createServer } = await import('vite')
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: Number(opt.port ?? 5731), host: '127.0.0.1' } })
  await server.listen()
  base = `http://127.0.0.1:${server.httpServer.address().port}`
}
const { chromium } = await import('playwright')
const chrome = opt.chrome || process.env.PW_CHROME || ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(p => fs.existsSync(p))
const browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), args: ['--autoplay-policy=no-user-gesture-required'] })

async function openPage() {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('ОШИБКА СТРАНИЦЫ', e.message))
  await page.route('**/__model-en.tar.gz', r => r.fulfill({ path: MODEL, contentType: 'application/gzip' }))
  await page.route('**/__set/*', r => { const f = files.get(Number(/\/__set\/(\d+)\.wav/.exec(r.request().url())?.[1])); return f ? r.fulfill({ path: f, contentType: 'audio/wav' }) : r.fulfill({ status: 404, body: '' }) })
  await page.goto(`${base}/_stand/voice_set/index.html`)
  await page.waitForFunction(() => window.__ok, null, { timeout: 60000 })
  await page.evaluate(() => window.__init({ lang: 'en' }))
  if (silence) await page.evaluate(([u, hf]) => window.__bed(u, hf), [`/__set/${silence.i}.wav`, hfOf(silence)])
  return page
}

// 3. Клип → строка результата
const text = c => c.word ?? c.phrase ?? c.id
const flags = c => ['noVoice', 'late', 'early'].filter(k => c[k]).map(k => ({ noVoice: 'при записи голоса не было', late: 'слово у конца окна', early: 'клип начался с голоса' })[k]).join(', ')
async function runClip(page, c) {
  const wav = `/__set/${c.i}.wav`, hf = hfOf(c), common = { i: c.i, file: c.file, kind: c.kind, text: text(c), variant: c.variant, rep: c.rep, far: !!c.far, expect: c.expect, rmsPeak: c.rmsPeak, rmsNoise: c.rmsNoise, clipRms: c.env?.length ? Math.round(Math.sqrt(c.env.reduce((q, v) => q + v * v, 0) / c.env.length) / 10) / 1e5 : null, gamePeak: c.gamePeak, manifestVoiceMs: c.voiceMs, note: flags(c) }
  let r
  if (c.kind === 'phrase') r = await page.evaluate(o => window.__phrase(o), { wav, hf, words: c.phrase.split(/\s+/), micGain, wordByWord, tailMs: Math.max(tailMs, 2600) })
  else {
    const targets = c.kind === 'word' ? [c.word] : probes
    for (const target of targets) { r = { ...(await page.evaluate(o => window.__word(o), { wav, hf, target, micGain, ear, tailMs })), target }; if (r.hit) break }
  }
  const row = { ...common, ...r, fromEndMs: r.hit && c.voiceOffMs != null ? r.hitAt - c.voiceOffMs : null }
  row.ok = rowOk(row)
  return row
}
const line = r => `${String(r.i + 1).padStart(3, '0')} ${r.file.replace('clips/', '').padEnd(40)} ${r.ok ? '✓' : '✗'} ${r.hit ? `ЗАЧЁТ${r.ratio != null ? ` ratio ${r.ratio}` : ''} на ${r.hitAt} мс${r.fromEndMs != null ? ` (от конца голоса ${r.fromEndMs >= 0 ? '+' : ''}${r.fromEndMs})` : ''}` : 'нет зачёта'} | пик: вход ${r.tapPeak} / манифест ${r.rmsPeak}; движок ${r.engPeak} / манифест ${r.gamePeak}; фон: вход ${r.tapNoise} / манифест ${r.rmsNoise} | ` +
  `${r.kind === 'phrase' ? `слова ${JSON.stringify(r.words)}, черновики: ${[...new Set(r.drafts.map(d => d[1]))].slice(-3).join(' | ')}` : `итоги: ${r.finals.map(f => `«${f.text}»${f.by ? ` ${f.by}` : ''}${f.agcMax > 1 ? ` ×${f.agcMax}` : ''}${f.gatedVoiceMs ? ` ⚠ мимо Vosk ${f.gatedVoiceMs} мс` : ''}`).join(' → ') || '—'}`}`

// 4. Прогон: вкладки берут клипы из общей очереди; результаты пишутся по ходу
const t0 = Date.now(), rows = [], info = { title, micGain, bed: silence ? `тишина набора (${silence.file})` : 'нет (ровный ноль)', hf: !opt['no-hf'] && list.some(c => c.env?.length), ear, probes, phrasePass: wordByWord ? 1 : 2, tailMs, jobs, repeat, inputs, manifest: { version: head.version, device: head.device, ua: head.ua, createdAt: head.createdAt, audio: head.audio, track: head.track, settings: head.settings } }
const order = (a, b) => a.i - b.i || a.run - b.run
const save = () => fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ info, rows: [...rows].sort(order) }))
let next = 0, failed = 0
try {
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) || 1 }, async () => {
    const page = await openPage()
    while (next < queue.length) {
      const { c, run } = queue[next++]
      try { const row = { ...(await runClip(page, c)), run }; rows.push(row); console.log(line(row)) } catch (e) { failed++; console.log(`${String(c.i + 1).padStart(3, '0')} ${c.file} — ОШИБКА ПРОГОНА: ${String(e?.message ?? e).split('\n')[0]}`) }
      save()
    }
  }))
} finally { await browser.close(); await server?.close() }
rows.sort(order)
save()
const table = renderTable(rows, info) + `\nвремя прогона ${Math.round((Date.now() - t0) / 1000)} с${failed ? `; клипов с ошибкой прогона: ${failed}` : ''}`
fs.writeFileSync(path.join(OUT, 'table.txt'), table + '\n')
console.log('\n' + table + `\n\nФайлы: ${path.join(OUT, 'results.json')}, ${path.join(OUT, 'table.txt')}`)
