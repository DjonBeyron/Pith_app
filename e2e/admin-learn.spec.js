import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// «Моя память» под АДМИНОМ (только локальный стек): у админа — Pro, значит
// «Повторить сейчас» открывает повторение слова вне расписания. Тест только
// ЧИТАЕТ память (cook из сида): admin-review.spec.js меняет её параллельно,
// поэтому ни ответов, ни «Прожить дни» здесь нет. Полный путь вкладки —
// у обычного пользователя, user.spec.js.

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

test('память админа: слово ступени → «Повторить сейчас» (Pro) → вступление → «Не сейчас»', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  // cook (шаг 1–2, даже если admin-review.spec.js его уже повторил) — в «Новеньких»
  await page.locator('.memLvl--1 .memChip', { hasText: 'cook' }).click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog', { name: 'Слово cook' })
  await expect(sheet).toContainText("I'm trying to cook · E2E-КОЛОДЫ")
  await expect(sheet).toContainText('Новенькие слова')
  await expect(sheet.getByRole('button', { name: 'Пройти урок целиком' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Повторить сейчас', exact: true }).click()
  const review = page.locator('.reviewScreen')
  await expect(review.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Не сейчас' }).click()
  await expect(review).toHaveCount(0)
})
