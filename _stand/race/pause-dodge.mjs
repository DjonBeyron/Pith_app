// Пауза и уворот Пита (задача 2, 2026-11-27): на стенде паузит игру в случайные моменты проходов A и B, каждый кадр сравнивает голову Пита и пилюли.
// «Удар» — пилюля задела голову (прямоугольники пересекаются по ≥ HIT_PX, голова не спрятана). Печатает удары: до и после «Продолжить» (в окне AFTER_MS), стадия, дорожка пилюли, x головы.
// Запуск: PW_CHROMIUM_PATH=… BASE=http://127.0.0.1:5543/_stand/race/index.html PAUSES=1 SECS=150 CPU=4 node _stand/race/pause-dodge.mjs
import { chromium } from '@playwright/test'

const E = process.env, CPU = Number(E.CPU || 4), BASE = E.BASE || 'http://127.0.0.1:5543/_stand/race/index.html', SECS = Number(E.SECS || 150), PAUSES = E.PAUSES !== '0', AFTER_MS = 6000, HIT_PX = 14
const browser = await chromium.launch({ executablePath: E.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => {
  localStorage.setItem('pithy_weak_device_v6', '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '0')
  const S = window.__h = { hits: [], resumeAt: 0, pauseAt: 0, frames: 0 }
  let inHit = new Set()
  const tick = () => {
    S.frames++
    const wl = document.querySelector('.wl'), svg = document.querySelector('.wlCat .wlCatSvg')
    if (svg && wl && !wl.hasAttribute('data-paused') && wl.dataset.phase !== 'paused') {
      const r = svg.getBoundingClientRect(), cs = getComputedStyle(svg.parentElement)
      const hr = { l: r.left + r.width * 0.2, r: r.right - r.width * 0.2, t: r.top + r.height * 0.18, b: r.bottom }
      const visible = r.top < innerHeight - 30 && cs.visibility !== 'hidden'
      const now = new Set()
      if (visible) for (const p of document.querySelectorAll('.wlPill[data-held]:not([data-rise]):not([data-fail]):not([data-lock]):not([data-arrow])')) {
        const q = p.getBoundingClientRect(); if (q.width === 0) continue
        const ox = Math.min(hr.r, q.right) - Math.max(hr.l, q.left), oy = Math.min(hr.b, q.bottom) - Math.max(hr.t, q.top)
        if (ox > 14 && oy > 14) { const id = p.dataset.held + '|' + (p.dataset.cap ?? ''); now.add(id); if (!inHit.has(id)) S.hits.push({ t: Math.round(performance.now()), sid: wl.dataset.sid, cap: p.dataset.cap, pillX: Math.round(q.left + q.width / 2), headX: Math.round((r.left + r.right) / 2), pillTop: Math.round(q.top), sinceResume: S.resumeAt ? Math.round(performance.now() - S.resumeAt) : null, dodge: svg.parentElement.dataset.dodge }) }
      }
      inHit = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__pause = on => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')) }
})
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const sleep = ms => new Promise(r => setTimeout(r, ms))
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto(`${BASE}?seed=r1&ask=voice&only=stages&lines=1&meaning=1&perf=1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 }); await sleep(800)
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await page.tap('[data-testid="rotate-start"]'); await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
const sid = () => page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null)
const t0 = Date.now(); const seen = []; let n = 0, nextPause = Date.now() + 9000
while (Date.now() - t0 < SECS * 1000) {
  const s = await sid()
  if (s && seen.at(-1)?.[0] !== s) seen.push([s, Math.round((Date.now() - t0) / 1000)])
  if (PAUSES && Date.now() > nextPause && s && /^(sprint|catch)$/.test(s)) {
    await page.evaluate(() => { window.__h.pauseAt = performance.now(); window.__pause(true) }); await sleep(1500 + (n % 3) * 1500)
    const b = await page.$('[data-testid="wl-pause-resume"]')
    if (b) { await page.tap('[data-testid="wl-pause-resume"]'); await page.evaluate(() => { window.__h.resumeAt = performance.now() }); await sleep(300) }
    await page.evaluate(() => window.__pause(false)); n++; nextPause = Date.now() + 5000 + ((n * 1700) % 5000); console.log('пауза', n, 'в', s)
  }
  await sleep(120)
}
const h = await page.evaluate(() => window.__h)
console.log('стадии:', seen.map(x => x.join('@')).join(' '))
console.log('кадров', h.frames, 'пауз', n, 'ударов', h.hits.length)
for (const x of h.hits) console.log(JSON.stringify(x), x.sinceResume != null && x.sinceResume < AFTER_MS ? '← после «Продолжить»' : '')
await ctx.close(); await browser.close()
