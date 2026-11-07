// Пит не дёргается на промахе (Playwright, 375×812, CPU 4×): «Разгон» голосом (?only=sprint&ask=voice), на каждой второй пилюле драйвер «говорит» не то и покадрово (rAF) пишет геометрию головы 1,5 с после события:
// transform / translate svg, контур головы, глаза, зрачки, рот, лицо (data-face). ИТОГ — сколько кадров изменилось до следующего уворота (он уже не от события).
// MODE=wrong — чужое слово (итог Vosk), MODE=unk — недоговорил (итог [unk]), MODE=part — недоговорённое слово черновиком (window.__partialQueue). FULL=1 — все кадры.
// Запуск: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium MODE=wrong node _stand/race/shoot-jitter.mjs
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const MODE = process.env.MODE || 'wrong'
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }).catch(async () => chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }))
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { const t = m.text(); if (/\[(dodge|cat)\]/.test(t) && process.env.V) console.log('LOG', t.slice(0, 200)) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?only=sprint&ask=voice&seed=r1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
await page.evaluate(() => {
  window.__rec = []
  const loop = () => {
    const c = document.querySelector('.wlCat'), s = c?.querySelector('.wlCatSvg')
    if (c) { const f = c.dataset.face, h = c.querySelector(`[data-part="head"][data-face="${f}"]`); const cs = getComputedStyle(c), ss = getComputedStyle(s); const b = s.getBoundingClientRect()
      const R = el => el ? (r => `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`)(el.getBoundingClientRect()) : '-'
      const tl = h?.querySelector('.mx-tilt')
      window.__rec.push({ t: performance.now(), out: R(tl?.firstElementChild), eyes: R(h?.querySelector('.cat-eyes')), pu: R(h?.querySelector('.pu')), wh: R(h?.querySelector('.wh-l.wh-u')), mo: R(h?.querySelector('.mouth')), tilt: tl ? getComputedStyle(tl).transform : '', an: c.getAnimations({ subtree: true }).map(a => a.animationName || (a.effect?.target?.getAttribute?.('data-face') ?? a.effect?.target?.className?.baseVal ?? '?')).join('+'), talk: !!c.querySelector('.scn-cat.is-talking'), cT: cs.transform, sT: ss.transform, sTr: ss.translate, face: f, dodge: c.dataset.dodge, up: c.classList.contains('wlCat--up'), x: b.x.toFixed(1), y: b.y.toFixed(1), w: b.width.toFixed(1), hb: h ? (r => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`)(h.getBoundingClientRect()) : '' }) }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }
const handled = new Set(); let n = 0; const events = []
const end = Date.now() + 70000
while (Date.now() < end && events.length < 3) {
  const act = await page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.act)
  if (act !== 'sprint') { if (n > 0) break; await sleep(100); continue }
  const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { cap: el.getAttribute('data-cap'), top: b.top, bottom: b.bottom } }))
  for (const p of pills) {
    if (handled.has(p.cap) || p.top < 4 || p.bottom > 600) continue
    handled.add(p.cap)
    if (n % 2 === 1) { // промах: ждём, пока голова встанет, потом чужое слово
      await sleep(400)
      const t = await page.evaluate(() => performance.now())
      const word = MODE === 'wrong' ? 'table' : MODE === 'unk' ? '[unk]' : (TR[p.cap] ?? 'x').slice(0, 3)
      if (MODE === 'part') await page.evaluate(w => window.__partialQueue.push(w), word); else await page.evaluate(w => window.__sayQueue.push(w), word)
      events.push({ t, cap: p.cap, word })
      await sleep(1600)
    } else await page.evaluate(w => window.__sayQueue.push(w), TR[p.cap] ?? 'nothing')
    n++
    break
  }
  await sleep(80)
}
const rec = await page.evaluate(() => window.__rec)
for (const e of events) {
  const win = rec.filter(r => r.t >= e.t - 200 && r.t <= e.t + 1500)
  const key = r => `${r.cT}|${r.sT}|${r.sTr}|${r.x},${r.y}|${r.out}|${r.dodge}|${r.tilt}|${r.an}|${r.eyes}|${r.pu}|${r.mo}|${r.talk}`
  console.log(`\n=== событие «${e.word}» на «${e.cap}», кадров ${win.length}`)
  const base = win.find(r => r.t >= e.t) ?? win[0], geo = r => `${r.sT}|${r.sTr}|${r.x},${r.y}|${r.out}|${r.eyes}|${r.pu}|${r.face}`
  const stop = win.find(r => r.t > e.t && r.dodge !== base.dodge) // следующий уворот / нырок — уже не от события
  const ch = win.filter(r => r.t >= e.t && (!stop || r.t < stop.t) && geo(r) !== geo(base))
  console.log(`ИТОГ: кадров после события ${win.filter(r => r.t >= e.t && (!stop || r.t < stop.t)).length} (до ${stop ? `${(stop.t - e.t).toFixed(0)} мс — ${stop.dodge}` : '1500 мс'}), изменений геометрии головы/лица: ${ch.length}${ch.length ? ' — первое на ' + (ch[0].t - e.t).toFixed(0) + ' мс: ' + geo(ch[0]) + ' (было ' + geo(base) + ')' : ''}`)
  if (!process.env.FULL) continue
  let prev = null
  for (const r of win) { const k = key(r) + '|' + r.face; if (k !== prev) { console.log(`${(r.t - e.t).toFixed(0).padStart(5)} мс face=${r.face} dodge=${r.dodge} sT=${r.sT.replace('matrix(1, 0, 0, 1, ','')} svg=${r.x},${r.y} out=${r.out} eyes=${r.eyes} pu=${r.pu} mo=${r.mo} tilt=${r.tilt} talk=${r.talk} an=${r.an}`); prev = k } }
}
await browser.close()
