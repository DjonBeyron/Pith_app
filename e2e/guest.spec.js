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
  await expect(page.getByRole('button', { name: /Назад/ })).toBeVisible({ timeout: 30_000 })
  // «Старт» есть только если у модуля сохранены уроки. Пока пусто —
  // мягкий skip (дострой модуль в админке + 💾), тест позеленеет сам.
  const start = page.getByText('Старт').first()
  const hasStart = await start.isVisible({ timeout: 10_000 }).catch(() => false)
  test.skip(!hasStart, 'тест-модуль ещё без уроков (lesson_ids пуст) — дострой в админке')
  await expect(start).toBeVisible()
})

// ОТЛОЖЕНО (этап C, требует доработки): тесты HUD активного слайда —
// «лайк гостем → форма входа», «тап по звуку → оверлей исчез». Лента
// бесконечная и виртуализированная: все копии слайда с одинаковым testid
// спозиционированы вне вьюпорта (y ≈ -64000), надёжного «активного» DOM-узла
// нет → клик по нужной кнопке через селектор нестабилен. Ревизит: либо
// маркер активного слайда в коде ленты, либо клик по видимому по boundingBox.
// Пока покрыто вручную (PROJECT.md: тап гостя по лайку → форма входа).
