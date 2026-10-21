// Стенд скипера: npx vite --port 5199 → node _stand/skipper/walk.mjs [зерно]. Случайная прогулка ▲/▼ по уроку «To» на настоящем плеере, затем ▼ до итога (PROJECT.md «Скипер: прогон туда-обратно»)
import { chromium } from 'playwright'
const SEED = Number(process.argv[2] ?? 1)
let seed = SEED
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async () => chromium.launch())
const p = await b.newPage({ viewport: { width: 390, height: 800 } })
const errs = []
p.on('pageerror', e => errs.push('pageerror: ' + e.message))
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|supabase/.test(t)) errs.push('console: ' + t.slice(0, 160)) })
await p.goto('http://localhost:5199/_stand/skipper/index.html')
await p.waitForSelector('.playerSkipper', { timeout: 20000 })
await p.waitForTimeout(2500)

const snap = () => p.evaluate(() => {
  const keys = [...document.querySelectorAll('[data-entry-key]')].map(e => e.dataset.entryKey)
  const byId = Object.fromEntries((window.__nodes ?? []).map(n => [n.id, n]))
  const last = keys.at(-1)
  return {
    n: keys.length, last, lastType: byId[last]?.type ?? '?', lastSeq: byId[last]?.seq ?? '?',
    dup: keys.length !== new Set(keys).size,
    summary: !!document.querySelector('.lessonSummaryCard'),
    typing: !!document.querySelector('.playerTyping, [class*="typing"]'),
    canBack: !document.querySelector('.playerSkipperBtn[title^="Вверх"]')?.disabled,
    audioPlaying: [...document.querySelectorAll('audio')].filter(a => !a.paused && !a.muted).length,
  }
})
const back = () => p.click('.playerSkipperBtn[title^="Вверх"]')
const fwd = () => p.click('.playerSkipperBtn[title^="Вниз"]')
const log = []
const problems = []
let s = await snap()
const maxSeq = () => Math.max(...[...document.querySelectorAll('[data-entry-key]')].map(() => 0))
// Фаза 1: случайная прогулка
for (let i = 0; i < 120 && !s.summary; i++) {
  if (rnd() < 0.15) { await p.click('.playerSkipperAns'); await p.waitForTimeout(80) } // режим ответа по кругу ✓ → ✗ → ?
  const goBack = s.canBack && rnd() < 0.4
  const before = s
  if (goBack) await back(); else await fwd()
  // ждём изменения ленты (до 4 с) — forward на вопросе отвечает и показывает следующую ноду; назад снимает последнюю
  let changed = false
  const t0 = Date.now()
  while (Date.now() - t0 < 4500) {
    await p.waitForTimeout(150)
    s = await snap()
    if (s.n !== before.n || s.last !== before.last || s.summary) { changed = true; break }
  }
  const dt = Date.now() - t0
  log.push(`${i}: ${goBack ? '▲' : '▼'} ${before.n}(${before.lastType}#${before.lastSeq}) → ${s.n}(${s.lastType}#${s.lastSeq}) ${dt}мс${changed ? '' : ' ‼ без изменений'}${s.dup ? ' ‼ дубли' : ''}`)
  if (!changed) problems.push(`шаг ${i} ${goBack ? '▲' : '▼'}: лента не изменилась за 4,5 с (последняя ${before.lastType} #${before.lastSeq}, n=${before.n})`)
  // Точный счёт не проверяем: окно ленты (feedWindow, 16 записей) и ноды-реакции без своей строки меняют число записей DOM не на 1
  if (goBack && changed && s.n > before.n + 1) problems.push(`шаг ${i} ▲: записей стало больше на ${s.n - before.n}`)
  if (s.dup) problems.push(`шаг ${i}: дубликаты ключей в ленте`)
  if (goBack && s.audioPlaying) problems.push(`шаг ${i} ▲: после «назад» продолжает звучать ${s.audioPlaying} <audio>`)
  await p.waitForTimeout(250)
}
// Фаза 2: только вперёд до итога
let steps = 0
while (!s.summary && steps < 400) {
  const before = s
  await fwd(); steps++
  const t0 = Date.now()
  while (Date.now() - t0 < 4500) { await p.waitForTimeout(150); s = await snap(); if (s.n !== before.n || s.last !== before.last || s.summary) break }
  if (s.n === before.n && s.last === before.last && !s.summary) { problems.push(`фаза 2, шаг ${steps}: застряли на ${before.lastType} #${before.lastSeq}`); break }
}
console.log(log.join('\n'))
console.log(`\nФаза 2: ${steps} шагов ▼, итог показан: ${s.summary}, сообщений: ${s.n}`)
console.log('Проблемы:', problems.length ? '\n' + problems.join('\n') : 'нет')
console.log('Ошибки страницы:', errs.length ? '\n' + errs.slice(0, 15).join('\n') : 'нет')
await b.close()
