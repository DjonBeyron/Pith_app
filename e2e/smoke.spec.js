import { test, expect } from './fixtures.js'

// Дымовой тест (этап A): приложение открывается, нижний бар на месте, версия
// видна. Через fixtures.js — значит попутно проверяет чистоту консоли/сети.
test('приложение стартует: нижний бар и версия', async ({ page }) => {
  await page.goto('/')

  // Нижняя навигация — якорь «приложение отрисовалось». exact: иначе «Уроки»
  // цепляет и верхнюю вкладку «Мои уроки» (подстрочный матч по умолчанию).
  await expect(page.getByRole('button', { name: 'Уроки', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Профиль', exact: true })).toBeVisible()

  // Номер версии где-то на экране (формат X.Y.Z)
  await expect(page.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible()
})
