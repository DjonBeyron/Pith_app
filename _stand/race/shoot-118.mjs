// Снимки v3.3.118 «Встряхни память» (Playwright, 375×812): плашка «Вспомни на слух», переключение слуха, проход B (на пилюле русский перевод), экран итога.
// Запуск: npx vite --port 5477 --strictPort; BASE=http://localhost:5477/_stand/race/index.html PW_CHROMIUM_PATH=/opt/pw-browsers/chromium OUT=/tmp/raceshots-118 node _stand/race/shoot-118.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5477/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/raceshots-118'
const ASK = process.env.ASK || 'voice'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
await page.goto(`${BASE}?only=stages&seed=r1&ask=${ASK}`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })

const state = () => page.evaluate(() => ({
  sid: document.querySelector('[data-testid="wl"]')?.dataset.sid,
  plate: document.querySelector('[data-testid="race-charge-plate"]')?.textContent ?? document.querySelector('.wlTurn')?.textContent ?? '',
  summary: !!document.querySelector('[data-testid="race-summary"]'),
  pills: [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { cap: el.getAttribute('data-cap'), top: b.top, bottom: b.bottom } }),
}))
const done = new Set(), once = async (key, cond, fn) => { if (!done.has(key) && cond) { done.add(key); await fn() } }
const handled = new Set()
let lastSid = '', skip = 0
const end = Date.now() + 240000
while (Date.now() < end) {
  const s = await state()
  if (s.sid !== lastSid) { lastSid = s.sid; console.log('стадия', s.sid, JSON.stringify(s.plate.slice(0, 60))) }
  await once('plate', s.sid === 'sprint-ann' && s.plate.includes('Вспомни'), async () => { await sleep(300); await shot('a-plate-vspomni') })
  await once('switch', s.sid === 'catch-sw', async () => { await sleep(300); await shot('b-switch-plate') })
  if (['sprint', 'sprint2', 'catch', 'catch2'].includes(s.sid)) {
    for (const p of s.pills) {
      if (p.top < 20 || p.bottom > 700) continue
      const key = `${s.sid}:${p.cap}`
      if (handled.has(key)) continue
      handled.add(key)
      await once(`pill-${s.sid}`, s.sid === 'catch' || s.sid === 'sprint', async () => { await sleep(150); await shot(`c-${s.sid}-pill`) })
      const say = s.sid.startsWith('catch') ? p.cap : (TR[p.cap] ?? 'nothing') // проход A: английское слово по переводу; проход B: русский перевод с пилюли
      if (s.sid === 'sprint' && ++skip % 3 === 0) { await page.evaluate(() => window.__sayQueue.push('nothing')); continue } // каждое третье слово проход A «не знает»: слабые слова и дополнительный круг
      await page.evaluate(t => window.__sayQueue.push(t), say)
    }
  }
  if (s.summary) { await sleep(900); await shot('d-final-screen'); break }
  await sleep(60)
}
await ctx.close(); await browser.close()
