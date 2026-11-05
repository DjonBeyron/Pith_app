// Снимки v3.3.115 «Гонки с Питом» (Playwright, 375×812): верхняя панель (назад / бар / пауза), заряд и расход бара, перезарядка перед вторым кругом, этап 2 (бар → плашка), хвост пилюль заставки, затемнение, три пилюли в тапе.
// Запуск: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium OUT=/tmp/raceshots-bar ASK=voice|tap node _stand/race/shoot-bar.mjs
// ASK=voice — «Разгон» и «Слушай и лови» голосом (одна ошибка во «Разгоне» → есть второй круг); ASK=tap — режим «Тапаю»: три пилюли на слово, тап по верной дорожке. Решения принимает наблюдатель по DOM (без таймеров на глаз).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/raceshots-bar'
const ASK = process.env.ASK || 'voice'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { const t = m.text(); if (/\[race\] (разгон|слух)/.test(t)) console.log('LOG', t) })
const shot = async (name, clip) => { await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) }); console.log('shot', name) }
const top = { x: 0, y: 0, width: 375, height: 260 }
await page.goto(`${BASE}?only=stages&seed=r1&ask=${ASK}`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })

const state = () => page.evaluate(() => ({
  sid: document.querySelector('[data-testid="wl"]')?.dataset.sid,
  fly: document.querySelectorAll('.raceChargeFly').length, plate: !!document.querySelector('[data-testid="race-charge-plate"]'), round2: !!document.querySelector('.raceCharge[data-round="2"]'),
  barOn: !!document.querySelector('.raceBar[data-on]'), spent: document.querySelectorAll('.raceBarSeg[data-spent]').length, segs: document.querySelectorAll('.raceBarSeg').length,
  pills: [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { cap: el.getAttribute('data-cap'), lane: Number(el.dataset.lane), top: b.top, bottom: b.bottom, x: b.left + b.width / 2, y: (b.top + b.bottom) / 2 } }),
}))
const done = new Set(), once = async (key, cond, fn) => { if (!done.has(key) && cond) { done.add(key); await fn() } }
const handled = new Set()
let n = 0, end = Date.now() + 170000, lastSid = ''
while (Date.now() < end) {
  const s = await state()
  if (s.sid !== lastSid) { lastSid = s.sid; console.log('стадия', s.sid) }
  await once('charge', s.fly > 2, async () => { for (let i = 0; i < 6; i++) { await sleep(450); await shot(`01-charge-fly-${i}`) } })
  await once('morph', s.plate && s.sid === 'sprint-ann', async () => { await sleep(500); await shot('03-plate-morph') })
  await once('barfull', s.barOn && s.sid === 'sprint' && s.spent === 0, async () => { await sleep(500); await shot('04-bar-full'); await shot('04-bar-full-top', top) })
  await once('spent2', s.barOn && s.spent >= 2, async () => { await shot('05-bar-spent2'); await shot('05-bar-spent2-top', top) })
  await once('spent-all', s.barOn && s.segs > 0 && s.spent === s.segs, async () => { await shot('06-bar-empty-top', top) })
  await once('recharge', s.round2, async () => { for (let i = 0; i < 4; i++) { await sleep(500); await shot(`07-recharge-${i}`) } })
  await once('stage2', s.plate && s.sid === 'catch-ann', async () => { await sleep(500); await shot('08-stage2-plate'); await shot('08-stage2-top', top) })
  await once('catchbar', s.barOn && s.sid === 'catch', async () => { await sleep(500); await shot('09-catch-bar-trio') })
  if (['sprint', 'catch'].includes(s.sid) && ASK === 'tap') { // тап: верная пилюля — с переводом следующего слова круга (window.__race.sprint / catches), чужая — для проверки дрожи
    const list = await page.evaluate(id => (id === 'sprint' ? window.__race.sprint : window.__race.catches).map(w => w.translation), s.sid)
    const k = [...handled].filter(x => x.startsWith(s.sid)).length, want = list[k]
    const right = s.pills.find(p => p.cap === want && p.top > 20 && p.bottom < 700)
    if (right) {
      handled.add(`${s.sid}:${k}`); n += 1
      if (k === 1) { const wrong = s.pills.find(q => q.cap !== want && Math.abs(q.y - right.y) < 140); if (wrong) { await page.touchscreen.tap(wrong.x, 400); await sleep(120); await shot('10-tap-wrong') } }
      if (k === 0 || s.pills.length >= 3) await once(`trio-${s.sid}`, true, async () => { await shot(`11-trio-${s.sid}`) })
      await page.touchscreen.tap(right.x, 400)
    }
  } else if (['sprint', 'catch'].includes(s.sid)) {
    for (const p of s.pills) {
      if (p.top < 20 || p.bottom > 700) continue
      const key = `${s.sid}:${p.cap}`
      if (handled.has(key)) continue
      handled.add(key); n += 1
      await page.evaluate(t => window.__sayQueue.push(t), s.sid === 'sprint' && n === 2 ? 'table' : TR[p.cap] ?? 'nothing')
    }
  }
  if (s.sid === 'catch2' || s.sid === 'climb-ann' || s.sid === 'summary') break
  await sleep(60)
}
await sleep(500)
console.log((await page.evaluate(async () => (await import('/src/shared/lib/debug.js')).getPlayerLines())).filter(l => /\[race\]/.test(l)).join('\n'))
await page.click('[data-testid="race-pause"]'); await sleep(400); await shot('12-paused')
console.log('пилюль обработано', n)
await ctx.close(); await browser.close()
