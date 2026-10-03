import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Перевод фразы в ленте открывается трением (useTranslationReveal.js, rubDetector.js): подписи «перевести» до этого нет.
// Стрелка прячет перевод, а подпись «перевести» остаётся, пока человек на слайде; ушёл и вернулся — тереть заново.
// Подсказка «потри фразу» — новичку на 5-м видео (useRubHint.js). Модуль «Keep going · E2E-ОБУЧЕНИЕ» (с переводом
// фразы) есть только в сиде локального стека
test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

// Фраза «Keep going» закреплена первой deep-link'ом (без памяти гостя лента показала бы модули в порядке админа)
const KEEP = 'e2e0d000-0000-4000-8000-0000000000ff'
async function openPhrase(page) {
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  await page.waitForTimeout(900) // шарики разлетелись
  return slide
}

// Потереть фразу мышью: n штрихов по dx px вдоль её середины
async function rub(page, slide, { strokes = 3, dx = 44, dy = 0 } = {}) {
  const box = await slide.locator('.feedPhrase').boundingBox()
  const y = box.y + box.height / 2
  let x = box.x + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 0; i < strokes; i++) {
    const to = i % 2 === 0 ? x + dx : x - dx
    for (let s = 1; s <= 6; s++) await page.mouse.move(x + ((to - x) * s) / 6, y + (dy * s) / 6)
    x = to
  }
  await page.mouse.up()
}

const subOpen = slide => slide.locator('.feedPhraseSubOpen')

test('перевод фразы: пока не потёрли — спрятан, без подписи «перевести»', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  await expect(subOpen(slide)).toHaveCount(0)
  expect(await slide.locator('.feedPhraseSub').evaluate(el => getComputedStyle(el).opacity)).toBe('0')
  expect(await slide.locator('.feedPhraseSub').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none')
})

test('перевод фразы: три штриха туда-сюда открывают его, тап по слову после трения слово не открывает', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  await rub(page, slide)
  await expect(subOpen(slide)).toHaveCount(1)
  await expect(slide.locator('.feedTrValueOn')).toHaveText('Продолжай идти · сквозной тест')
  // Слово под пальцем при отпускании не открылось (клик после трения заглушён)
  await expect(slide.locator('.wtPlate')).toHaveCount(0)
})

test('перевод фразы: тап, один свайп, мелкая дрожь и вертикальный увод — перевод не открывают (без ложных срабатываний)', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  const box = await slide.locator('.feedPhrase').boundingBox()
  const y = box.y + box.height / 2
  // один длинный свайп вправо
  await page.mouse.move(box.x + 8, y); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 8 + i * 20, y)
  await page.mouse.up()
  // мелкая дрожь
  await page.mouse.move(box.x + 60, y); await page.mouse.down()
  for (let i = 0; i < 24; i++) await page.mouse.move(box.x + 60 + (i % 2 ? -8 : 8), y)
  await page.mouse.up()
  // «трение» с уходом вниз (пролистывание ленты): штрихи есть, но палец едет по вертикали
  await rub(page, slide, { strokes: 3, dx: 44, dy: 90 })
  await expect(subOpen(slide)).toHaveCount(0)
})

test('перевод фразы: короткое трение прячет перевод обратно (отпустил рано)', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  await rub(page, slide, { strokes: 2 })
  await expect(subOpen(slide)).toHaveCount(0)
  await expect.poll(() => slide.locator('.feedPhraseSub').evaluate(el => getComputedStyle(el).opacity), { timeout: 5000 }).toBe('0')
})

test('перевод фразы: стрелка прячет, «перевести» остаётся на слайде; ушёл и вернулся — тереть заново', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  await rub(page, slide)
  await expect(subOpen(slide)).toHaveCount(1)
  // Скрыли стрелкой: строка осталась, на ней подпись «перевести»
  await slide.locator('.feedTrToggle').click()
  await expect(slide.locator('.feedTrValueOn')).toHaveCount(0)
  await expect(subOpen(slide)).toHaveCount(1)
  await expect.poll(() => slide.locator('.feedTrLabel').evaluate(el => getComputedStyle(el).opacity)).toBe('1') // подпись проявляется плавно
  // Тап по подписи — снова перевод (старая система)
  await slide.locator('.feedTrToggle').click()
  await expect(slide.locator('.feedTrValueOn')).toHaveCount(1)
  await slide.locator('.feedTrToggle').click()
  // Ушли со слайда и вернулись — перевод снова спрятан, подписи нет
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(900)
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(900)
  const back = page.locator('.feedSlideWrapActive')
  await expect(back.locator('.feedPhrase')).toContainText('Keep going')
  await expect(subOpen(back)).toHaveCount(0)
  await rub(page, back)
  await expect(subOpen(back)).toHaveCount(1)
})

test('перевод фразы: настоящее касание (CDP) тоже открывает его и не листает ленту', async ({ page }) => {
  await page.goto(`/?m=${KEEP}`)
  const slide = await openPhrase(page)
  const box = await slide.locator('.feedPhrase').boundingBox()
  const y = Math.round(box.y + box.height / 2)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  let x = Math.round(box.x + 14)
  await touch('touchStart', x)
  for (let i = 0; i < 3; i++) {
    const to = i % 2 === 0 ? x + 46 : x - 46
    for (let s = 1; s <= 8; s++) { await touch('touchMove', Math.round(x + ((to - x) * s) / 8)); await page.waitForTimeout(8) }
    x = to
  }
  await touch('touchEnd', x)
  await expect(subOpen(slide)).toHaveCount(1)
  await expect(page.locator('.feedSlideWrapActive .feedPhrase')).toContainText('Keep going') // слайд тот же
})

test('подсказка «потри фразу»: на 5-м видео новичку, трение гасит её насовсем', async ({ page }) => {
  test.slow()
  // У каждой фразы ленты есть перевод — подсказка показывается на любом пятом видео
  await page.route('**/rest/v1/curricula*', async route => {
    const res = await route.fetch()
    const rows = await res.json()
    const patched = Array.isArray(rows) ? rows.map(r => ({ ...r, title_translation: r.title_translation || 'Перевод для теста' })) : rows
    await route.fulfill({ response: res, json: patched })
  })
  await page.goto('/')
  const hint = page.locator('.feedRubHint')
  const active = page.locator('.feedSlideWrapActive')
  const open = async () => {
    await expect(active.locator('.phraseBubbleWrap')).toBeVisible({ timeout: 30_000 })
    await active.locator('.phraseBubbleWrap').click()
    await page.waitForTimeout(900)
  }
  const next = async () => { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(900) }
  await open()
  for (let n = 2; n <= 4; n++) { await next(); await open(); await expect(hint).toHaveCount(0) }
  await next() // 5-е видео
  await open()
  await expect(hint).toHaveCount(1, { timeout: 5000 })
  await expect(hint).toContainText('Потри фразу')
  await rub(page, active)
  await expect(hint).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('pithy_rub_hint_seen_v1'))).toBe('1')
  // и дальше не возвращается
  await next(); await open()
  await expect(hint).toHaveCount(0)
})
