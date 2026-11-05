// Снимки v3.3.117 «Гонки с Питом» (Playwright, 375×812): плашка над летящими словами, бар после плашки, расход справа налево, хвост пилюли, узор фона, пунктир «---|---:---», пауза 30 %.
// Запуск: npx vite --port 5477 --strictPort; BASE=http://localhost:5477/_stand/race/index.html PW_CHROMIUM_PATH=/opt/pw-browsers/chromium OUT=/tmp/raceshots-117 node _stand/race/shoot-117.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5477/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/raceshots-117'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const shot = async (name, clip) => { await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) }); console.log('shot', name) }
const top = { x: 0, y: 0, width: 375, height: 260 }
await page.goto(`${BASE}?only=stages&seed=r1&ask=voice`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })

const state = () => page.evaluate(() => ({
  sid: document.querySelector('[data-testid="wl"]')?.dataset.sid,
  fly: document.querySelectorAll('.raceChargeFly').length, plate: !!document.querySelector('[data-testid="race-charge-plate"]'),
  chargeBar: document.querySelector('[data-testid="race-charge-bar"]') ? 1 : 0,
  barOn: !!document.querySelector('.raceBar[data-on]'), spent: document.querySelectorAll('.raceBarSeg[data-spent]').length, segs: document.querySelectorAll('.raceBarSeg').length,
  pills: [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { cap: el.getAttribute('data-cap'), top: b.top, bottom: b.bottom } }),
}))
const done = new Set(), once = async (key, cond, fn) => { if (!done.has(key) && cond) { done.add(key); await fn() } }
const handled = new Set()
let n = 0, lastSid = '', plateFly = 0
const end = Date.now() + 150000
while (Date.now() < end) {
  const s = await state()
  if (s.sid !== lastSid) { lastSid = s.sid; console.log('стадия', s.sid) }
  await once('charge', s.fly > 2, async () => { for (let i = 0; i < 3; i++) { await sleep(350); await shot(`a-charge-${i}`) } })
  await once('plate', s.plate && s.fly > 0, async () => { plateFly = s.fly; await shot('b-plate-over-words'); await sleep(700); await shot('b2-plate-and-bar-top', top); for (let i = 0; i < 6; i++) { await sleep(700); const p = await page.evaluate(() => !!document.querySelector('[data-testid="race-charge-plate"]')); console.log('plate', p); if (p) await shot('b3-full-bar-plate-still-'+i) } })
  await once('plate-late', s.plate && s.sid === 'sprint-ann' && s.fly === 0, async () => { await shot('b3-plate-bar-full'); await shot('b3-plate-bar-full-top', top) })
  await once('barfull', s.barOn && s.sid === 'sprint' && s.spent === 0, async () => { await sleep(300); await shot('c-bar-after-start-top', top); await shot('c-lanes-dash') })
  await once('spent2', s.barOn && s.spent >= 2, async () => { await shot('d-bar-spent2-top', top) })
  if (['sprint', 'catch'].includes(s.sid)) {
    for (const p of s.pills) {
      if (p.top < 20 || p.bottom > 700) continue
      const key = `${s.sid}:${p.cap}`
      if (handled.has(key)) continue
      handled.add(key); n += 1
      await page.evaluate(t => window.__sayQueue.push(t), TR[p.cap] ?? 'nothing')
    }
  }
  if (s.spent >= 3) break
  await sleep(60)
}
console.log('plateFly', plateFly, 'обработано', n)
await page.click('[data-testid="race-pause"]'); await sleep(600); await shot('f-paused')
await ctx.close(); await browser.close()
