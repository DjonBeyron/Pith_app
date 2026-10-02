import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Тест админа в окне слова вкладки «Память»: «Повторил → следующий уровень» ведёт
// слово по уровням до постоянной памяти (дальше некуда), «Сбросить слово»
// возвращает его новым. Слово hold — из сида, другие админ-тесты его не трогают;
// в память его заносит и убирает сам тест (через те же API, что кнопки админки).
test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

test('слово: «Повторил» по уровням до постоянной памяти, «Сбросить слово» — как новое', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await page.evaluate(async () => {
    const api = await import('/src/shared/api/memoryDebugApi.js')
    await api.debugRemoveWord('hold')
    await api.debugAddWord('hold')
  })
  await page.goto('/?tab=learn')
  await page.locator('.memLvl--1 .memChip', { hasText: 'hold' }).click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog', { name: 'Слово hold' })
  const next = sheet.getByRole('button', { name: /^Повторил → /i })
  await expect(sheet).toContainText('Уровень 1 из 4')
  await expect(sheet).toContainText('Тест админа · шаг 1 из 5')
  await expect(next).toHaveText('Повторил → шаг 2')
  // шаг 1 → 2 (ещё «Новые»), 2 → 3 («Знакомые»), 3 → 4, 4 → 5 («Усвоенные»)
  await next.click()
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 1 из 4') // шаг 2 — ещё «Новые»
  await next.click()
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 2 из 4', { timeout: 15_000 })
  await next.click()
  await next.click()
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 3 из 4', { timeout: 15_000 })
  await expect(sheet).toContainText('Тест админа · шаг 5 из 5')
  // шаг 5 → постоянная память: дальше некуда
  await expect(next).toHaveText('Повторил → в постоянную память')
  await next.click()
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 4 из 4', { timeout: 15_000 })
  await expect(sheet.getByRole('button', { name: 'Конец пути: постоянная память' })).toBeDisabled()
  // «К повтору сегодня»: срок слова — сегодня (слово в постоянной памяти — месячная проверка сегодня), уровень не меняется
  await sheet.getByRole('button', { name: 'К повтору сегодня' }).click()
  await expect.poll(() => page.evaluate(async () => {
    const m = (await (await import('/src/shared/api/memoryApi.js')).listWordMemory()).find(w => w.word === 'hold')
    const d = new Date(), p = x => String(x).padStart(2, '0')
    return m.due_on <= `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }), { timeout: 15_000 }).toBe(true)
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 4 из 4')
  // Сбросить: как новое слово (срок — сегодня, не завтра)
  await sheet.getByRole('button', { name: 'Сбросить слово' }).click()
  await expect(sheet.locator('.memSheetLevelHead')).toContainText('Уровень 1 из 4', { timeout: 15_000 })
  await expect(sheet.getByRole('button', { name: /^Повторил → /i })).toBeEnabled()
  const dueAfterReset = await page.evaluate(async () => (await (await import('/src/shared/api/memoryApi.js')).listWordMemory()).find(w => w.word === 'hold').due_on)
  const now = new Date(), pad = x => String(x).padStart(2, '0')
  expect(dueAfterReset <= `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, 'после сброса слово — к повтору сегодня').toBe(true)

  await page.evaluate(async () => { (await import('/src/shared/api/memoryDebugApi.js')).debugRemoveWord('hold') })
})
