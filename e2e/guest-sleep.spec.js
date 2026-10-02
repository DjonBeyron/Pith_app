import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// «Памяти пора отдыхать» (всё повторено): заголовок в одну строку на любой ширине, спящий мозг с «Z» в углу блока и
// в нижней панели, искры пятиугольника в это время молчат (две анимации никогда не идут вместе). Плюс счётчик
// временной памяти (три точки только при словах > 0) и вкладка «Мои начатые фразы». Модуль «Keep going ·
// E2E-ОБУЧЕНИЕ» есть только в сиде локального стека; память гостя — в localStorage своего контекста.
const LESSONS = ['a', 'b', 'c', 'd'].map(x => `e2e0d000-0000-4000-8000-00000000000${x}`) // Старт, keep, going, Финал
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv') }

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

// Гость: keep в памяти со сроком due (будущее — всё повторено, сегодня — зовёт повторить), знакомства уже пройдены
const seed = (page, { due, completed = [] }) => page.addInitScript(([d, done]) => {
  if (sessionStorage.getItem('e2e_sleep_seeded')) return
  sessionStorage.setItem('e2e_sleep_seeded', '1')
  if (d) localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 3, due_on: d, last_card_id: null, reviews: 1, lapses: 0 } }))
  if (done.length) localStorage.setItem('pithy_completed_v1', JSON.stringify(done))
  localStorage.setItem('pithy_minutes_asked_v1', '1')
  localStorage.setItem('pithy_memory_intro_v1', '1')
}, [due, completed])

test('всё повторено: «Памяти пора отдыхать» в одну строку, спящий мозг с Z, искры молчат', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.goto('/?tab=learn')
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Памяти пора отдыхать', { timeout: 30_000 })
  await expect(main).toContainText('Сегодня все слова записаны в твою память')
  // Спящий мозг: значок, три «Z»; в нижней панели — три мелких «Z» у мозга
  await expect(main.locator('.lrSleep svg')).toBeVisible()
  await expect(main.locator('.lrZ')).toHaveCount(3)
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtn--sleep/)
  await expect(nav.locator('.shellV2NavZzz i')).toHaveCount(3)
  await expect(nav).not.toHaveClass(/shellV2NavBtnDue/)
  // Искры над пятиугольником не летят, пока мозг спит
  await expect(page.locator('.memSparkBox')).toHaveCount(0)
  // Заголовок — заглавными и всегда в одну строку, не вылезая из блока, на любой ширине
  const title = main.locator('.lrMainTitle')
  expect(await title.evaluate(el => getComputedStyle(el).textTransform)).toBe('uppercase')
  for (const width of [320, 360, 390, 430, 600, 1000]) {
    await page.setViewportSize({ width, height: 800 })
    const fit = await title.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth, h: el.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(el).fontSize) }))
    expect(fit.scroll, `ширина ${width}: заголовок влезает`).toBeLessThanOrEqual(fit.client + 1)
    expect(fit.h, `ширина ${width}: одна строка`).toBeLessThan(fit.fs * 1.25 * 1.6)
  }
})

test('есть что повторить: мозг не спит, искры летят', async ({ page }) => {
  await seed(page, { due: day(0) })
  await page.goto('/?tab=learn')
  await expect(page.locator('.lrMain')).toContainText('Сегодня повторяем', { timeout: 30_000 })
  await expect(page.locator('.lrSleep')).toHaveCount(0)
  await expect(page.locator('.shellV2NavZzz')).toHaveCount(0)
  await expect(page.locator('.memSparkBox')).toHaveCount(1)
  await expect(page.locator('.memSpark')).toHaveCount(6)
})

test('счётчик временной памяти: три точки — только если слов больше нуля', async ({ page }) => {
  await seed(page, { due: null })
  await page.goto('/?tab=learn')
  await expect(page.locator('.lrMain')).toContainText('Память пока пуста', { timeout: 30_000 })
  await expect(page.locator('.memCount')).toBeVisible()
  await expect(page.locator('.memOrbit')).toHaveCount(0)
  await expect(page.locator('.memOrbitLines')).toHaveCount(0)
})

test('счётчик временной памяти: со словами летят три точки', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.goto('/?tab=learn')
  await expect(page.locator('.memCount')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.memOrbit')).toHaveCount(3)
})

test('«Мои начатые фразы»: вкладка рядом с выученными, процент, продолжить', async ({ page }) => {
  await seed(page, { due: null, completed: [LESSONS[0], LESSONS[1]] }) // 2 из 4 уроков модуля — 50%
  await page.goto('/?tab=learn')
  const section = page.locator('.memPhrases')
  // Выученных нет, начатая есть — раздел открывается на ней
  await expect(section.locator('.memPhrasesTab')).toHaveText(['Мои выученные фразы · 0', 'Мои начатые фразы · 1'], { timeout: 30_000 })
  await expect(section.locator('.memPhrasesTab--on')).toHaveText('Мои начатые фразы · 1')
  const row = section.locator('.memStartedRow')
  await expect(row).toContainText('Keep going')
  await expect(row.locator('.memStartedPct')).toHaveText('50%')
  await expect(row).toContainText('Пройдено 2 из 4 уроков · осталось 2')
  // Вкладка выученных — пусто, заботливо
  await section.getByRole('tab', { name: /выученные/ }).click()
  await expect(section.locator('.memPhrasesEmpty')).toContainText('Пока нет выученных фраз')
  // Тап по начатой — схема модуля
  await section.getByRole('tab', { name: /начатые/ }).click()
  await section.locator('.memStartedRow').click()
  await expect(page.locator('.mgNode--lesson').first()).toBeVisible({ timeout: 30_000 }) // схема модуля открылась
})
