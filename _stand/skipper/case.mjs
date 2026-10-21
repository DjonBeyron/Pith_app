// Стенд скипера, детерминированный случай ▼▼▼▲▲▼▼▲▼▼▼ с логом графа: npx vite --port 5199 → node _stand/skipper/case.mjs
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
  return { n: keys.length, lastType: byId[last]?.type, lastSeq: byId[last]?.seq }
})
const act = async (what) => {
  const before = await snap()
  const mark = await p.evaluate(() => window.__pLog().length)
  await p.click(what === '▲' ? '.playerSkipperBtn[title^="Вверх"]' : '.playerSkipperBtn[title^="Вниз"]')
  let s = before
  const t0 = Date.now()
  while (Date.now() - t0 < 5000) { await p.waitForTimeout(150); s = await snap(); if (s.n !== before.n || s.lastSeq !== before.lastSeq) break }
  const lines = await p.evaluate(m => window.__pLog().slice(m).filter(l => /graph|GRAPH|reveal|timer|onNodeDone|step|typing|warm|hold/i.test(l)).slice(0, 12), mark)
  console.log(`${what} ${before.lastType}#${before.lastSeq} → ${s.lastType}#${s.lastSeq} (${Date.now() - t0} мс)`)
  for (const l of lines) console.log('    ', l.slice(0, 170))
  await p.waitForTimeout(300)
}
for (const w of ['▼', '▼', '▼', '▲', '▲', '▼', '▼', '▲', '▼', '▼', '▼']) await act(w)
await b.close()
