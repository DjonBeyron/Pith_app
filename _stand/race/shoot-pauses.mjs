// Паузы тишины между ступенями «Встряхни память» (Playwright, 375×812): ?only=stages, ASK=voice|tap, LINES=1 — реплики Пита с озвучкой (гудки), иначе без озвучки (как у владельца до озвучки).
// Драйвер отвечает верно: «Разгон» — английское слово, «Слушай и лови» — перевод (по строке журнала «[race] голос: …»), «Фразы» — тап по верной / __phraseSay. На странице сэмплер (rAF) пишет события:
// смена стадии (data-sid), появление плашки (wl-turn), первая пилюля стадии; журнал игры ([PLAYER] …) — с часами страницы. Итог: таблица «переход → плашка / реплика / первая пилюля» и строки «[start] переход …».
// Запуск: npx vite --port 5441 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-pauses.mjs (OUT=каталог, SECS=длительность)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5441/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/pauses'
const ASK = process.env.ASK || 'voice'
const SECS = Number(process.env.SECS || 150)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => {
  localStorage.setItem('pithy_weak_device_v6', '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '1')
  window.__ev = []
  const push = (k, v) => window.__ev.push({ t: Math.round(performance.now()), k, v })
  let sid = null, plate = null, pills = 0
  const tick = () => {
    const wl = document.querySelector('[data-testid="wl"]')
    const s = wl?.dataset.sid ?? null
    if (s !== sid) { sid = s; pills = 0; push('sid', s) }
    const p = document.querySelector('.wlTurn:not(.wlTurn--leave)')?.textContent ?? null
    if (p !== plate) { plate = p; if (p) push('plate', p) }
    const n = document.querySelectorAll('.wlPill[data-held]:not([data-rise]):not([data-fail])').length
    if (n > pills && pills === 0) push('pill', n)
    pills = n
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const page = await ctx.newPage()
const log = []
page.on('console', async m => { const t = m.text(); if (t.startsWith('[PLAYER]')) log.push({ at: Date.now(), t: t.slice(9) }) })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?seed=r1&ask=${ASK}&only=stages${process.env.LINES === '1' ? '&lines=1' : ''}`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 15000 })
const t0 = Date.now()
const done = new Set()
while (Date.now() - t0 < SECS * 1000) {
  const sid = await page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null)
  if (sid?.startsWith('climb')) { await sleep(1500); break }
  const pre = [...log].reverse().find(l => /\[race\] голос: повтор|\[phrase-voice\] перед ходом/.test(l.t))
  if (pre && !done.has(pre.at)) {
    const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, cap: el.getAttribute('data-cap'), mode: el.getAttribute('data-mode') } }).filter(p => p.top > 80 && p.top < 600))
    const ph = pre.t.match(/перед ходом «(.*?)» \((\w+)\)/)
    if (ph) {
      if (ph[2] === 'say') { if (pills.length) { done.add(pre.at); await page.evaluate(w => window.__phraseSay(w), ph[1].toLowerCase().replace(/[^a-z' ]/g, '')) } }
      else { const p = pills.find(x => (ph[2] === 'pick' ? x.cap === ph[1] : true) && x.top > 812 * 0.3); if (p) { done.add(pre.at); await page.touchscreen.tap(187, p.top + p.h / 2) } }
    } else if (pills.length) {
      const sprint = !/говорит слово/.test(pre.t)
      const w = sprint ? pre.t.match(/слово «(.*?)»/)?.[1] : pre.t.match(/на пилюле «(.*?)»/)?.[1]
      done.add(pre.at)
      if (ASK === 'tap') await page.touchscreen.tap(187, pills[0].top + pills[0].h / 2)
      else await page.evaluate(x => window.__sayQueue.push(x), (w ?? '').toLowerCase())
    }
  }
  await sleep(60)
}
const ev = await page.evaluate(() => window.__ev)
const pt0 = await page.evaluate(() => performance.now()) - (Date.now() - t0)
const all = [...ev.map(e => ({ t: e.t - pt0, s: `@${e.k} ${e.v}` })), ...log.map(l => ({ t: l.at - t0, s: l.t }))].sort((a, b) => a.t - b.t)
writeFileSync(`${OUT}/timeline.txt`, all.map(e => `${String(Math.round(e.t)).padStart(7)} ${e.s.slice(0, 260)}`).join('\n'))
console.log(all.filter(e => /^@|\[start\] переход|\[say\]/.test(e.s)).map(e => `${String(Math.round(e.t)).padStart(7)} ${e.s.slice(0, 200)}`).join('\n'))
await ctx.close(); await browser.close()
