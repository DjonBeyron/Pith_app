// Playwright-драйвер стенда «Первая реплика Пита»: node _stand/first_line/run.mjs <ok|expired|expired-nogesture|slow|reject|abort|swap> [port] [папка скриншотов] [доп. параметры адреса, например delay=30000]
// Нужен запущенный dev-сервер (npx vite --port <port>) и PW_CHROMIUM_PATH (Chromium без playwright install). Печатает вывод раздела «Почему первая реплика тихая», шкалу, строки «[cat-voice]» и ключи файла отладки.
import { chromium } from '@playwright/test'

const kase = process.argv[2] || 'ok'
const port = process.argv[3] || '5473'
const shots = process.argv[4] || '.'
const extra = process.argv[5] ? `&${process.argv[5]}` : ''
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  await page.goto(`http://localhost:${port}/_stand/first_line/index.html?case=${kase}${extra}`)
  await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="rotate-start"]')
  if (kase.startsWith('expired')) {
    await page.waitForSelector('[data-testid="rotate-tap-hint"]', { timeout: 20000 })
    await page.screenshot({ path: `${shots}/tap-hint-${kase}.png` })
    console.log('подсказка «Тапни, чтобы начать» показана; игры пока нет:', (await page.locator('[data-testid="wl"]').count()) === 0)
    if (kase === 'expired') await page.touchscreen.tap(195, 390) // настоящее касание = жест
    else await page.evaluate(() => document.querySelector('[data-testid="rotate-tap-hint"]').click()) // программный клик: жеста нет (так выглядело бы «касание» без свежего жеста)
  }
  await page.waitForSelector('[data-testid="wl"]', { timeout: 20000 })
  await page.waitForTimeout(kase === 'slow' ? 7200 : 3200)
  await page.screenshot({ path: `${shots}/game-${kase}.png` })
  const rep = await page.evaluate(() => window.__report())
  console.log(`\n=== case ${kase} ===\ncause: ${rep.silent.cause} (${rep.silent.title}); causes: ${rep.silent.causes.join(', ')}`)
  console.log(rep.silent.textLines.join('\n'))
  console.log('\n-- строки журнала плеера --')
  console.log(rep.log.join('\n'))
  console.log('\n-- реплики кота --', JSON.stringify(rep.catVoice))
  console.log(`-- синтез речи: вызовов speak() = ${rep.synthCalls}; события дорожки микрофона: ${rep.trackEvents.join(',') || 'нет'}; обрывы пробуждения: нашей сменой src = ${rep.abortBySwap}, системой = ${rep.abortBySystem}`)
  console.log('\n-- ключи файла отладки --', rep.exportKeys.join(', '))
  const i = rep.section.findIndex(l => l.startsWith('--- Почему первая'))
  console.log('раздел в текстовом журнале плеера найден на строке', i)
} finally { await browser.close() }
