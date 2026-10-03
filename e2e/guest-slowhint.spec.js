import { test, expect } from './fixtures.js'

// Подсказка «Зажми, чтобы замедлить» (features/feed/useSlowMotionHint.js, useFeedHint.js, slowmoHintPlan.js): новичок видит
// её на 3-м видео ленты при самом первом посещении, но ТОЛЬКО при включённом звуке (замедление имеет смысл со звуком);
// если три видео подряд пролистал, не воспользовавшись, — подсказка пропадает насовсем (флаг сохраняется). Листаем клавишей ↓
// (Swiper слушает её), как в тесте «Помнишь?». Звук включаем кнопкой в шапке ленты — она есть у тех, кто уже включал звук раньше.
const soundOnInit = page => page.addInitScript(() => {
  try { localStorage.setItem('pithy_sound_ever_v1', '1') } catch { /* нет localStorage */ }
})
const turnSoundOn = page => page.getByRole('button', { name: 'Включить звук' }).first().click()

test('подсказка «замедлить»: на 3-м видео, после трёх игноров — навсегда пропадает', async ({ page }) => {
  test.slow()
  await soundOnInit(page)
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  await turnSoundOn(page)
  const hint = page.locator('.feedSlowHint')
  const next = async () => { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(900) }
  await page.waitForTimeout(900)
  await expect(hint).toHaveCount(0) // 1-е видео
  await next()
  await expect(hint).toHaveCount(0) // 2-е
  await next()
  await expect(hint).toHaveCount(1) // 3-е — подсказка появилась
  await expect(hint).toContainText('Зажми, чтобы замедлить')
  await next()
  await expect(hint).toHaveCount(1) // 4-е — первое видео с подсказкой пролистано (1-й игнор), она висит дальше
  await next()
  await expect(hint).toHaveCount(1) // 5-е — 2-й игнор
  await next()
  await expect(hint).toHaveCount(0) // 6-е — 3-й игнор: подсказки больше нет
  expect(await page.evaluate(() => localStorage.getItem('pithy_slowmo_hint_seen_v1'))).toBe('1')
  expect(await page.evaluate(() => localStorage.getItem('pithy_slowmo_hint_ignored_v1'))).toBe('3')
  await next()
  await next()
  await expect(hint).toHaveCount(0) // и дальше не возвращается
})

test('подсказка «замедлить»: без звука не показывается и игноры не копит; включил звук — появляется', async ({ page }) => {
  test.slow()
  await soundOnInit(page)
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  const hint = page.locator('.feedSlowHint')
  const next = async () => { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(900) }
  await page.waitForTimeout(900)
  for (let i = 0; i < 5; i++) { await next(); await expect(hint).toHaveCount(0) } // видео 2–6 без звука
  expect(await page.evaluate(() => localStorage.getItem('pithy_slowmo_hint_ignored_v1'))).toBe(null) // не показывалась — не игнор
  await turnSoundOn(page)
  await expect(hint).toHaveCount(1)
})

test('подсказка «замедлить»: уже воспользовался — её нет', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('pithy_slowmo_hint_seen_v1', '1') } catch { /* нет localStorage */ } })
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(800) }
  await expect(page.locator('.feedSlowHint')).toHaveCount(0)
})
