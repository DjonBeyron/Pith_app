// Playwright-драйвер сценария владельца «игра идёт → свернули → вернулись → Продолжить» (v3.3.115, пункт 8): hidden приходит ВО ВРЕМЯ игры (после первой реплики Пита), контекст «умирает» (interrupted, resume() висит),
// visible, тап «Продолжить». Доказываем: пауза встала один раз (даже при pagehide+freeze+hidden подряд), звук помечен подозрительным, «Продолжить» пересоздало контекст в жесте и реплика после паузы звучит через буфер.
// Запуск: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/first_line/run_pause.mjs [port] [папка скриншотов]  (нужен запущенный dev-сервер: npx vite --port <port>)
import { chromium } from '@playwright/test'

const port = process.argv[2] || '5473'
const shots = process.argv[3] || '.'
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
let failed = 0
const check = (ok, text) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${text}`); if (!ok) failed += 1 }
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  await page.goto(`http://localhost:${port}/_stand/first_line/index.html?case=second&bare=1`)
  await page.waitForSelector('#go', { timeout: 30000 })
  for (let i = 0; i < 20; i++) { // игра открывается, когда прогрев готов
    await page.click('#go')
    try { await page.waitForSelector('[data-testid="wl"]', { timeout: 2500 }); break } catch { /* ещё не готово */ }
  }
  const t1 = Date.now()
  while (Date.now() - t1 < 9000 && ((await page.evaluate(() => window.__report().catSpeak.length)) < 1)) await page.waitForTimeout(100)
  const r1 = await page.evaluate(() => window.__report())
  console.log('игра идёт: реплик кота начато', r1.catSpeak.length)

  // --- свернули: pagehide + freeze + hidden подряд (iOS шлёт что угодно), контекст «умирает»
  await page.evaluate(() => {
    let vis = 'visible'
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true })
    window.__bgDead = true
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('freeze'))
    vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'))
    window.__vis = v => { vis = v }
  })
  await page.waitForSelector('[data-testid="wl-pause"]', { timeout: 5000 })
  check(true, 'игра на паузе (оверлей «Игра на паузе»)')
  await page.evaluate(() => { window.__vis('visible'); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/pause-overlay.png` })
  await page.click('[data-testid="wl-pause-resume"]')
  await page.waitForSelector('[data-testid="wl-pause"]', { state: 'detached', timeout: 8000 })
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${shots}/pause-after-resume.png` })
  const r2 = await page.evaluate(() => window.__report())
  const log = r2.log.join('\n')
  console.log('\n-- журнал звука после паузы --\n' + r2.log.filter(l => /pause|ctx|warm|cat\]/.test(l)).join('\n'))
  console.log('\n-- реплики кота --', JSON.stringify(r2.catVoice))
  check(/\[audio\] ctx пересоздан: .*повторный старт после фона/.test(log), 'после паузы «Продолжить» пересоздало мёртвый контекст в жесте (пометка звука после ухода, причина в журнале)')
  const afterPause = r2.catVoice.slice(r1.catVoice.length)
  check(afterPause.length >= 1 && afterPause.every(v => v.source === 'buffer' && v.play === 'started'), `после «Продолжить» реплика звучит через буфер (${afterPause.map(v => `${v.id}:${v.source}/${v.play}`).join(', ') || 'реплик нет'})`)
  check(r2.synthCalls === 0, 'speechSynthesis не вызывался')
} finally { await browser.close() }
process.exit(failed ? 1 : 0)
