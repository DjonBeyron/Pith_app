import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Плеер повторения (этап 4 системы повторения) под АДМИНОМ, только на
// локальном стеке (см. admin.spec.js). Данные — supabase/seed.sql: в памяти
// e2e-админа слово cook из модуля «I'm trying to cook · E2E-КОЛОДЫ», колода —
// одна карточка «выбери слово» (cook — верно, cake — нет). «Прожить 7 дней»
// перед каждой сессией — cook созреет и при повторном прогоне на той же базе.
// Одна сессия за другой в одном тесте: обе меняют одну и ту же память

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

async function startSession(page) {
  await page.getByRole('button', { name: 'Прожить 7 дней' }).click()
  await expect(page.locator('.aeHint', { hasText: /Сдвинуто слов: [1-9]/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('сегодня')
  await page.getByRole('button', { name: 'Начать повторение' }).click()
  const screen = page.locator('.reviewScreen')
  await expect(screen.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await screen.getByRole('button', { name: 'Начать', exact: true }).click()
  return screen
}

const option = (screen, text) => screen.locator('.chooseWordPanel').getByRole('button', { name: text, exact: true })

test('сессия: ошибка → слово в конце → верно; «Знаю»; итог, сила слова и XP', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()

  // ── 1. Ошибка возвращает слово в конец сессии ───────────────────────
  let screen = await startSession(page)
  // Слово во фразе под спойлером, одна капсула на одну карточку
  await expect(screen.locator('.reviewPhraseHidden')).toHaveText('●●●●')
  await expect(screen.locator('.reviewCapsule')).toHaveCount(1)
  await option(screen, 'cake').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--bad')).toContainText('вернётся в конце')
  await expect(screen.locator('.reviewPhraseWord')).toHaveText('cook') // слово проявилось
  await screen.getByRole('button', { name: 'Далее' }).click()
  // Возврат добавил карточку; на возврате «Знаю» нет — только ответ
  await expect(screen.locator('.reviewCapsule')).toHaveCount(2)
  await expect(screen.locator('.reviewCapsule--bad')).toHaveCount(1)
  await expect(screen.getByRole('button', { name: 'Знаю' })).toHaveCount(0)
  await option(screen, 'cook').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--ok')).toHaveText('Верно!')
  await screen.getByRole('button', { name: 'Далее' }).click()

  await expect(screen.locator('.reviewSummaryTitle')).toHaveText('Повторение завершено', { timeout: 30_000 })
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook шатается — вернёмся завтра.')
  await expect(screen.locator('.reviewWord--bad')).toContainText('cook')
  await expect(screen.locator('.reviewReward')).toContainText(/\+2 XP|XP за повторение на сегодня уже набран/)
  await screen.getByRole('button', { name: 'Готово' }).click()
  await expect(screen).toHaveCount(0)

  // ── 2. «Знаю» — без ответа, слово крепнет ───────────────────────────
  screen = await startSession(page)
  await screen.getByRole('button', { name: 'Знаю' }).click()
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook окрепло.', { timeout: 30_000 })
  await expect(screen.locator('.reviewWord--ok .reviewDot--on')).toHaveCount(2) // шаг 1 → 2
  await screen.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('шаг 2')
})
