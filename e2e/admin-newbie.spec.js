import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Админка: (1) открытая субвкладка запоминается на устройстве; (2) переключатель «Я новенький» — имитация
// первого входа без удаления данных: песочница localStorage + «взгляд гостя» (newbieSim.js). Включил — приложение
// как у нового гостя (память пуста, профиль — вход), кнопка «Админ» осталась; выключил — всё вернулось.
// Данные аккаунта (память cook из сида) в базе не трогаются.
test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
  // Знакомство с «Памятью» админ уже видел — но только настоящий ключ: в режиме «новенький» запись пошла бы в
  // песочницу и спрятала бы знакомство, которое там как раз должно показаться
  await page.addInitScript(() => {
    if (!localStorage.getItem('pithy_newbie_sim_v1')) localStorage.setItem('pithy_memory_intro_v1', '1')
  })
})

const adminTab = page => page.getByRole('button', { name: 'Админ', exact: true })
// Тумблеры админки лежат в одном свёрнутом блоке «Переключатели» — раскрываем, если свёрнут
const openToggles = async page => {
  const head = page.getByRole('button', { name: 'Переключатели' })
  await head.waitFor({ timeout: 30_000 })
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
}

test('админка помнит открытую вкладку после перезагрузки', async ({ page }) => {
  await page.goto('/')
  await adminTab(page).click()
  await expect(page.locator('.avTab.avTabActive')).toHaveText('Модули') // по умолчанию
  await page.locator('.avTab', { hasText: 'Повторение' }).click()
  await expect(page.locator('.avTab.avTabActive')).toHaveText('Повторение')
  await page.reload()
  await adminTab(page).click()
  await expect(page.locator('.avTab.avTabActive')).toHaveText('Повторение') // осталась там же
  await page.locator('.avTab', { hasText: 'Модули' }).click() // вернуть как было — тесты в одном аккаунте независимы
})

test('«Я новенький»: приложение как у нового гостя, данные целы, выключил — всё вернулось', async ({ page }) => {
  test.slow()
  await page.goto('/')
  // До режима: память админа не пуста (слово cook из сида)
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.lrMain')).not.toContainText('Память пока пуста', { timeout: 30_000 })
  await expect(page.locator('.memLvl', { hasText: 'cook' })).toBeVisible()

  // Включаем (страница перезагружается), вкладка админки запомнена
  await adminTab(page).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()
  await expect(page.locator('.avToggle')).toHaveCount(0) // по умолчанию тумблеры свёрнуты в один блок
  await openToggles(page)
  const toggle = page.locator('.avToggle', { hasText: 'Я новенький' })
  await expect(toggle.locator('input')).not.toBeChecked()
  await Promise.all([page.waitForEvent('load'), toggle.locator('input').click()])
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_newbie_sim_v1'))).toBe('1')

  // «Новенький»: память пуста (как у гостя), знакомства показываются заново, админский интерфейс спрятан, «Админ» на месте
  await expect(adminTab(page)).toBeVisible({ timeout: 30_000 })
  await expect(adminTab(page)).toHaveClass(/shellV2NavBtnUserMode/) // пометка «режим включён»
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.lrMain')).toContainText('Память пока пуста', { timeout: 30_000 })
  await expect(page.getByRole('dialog', { name: /Это твоя память/ })).toBeVisible() // первый вход: знакомство с «Памятью»
  // Песочница: «уже видел» пишется в nb:-ключ, настоящий (поставленный выше) остаётся как был
  await page.getByRole('dialog', { name: /Это твоя память/ }).getByRole('button').first().click()
  const keys = () => page.evaluate(() => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)))
  await expect.poll(keys).toContain('nb:pithy_memory_intro_v1')
  expect(await keys()).toContain('pithy_memory_intro_v1')
  // Профиль — как у гостя: вход, а не аккаунт админа
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 30_000 })

  // Выключаем: вкладка админки на месте, прежняя память вернулась
  await adminTab(page).click()
  await expect(page.locator('.avTab.avTabActive')).toHaveText('Повторение')
  await openToggles(page)
  const toggleOn = page.locator('.avToggle', { hasText: 'Я новенький' })
  await expect(toggleOn.locator('input')).toBeChecked()
  await Promise.all([page.waitForEvent('load'), toggleOn.locator('input').click()])
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_newbie_sim_v1'))).toBe(null)
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.memLvl', { hasText: 'cook' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lrMain')).not.toContainText('Память пока пуста')
  // Вернуть вкладку админки
  await adminTab(page).click()
  await page.locator('.avTab', { hasText: 'Модули' }).click()
})
