import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Вкладка «Моё обучение» под АДМИНОМ (только локальный стек): в памяти
// e2e-админа слово cook из сида (модуль «I'm trying to cook · E2E-КОЛОДЫ»).
// «Прожить 7 дней» в админке — cook созреет, даже если admin-review.spec.js
// уже повторил его на этой базе.

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

const PHRASE = "I'm trying to cook · E2E-КОЛОДЫ"

test('главное действие, карта памяти, «Повторить сейчас», точка на вкладке', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()
  await page.getByRole('button', { name: 'Прожить 7 дней' }).click()
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('сегодня', { timeout: 15_000 })

  const nav = page.getByRole('button', { name: 'Обучение', exact: true })
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Повторить · 1 мин', { timeout: 30_000 })
  await expect(main).toContainText('1 слово ждёт')
  await expect(nav).toHaveClass(/shellV2NavBtnDot/) // есть что повторить
  await expect(page.locator('.lrWeek')).toBeVisible()

  // Карта: фраза свёрнута → слова: trying не пройдено, cook с силой
  const phrase = page.locator('.lrPhrase', { hasText: PHRASE })
  await expect(phrase.locator('.lrPhraseMeta')).toContainText('знаю 0 из 2')
  await phrase.locator('.lrPhraseHead').click()
  await expect(phrase.locator('.lrWord', { hasText: 'trying' })).toContainText('не пройдено')
  await expect(phrase.locator('.lrWord', { hasText: 'cook' }).locator('.strengthDot')).toHaveCount(5)

  // Шторка слова: «Повторить сейчас» (админ = Pro) → вступление → «Не сейчас»
  await phrase.locator('.lrWord', { hasText: 'cook' }).click()
  const sheet = page.getByRole('dialog', { name: 'Слово cook' })
  await expect(sheet.getByRole('button', { name: 'Пройти урок целиком' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Повторить сейчас' }).click()
  const review = page.locator('.reviewScreen')
  await expect(review.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Не сейчас' }).click()
  await expect(review).toHaveCount(0)

  // Сессия дня: «Знаю» → итог → «Готово» → «На сегодня всё ✓», точки нет
  await main.click()
  await expect(review.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Начать', exact: true }).click()
  await review.getByRole('button', { name: 'Знаю' }).click({ timeout: 30_000 })
  await expect(review.locator('.reviewSummaryTitle')).toHaveText('Повторение завершено', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Готово' }).click()
  await expect(main).toContainText('На сегодня всё ✓', { timeout: 30_000 })
  await expect(main).toContainText('Следующее повторение')
  await expect(nav).not.toHaveClass(/shellV2NavBtnDot/)
})
