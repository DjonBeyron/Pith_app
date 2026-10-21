// Стенд скипера: пузыри ответов. ▼ по уроку «To» с режимами ✓/✗ — у нод «Собери фразу» / «Напечатай слово» / «Выбери слово» после шага
// должна появиться реплика ученика (зелёная/красная) и реакция учителя, как у настоящих панелей. npx vite --port 5199 → node _stand/skipper/bubbles.mjs
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async () => chromium.launch())
const p = await b.newPage({ viewport: { width: 390, height: 800 } })
p.on('pageerror', e => console.log('pageerror', e.message))
await p.goto('http://localhost:5199/_stand/skipper/index.html')
await p.waitForSelector('.playerSkipper', { timeout: 20000 })
await p.waitForTimeout(2500)
const snap = () => p.evaluate(() => {
  const keys = [...document.querySelectorAll('[data-entry-key]')].map(e => e.dataset.entryKey)
  const byId = Object.fromEntries((window.__nodes ?? []).map(n => [n.id, n]))
  const last = keys.at(-1)
  const bubbles = [...document.querySelectorAll('.playerMsgBubble--responseOk, .playerMsgBubble--responseErr, .playerMsgBubble--teacherErr')].map(e => (e.classList.contains('playerMsgBubble--responseOk') ? '✓ ' : e.classList.contains('playerMsgBubble--responseErr') ? '✗ ' : 'T ') + e.innerText.trim().slice(0, 40))
  return { n: keys.length, lastType: byId[last]?.type, lastSeq: byId[last]?.seq, bubbles, text: document.querySelector('.playerFeedInner')?.innerText.slice(-260) ?? '' }
})
let mode = '✓'
const seen = { phrase_assembly: 0, type_word: 0, word_choice: 0, table: 0, say_phrase: 0 }
let s = await snap()
for (let i = 0; i < 140 && !(await p.$('.lessonSummaryCard')); i++) {
  const before = s
  const isQ = ['phrase_assembly', 'type_word', 'word_choice', 'table', 'say_phrase', 'fill_blanks'].includes(before.lastType)
  if (isQ && seen[before.lastType] % 2 === 1 && mode === '✓') { await p.click('.playerSkipperAns'); mode = '✗' } // по очереди верно/неверно
  if (isQ && mode === '✗' && seen[before.lastType] % 2 === 0) { await p.click('.playerSkipperAns'); await p.click('.playerSkipperAns'); mode = '✓' }
  const bubblesBefore = before.bubbles.length
  await p.click('.playerSkipperBtn[title^="Вниз"]')
  const t0 = Date.now()
  while (Date.now() - t0 < 4500) { await p.waitForTimeout(150); s = await snap(); if (s.n !== before.n || s.lastSeq !== before.lastSeq) break }
  await p.waitForTimeout(500); s = await snap()
  if (isQ) {
    seen[before.lastType] = (seen[before.lastType] ?? 0) + 1
    const added = s.bubbles.slice(bubblesBefore)
    console.log(`${before.lastType} #${before.lastSeq} режим ${mode}: новых пузырей ${added.length} → ${added.join(' | ') || '—'}`)
  }
}
console.log('итог:', !!(await p.$('.lessonSummaryCard')), JSON.stringify(seen))
await b.close()
