// Playwright-драйвер сценария владельца «второй запуск после фона» (v3.3.113): игра → выход (крестик) ВО ВРЕМЯ реплики Пита → hidden → visible (первый игровой AudioContext после этого «мёртвый», реестр прогрева устарел:
// буферы потеряны, отметки «обработан» остались) → второй старт. Доказываем: первая реплика второй игры звучит через буфер, «занят» кота не залип, страховка попала в журнал.
// Запуск: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/first_line/run_second.mjs [port] [папка скриншотов]  (нужен запущенный dev-сервер: npx vite --port <port>)
import { chromium } from '@playwright/test'

const port = process.argv[2] || '5473'
const shots = process.argv[3] || '.'
const hang = process.argv[4] === 'hang' // iOS заморозил запросы при сворачивании: докачка висит, пока не вернёмся (и дольше)
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
  const startGame = async n => {
    for (let i = 0; i < 20; i++) { // кнопка старта в модуле появляется, когда Vosk (подмена) и прогрев готовы: пробуем тапать, пока игра не откроется
      await page.click('#go')
      try { await page.waitForSelector('[data-testid="wl"]', { timeout: 2500 }); return } catch { /* ещё не готово */ }
    }
    throw new Error(`игра ${n} не открылась`)
  }

  // --- игра 1: выходим ВО ВРЕМЯ реплики Пита
  await startGame(1)
  const t1 = Date.now()
  while (Date.now() - t1 < 9000 && ((await page.evaluate(() => window.__report().catSpeak.length)) < 1)) await page.waitForTimeout(100)
  await page.waitForTimeout(250)
  const r1 = await page.evaluate(() => window.__report())
  console.log('игра 1: реплик кота начато', r1.catSpeak.length, JSON.stringify(r1.catVoice.map(v => `${v.id}:${v.source}:${v.play}`)))
  await page.click('[data-testid="wl-close"]')
  await page.waitForSelector('[data-testid="wl"]', { state: 'detached', timeout: 10000 })
  console.log('игра 1 закрыта крестиком во время реплики')

  if (hang) await page.evaluate(() => { window.__hangFetch = true }) // с этого момента запросы озвучки не завершаются
  // --- фон: hidden → visible; первый новый игровой контекст мёртв; реестр прогрева устарел
  await page.evaluate(() => {
    let vis = 'visible'
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true })
    vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'))
    window.__bgDead = true
    window.__stale()
    vis = 'visible'; document.dispatchEvent(new Event('visibilitychange'))
  })
  if (hang) { // запросы озвучки, начатые при возврате (прогрев карточки), не завершаются; через 3,5 с они уже «зависли», потом сеть оживает — но старые запросы так и висят
    await page.evaluate(() => { window.__rewarm() })
    await page.waitForTimeout(3500)
    await page.evaluate(() => { window.__hangFetch = false })
  }
  await page.waitForTimeout(500)

  // --- игра 2
  await startGame(2)
  await page.waitForTimeout(4200)
  await page.screenshot({ path: `${shots}/second-game2.png` })
  const r2 = await page.evaluate(() => window.__report())
  console.log('\n-- строки журнала плеера (игра 2) --\n' + r2.log.join('\n'))
  console.log('\n-- реплики кота (игра 2) --', JSON.stringify(r2.catVoice))
  console.log(`-- отметка ctx: ${JSON.stringify(r2.ctxMark)}; отметка ready: ${JSON.stringify(r2.ready)}; начали говорить: ${r2.catSpeak.join(', ') || '—'}`)
  const first = r2.catVoice[0]
  check(r2.log.some(l => /\[audio\] ctx пересоздан: .*повторный старт после фона/.test(l)), 'контекст пересоздан в жесте второго старта (был «мёртвый»)')
  check(r2.log.some(l => /\[warm\] (страховка|возврат из фона)/.test(l)), 'страховка сбросила устаревшие отметки прогрева (в журнале)')
  check(!!first && first.source === 'buffer' && first.play === 'started', `первая реплика второй игры звучит через буфер (${first ? `${first.id}: ${first.source}/${first.play}` : 'реплик нет'})`)
  check(r2.catSpeak.length >= 1, 'рот кота открылся по факту старта звука')
  check(r2.catVoice.length >= 2 && r2.catVoice.every(v => v.source === 'buffer' && v.play === 'started'), '«занят» кота не залип: вторая и следующие реплики игры тоже сказаны (все через буфер)')
  check(r2.synthCalls === 0, 'speechSynthesis не вызывался')
} finally { await browser.close() }
process.exit(failed ? 1 : 0)
