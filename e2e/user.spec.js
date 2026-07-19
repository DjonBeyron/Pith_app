import { test, expect } from './fixtures.js'

// Сценарии под логином (этап D). Стартуют уже залогиненными через storageState
// (см. playwright.config.js, проект mobile-auth + auth.setup.js). Пока —
// проверка, что вход подхватился; дальше добавим энергию/билеты/звёзды.

test('вход подхватился: профиль залогиненного', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  // «Кастомизация» есть только в профиле залогиненного (у гостя — форма входа)
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
})
