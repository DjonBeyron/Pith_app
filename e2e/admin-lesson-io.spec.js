import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Окно «Поделиться / Импорт» канваса: три части файла (урок / карточки повтора / справка
// слова) — галочки экспорта, галочки импорта, файл только со справкой. Под АДМИНОМ, только
// на локальном стеке (см. admin.spec.js). Данные — черновой модуль «E2E-КОЛОДЫ», слово trying
test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
  page.on('dialog', d => d.accept())
})

const WORD_CARD_FILE = JSON.stringify({
  format: 'pithy-lesson',
  wordCard: {
    tag: 'глагол · форма -ing',
    nodes: [
      { type: 'text', text: '**I’m trying** — «я сейчас пытаюсь»' },
      { type: 'formula', parts: ['I’m', 'try', 'ing'], result: 'I’m trying' },
      { type: 'dialog', lines: [{ side: 'l', text: 'I’m not **trying**', tr: 'Я не пытаюсь', neg: true }] },
    ],
  },
})

async function openCanvas(page, word) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Колоды' }).click()
  await page.locator('.adkFilter input').uncheck()
  const row = page.locator('.adkRow').filter({ has: page.locator('.adkWord', { hasText: new RegExp(`^${word}$`) }) })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button', { name: 'Карточки' }).click()
  await expect(page.locator('.rcTitle')).toHaveText(`Карточки повтора · ${word}`, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Граф', exact: true }).click()
  await page.locator('.canvasPageShare').first().click({ timeout: 30_000 })
  await expect(page.locator('.lioModal')).toBeVisible()
}

test('экспорт: галочки частей — урок, карточки и справка выгружаются вместе или по отдельности', async ({ page }) => {
  await openCanvas(page, 'cook')
  const modal = page.locator('.lioModal')
  const exportBox = modal.locator('.lioCol').first().locator('textarea.lioText')
  const exportJson = async () => JSON.parse(await exportBox.inputValue())
  // Колода и справка приходят с сервера: пока их нет, «Копировать» недоступна
  await expect(modal.getByRole('button', { name: 'Копировать' })).toBeEnabled({ timeout: 15_000 })

  // По умолчанию — всё, что есть: у cook в сиде есть колода
  const full = await exportJson()
  expect(full.nodes).toBeDefined()
  expect(full.reviewCards.length).toBeGreaterThan(0)

  const parts = modal.getByRole('group', { name: 'Что выгрузить' })
  await parts.getByLabel(/Урок \(скрипт\)/).uncheck()
  const cardsOnly = await exportJson()
  expect(cardsOnly.nodes).toBeUndefined()
  expect(cardsOnly.reviewCards.length).toBeGreaterThan(0)
  expect(cardsOnly.legend.parts).toContain('В этом файле: reviewCards')

  // Только справка: ни урока, ни колоды, а описание справки для модели — в легенде
  await parts.getByLabel(/Карточки повтора/).uncheck()
  const wcOnly = await exportJson()
  expect(wcOnly.nodes).toBeUndefined()
  expect(wcOnly.reviewCards).toBeUndefined()
  expect(wcOnly.legend.wordCard.about).toContain('Справка слова')
  expect(wcOnly.legend.nodes).toBeUndefined()

  // Ничего не отмечено — выгружать нечего
  await parts.getByLabel(/Справка слова/).uncheck()
  await expect(modal.getByRole('button', { name: 'Копировать' })).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Скачать .json' })).toBeDisabled()
})

test('импорт: файл только со справкой применяется отдельно и не трогает урок и колоду', async ({ page }) => {
  await openCanvas(page, 'trying')
  const modal = page.locator('.lioModal')
  const importCol = modal.locator('.lioCol').nth(1)
  const exportBox = modal.locator('.lioCol').first().locator('textarea.lioText')
  await expect(modal.getByRole('button', { name: 'Копировать' })).toBeEnabled({ timeout: 15_000 })
  const before = JSON.parse(await exportBox.inputValue())
  await importCol.locator('textarea.lioText').fill(WORD_CARD_FILE)

  const parts = importCol.getByRole('group', { name: 'Что применить из файла' })
  await expect(parts.getByLabel(/Урок \(скрипт\)/)).toBeDisabled()
  await expect(parts.getByLabel(/Карточки повтора/)).toBeDisabled()
  await expect(parts.getByLabel(/Справка слова/)).toBeChecked()
  // Урока в файле нет — вместо «Добавить/Заменить урок» одна кнопка
  await expect(importCol.getByRole('button', { name: 'Заменить урок' })).toHaveCount(0)
  await importCol.getByRole('button', { name: 'Проверить' }).click()
  await expect(importCol.locator('.lioMeta').first()).toContainText('справка слова: блоков 3')
  await importCol.getByRole('button', { name: 'Применить выбранное' }).click()
  await expect(importCol.locator('.lioMeta').first()).toContainText('справка сохранена: блоков 3', { timeout: 15_000 })

  // Справка у урока есть и уехала в экспорт; урок и колода — те же, что были
  await expect.poll(async () => JSON.parse(await exportBox.inputValue()).wordCard?.nodes.length).toBe(3)
  const after = JSON.parse(await exportBox.inputValue())
  expect(after.nodes).toEqual(before.nodes)
  expect(after.reviewCards).toEqual(before.reviewCards)

  // И она открывается во вкладке «Справка»
  await modal.locator('.lioClose').click()
  await page.locator('.canvasPageActions').getByRole('button', { name: 'Справка', exact: true }).click()
  await expect(page.locator('.rcTitle')).toHaveText('Справка слова · trying', { timeout: 30_000 })
  await expect(page.locator('.wcEdBlock')).toHaveCount(3)
  await expect(page.locator('.wcEdIn.wcEdTag')).toHaveValue('глагол · форма -ing')
})

test('импорт: одним файлом урок + справка; галочкой «Урок» можно не применять', async ({ page }) => {
  await openCanvas(page, 'trying')
  const modal = page.locator('.lioModal')
  const importCol = modal.locator('.lioCol').nth(1)
  const exportBox = modal.locator('.lioCol').first().locator('textarea.lioText')
  await expect(modal.getByRole('button', { name: 'Копировать' })).toBeEnabled({ timeout: 15_000 })
  const base = JSON.parse(await exportBox.inputValue())
  const file = JSON.stringify({ ...base, legend: undefined, wordCard: JSON.parse(WORD_CARD_FILE).wordCard })
  await importCol.locator('textarea.lioText').fill(file)

  const parts = importCol.getByRole('group', { name: 'Что применить из файла' })
  await expect(parts.getByLabel(/Урок \(скрипт\)/)).toBeChecked()
  await expect(parts.getByLabel(/Справка слова/)).toBeChecked()
  await expect(importCol.getByRole('button', { name: 'Заменить урок' })).toBeVisible()
  // Снимаем «Урок»: остаётся применить только справку
  await parts.getByLabel(/Урок \(скрипт\)/).uncheck()
  await expect(importCol.getByRole('button', { name: 'Заменить урок' })).toHaveCount(0)
  await importCol.getByRole('button', { name: 'Применить выбранное' }).click()
  await expect(importCol.locator('.lioMeta').first()).toContainText('справка сохранена: блоков 3', { timeout: 15_000 })
})

