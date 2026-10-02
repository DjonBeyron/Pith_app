import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Админ → «Достижения»: выдать и снять себе достижение (admin_set_achievement). «Начало пути» выдаётся при регистрации
// профиля (миграция 20261003120000_achievement_journey_start.sql: триггер handle_new_user + задним числом всем). Блок
// «Кастомизация профиля» в профиле блестит, пока открытая косметика не просмотрена, и гаснет после просмотра.
// Тест сам возвращает аккаунт как был (снимает выданное).
test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

test('админ выдаёт себе «10-й уровень»: блок кастомизации блестит до просмотра; «Начало пути» уже есть', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Достижения', exact: true }).click()
  const row = name => page.locator('.aaRow', { hasText: name })

  // Выдано при регистрации (сид создаёт пользователей через auth.users → триггер)
  await expect(row('Начало пути').locator('.aaState')).toContainText('есть', { timeout: 30_000 })
  // На случай остатков прошлого прогона — сначала снять
  if (await row('10-й уровень').getByRole('button', { name: 'Снять' }).count()) {
    await row('10-й уровень').getByRole('button', { name: 'Снять' }).click()
    await expect(row('10-й уровень').locator('.aaState')).toHaveText('нет')
  }
  await row('10-й уровень').getByRole('button', { name: 'Выдать' }).click()
  await expect(row('10-й уровень').locator('.aaState')).toContainText('есть')

  // Профиль: блок «Кастомизация профиля» блестит — открытая косметика ещё не просмотрена
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  const custom = page.getByRole('button', { name: /Кастомизация профиля/ })
  await expect(custom).toHaveClass(/pvShine/, { timeout: 30_000 })
  await custom.click()
  await expect(page.locator('.achCard', { hasText: '10-й уровень' })).not.toHaveClass(/achCardLocked/, { timeout: 30_000 })
  await expect(page.locator('.achCard', { hasText: 'Начало пути' })).toContainText('Получено')
  await page.locator('.pvBack').click()
  await expect(page.getByRole('button', { name: /Кастомизация профиля/ })).not.toHaveClass(/pvShine/, { timeout: 30_000 })

  // Вернуть как было
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await row('10-й уровень').getByRole('button', { name: 'Снять' }).click()
  await expect(row('10-й уровень').locator('.aaState')).toHaveText('нет')
})
