import { test, expect } from './fixtures.js'
import { MODULE_ID, hasTestModule } from './config.js'

// Гостевые сценарии (этап C): гость не пишет на сервер — безопасный слой.
// Через fixtures.js каждый тест попутно валится при ошибке консоли/сети.

test('лента загрузилась: есть слайд с кнопкой «Изучить фразу»', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Изучить фразу' }).first())
    .toBeVisible({ timeout: 30_000 })
})

test('deep-link /?m=<id> открывает ленту на тест-модуле', async ({ page }) => {
  test.skip(!hasTestModule, 'нет id тест-модуля в e2e/config.js')
  await page.goto(`/?m=${MODULE_ID}`)
  // Закреплённая фраза показывается первой — её «Изучить фразу» видна сразу
  await expect(page.getByRole('button', { name: 'Изучить фразу' }).first())
    .toBeVisible({ timeout: 30_000 })
})

test('«Изучить фразу» тест-модуля → схема со Стартом', async ({ page }) => {
  test.skip(!hasTestModule, 'нет id тест-модуля в e2e/config.js')
  await page.goto(`/?m=${MODULE_ID}`)
  await page.getByRole('button', { name: 'Изучить фразу' }).first().click()
  // На схеме модуля виден узел «Старт» и кнопка «← Назад»
  await expect(page.getByText('Старт').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Назад/ })).toBeVisible()
})
