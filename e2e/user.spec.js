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

test('обычный пользователь не видит вкладку «Админ»', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
  // Дождаться, пока профиль (и с ним is_admin) дочитается — иначе проверка
  // «кнопки нет» прошла бы раньше, чем кнопка успела бы появиться
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await expect(page.getByRole('button', { name: 'Админ', exact: true })).toHaveCount(0)
})

test('«Моё обучение»: у нового пользователя память пуста, точки нет', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.locator('.lrMainTitle')).toHaveText('Память пока пуста', { timeout: 30_000 })
  await expect(page.locator('.shellV2NavBtnDot')).toHaveCount(0)
})
