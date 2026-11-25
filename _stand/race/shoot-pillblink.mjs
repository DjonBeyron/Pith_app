// «Капсула моргнула, пока я говорил» (владелец 2026-11-25, iPhone): покадровый (rAF) замер пилюль «Конвейера слов» в Chromium, 375×812, CPU 4×. На каждом кадре у каждой взятой пилюли (data-held)
// пишутся: узел в документе, display / visibility / opacity самой пилюли, клипа и заливки, размер рамки, число детей, атрибуты data-*. Драйвер «говорит» по очереди: верное слово, чужое слово (промах),
// недоговорённый черновик + верное. ИТОГ — кадры, где у летящей пилюли (не взлёт data-rise, не «не успел», не гаснущая data-reveal) тело пропало: узла нет, display none, visibility hidden, opacity < 1, рамка нулевая;
// и список смен атрибутов / числа детей в окне ±200…1500 мс вокруг каждого события речи. Это проверка DOM и стилей: мигание слоя в композиторе iOS так не поймать.
// Запуск: npx vite --port 5473 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-pillblink.mjs  (WEAK=1 — слабое устройство, SAFE=1 — «безопасные слои»)
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://127.0.0.1:5473/_stand/race/index.html'
const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args }).catch(() => chromium.launch({ args }))
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(([weak, safe]) => { localStorage.setItem('pithy_weak_device_v6', weak); if (safe) localStorage.setItem('pithy_wl_pill_safe_v1', '1') }, [process.env.WEAK ? '1' : '0', !!process.env.SAFE])
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const readPillLog = () => page.evaluate(async () => (await import('/src/shared/lib/gameJournal.js')).gameJournal.lines().filter(l => l.includes('[pill]')).map(l => l.slice(0, 200))) // строки диагностики wordLanePillWatch.js из журнала игры
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?only=sprint&ask=voice&seed=r1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
await page.evaluate(() => {
  window.__rec = []
  const pills = [...document.querySelectorAll('.wlPill')]
  const loop = () => {
    const t = performance.now()
    pills.forEach((el, k) => {
      if (!el.hasAttribute('data-held')) return
      const cs = getComputedStyle(el), clip = el.querySelector('.wlPillClip'), fill = el.querySelector('.wlPillFill'), b = el.getBoundingClientRect()
      window.__rec.push({ t, k, on: el.isConnected, d: cs.display, v: cs.visibility, o: +cs.opacity, co: clip ? +getComputedStyle(clip).opacity : -1, fo: fill ? +getComputedStyle(fill).opacity : -1, cd: clip ? getComputedStyle(clip).display : '-',
        w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.top), kids: el.childElementCount, ckids: clip?.childElementCount ?? -1, an: el.getAnimations().length,
        at: el.getAttributeNames().filter(a => a.startsWith('data-') && !['data-testid', 'data-cap', 'data-pill'].includes(a)).sort().join(' ') })
    })
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }
const handled = new Set(); let n = 0; const events = []
const end = Date.now() + 90000
while (Date.now() < end && n < 6) {
  const act = await page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.act)
  if (act !== 'sprint') { if (n > 0) break; await sleep(100); continue }
  const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { cap: el.getAttribute('data-cap'), top: b.top, bottom: b.bottom } }))
  for (const p of pills) {
    if (handled.has(p.cap) || p.top < 4 || p.bottom > 600) continue
    handled.add(p.cap)
    const good = TR[p.cap] ?? 'nothing', mode = ['good', 'wrong', 'part'][n % 3]
    const t = await page.evaluate(() => performance.now())
    if (mode === 'wrong') { await page.evaluate(w => window.__sayQueue.push(w), 'table'); await sleep(900); await page.evaluate(w => window.__sayQueue.push(w), good) } // чужое слово (как «am» вместо «I'm» в журнале), потом верное
    else if (mode === 'part') { await page.evaluate(w => window.__partialQueue.push(w), good.slice(0, 3)); await sleep(500); await page.evaluate(w => window.__sayQueue.push(w), good) }
    else await page.evaluate(w => window.__sayQueue.push(w), good)
    events.push({ t, cap: p.cap, mode })
    n++
    await sleep(1500)
    break
  }
  await sleep(80)
}
const rec = await page.evaluate(() => window.__rec)
const pillLog = await readPillLog()
const flying = r => !/data-(rise|fail|reveal|coast|faded|spent)/.test(r.at)
const gone = r => !r.on || r.d === 'none' || r.v !== 'visible' || r.o < 1 || r.co === 0 || r.cd === 'none' || r.w === 0 || r.h === 0
const bad = rec.filter(r => flying(r) && gone(r))
console.log(`кадров-замеров ${rec.length}, событий речи ${events.length} (${events.map(e => `${e.mode}:${e.cap}`).join(', ')})`)
console.log(`ИТОГ: кадров, где тело летящей пилюли пропало (узел / display / visibility / opacity < 1 / рамка 0): ${bad.length}`)
for (const r of bad.slice(0, 20)) console.log('  ', JSON.stringify(r))
console.log(`строк «[pill]» в журнале: ${pillLog.length}${pillLog.length ? '\n  ' + pillLog.slice(0, 12).join('\n  ') : ' (отладочный интерфейс выключен?)'}`)
for (const e of events) {
  const win = rec.filter(r => r.t >= e.t - 200 && r.t <= e.t + 1500)
  const byK = new Map(); for (const r of win) { if (!byK.has(r.k)) byK.set(r.k, []); byK.get(r.k).push(r) }
  console.log(`\n=== ${e.mode} на «${e.cap}»`)
  for (const [k, rs] of byK) { let prev = null; for (const r of rs) { const key = `${r.at}|kids ${r.kids}/${r.ckids}|an ${r.an}|o ${r.o}/${r.co}/${r.fo}|${r.w}×${r.h}`; if (key !== prev) { console.log(`  пилюля ${k} ${(r.t - e.t).toFixed(0).padStart(5)} мс: ${key}`); prev = key } } }
}
await browser.close()
