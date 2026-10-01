import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Админ закрепляет фразу (модуль) в своей памяти кнопкой ★ в схеме модуля —
// она появляется в разделе «Фразы» вкладки «Память»; повторное нажатие
// открепляет (только локальный стек: пишет в phrase_memory с правами админа).
// Модуль «Keep going · E2E-ОБУЧЕНИЕ» — из сида; на него в админ-тестах никто больше не опирается.
const MODULE = 'e2e0d000-0000-4000-8000-0000000000ff'

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

test('★ в схеме модуля: фраза закреплена → в «Память» → «Фразы»; повторное нажатие открепляет', async ({ page }) => {
  test.slow()
  await page.goto(`/?m=${MODULE}`)
  await page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' }).click({ timeout: 30_000 })
  const toolbar = page.locator('.lessonsMapToolbar')
  const star = toolbar.getByRole('button', { name: /^[☆★]$/ })
  await expect(star).toBeVisible({ timeout: 30_000 })
  // Мог остаться закреплённым с прошлого прогона — приводим к «откреплена»
  if ((await star.getAttribute('aria-pressed')) === 'true') {
    await star.click()
    await expect(star).toHaveAttribute('aria-pressed', 'false')
  }
  await star.click()
  await expect(toolbar).toContainText('Фраза закреплена', { timeout: 15_000 })
  await expect(star).toHaveAttribute('aria-pressed', 'true')

  // Фраза — в разделе «Фразы» вкладки «Память»
  await page.goto('/?tab=learn')
  const row = page.locator('.memPhrases .memPhraseRow', { hasText: 'Keep going' })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toContainText('2 слова')

  // Открепить: ★ снова пустая, строки нет
  await page.goto(`/?m=${MODULE}`)
  await page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' }).click({ timeout: 30_000 })
  await expect(star).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 }) // состояние читается с сервера
  await star.click()
  await expect(toolbar).toContainText('Фраза откреплена', { timeout: 15_000 })
  await page.goto('/?tab=learn')
  await expect(page.locator('.memLvl--1')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.memPhrases .memPhraseRow', { hasText: 'Keep going' })).toHaveCount(0)
})
