import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Справка слова («карточка слова») в редакторе урока под АДМИНОМ, только на локальном
// стеке (см. admin.spec.js). Данные — черновой модуль «E2E-КОЛОДЫ»: слова cook и trying

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
  page.on('dialog', d => d.accept())
})

async function openWordCard(page, word) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Колоды' }).click()
  await page.locator('.adkFilter input').uncheck()
  const row = page.locator('.adkRow').filter({ has: page.locator('.adkWord', { hasText: new RegExp(`^${word}$`) }) })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button', { name: 'Карточки' }).click()
  await expect(page.locator('.rcTitle')).toHaveText(`Карточки повтора · ${word}`, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Справка', exact: true }).click()
  await expect(page.locator('.rcTitle')).toHaveText(`Справка слова · ${word}`, { timeout: 30_000 })
}

test('справка: блоки текст + пример диалога → сохранить → превью; «Граф» её не стирает', async ({ page }) => {
  await openWordCard(page, 'cook')

  await page.locator('.wcEdIn.wcEdTag').fill('глагол')
  await page.getByRole('button', { name: '＋ Добавить блок' }).click()
  await page.getByRole('menuitem', { name: '＋ Текст' }).click()
  await page.locator('.wcEdBlock[data-block-type="text"] textarea').fill('Слово **cook** значит «готовить».')

  await page.getByRole('button', { name: '＋ Добавить блок' }).click()
  await page.getByRole('menuitem', { name: '＋ Пример диалога' }).click()
  const dlg = page.locator('.wcEdBlock[data-block-type="dialog"]')
  // Имена по умолчанию — Пит и Анна
  await expect(dlg.locator('.wcEdName').first()).toHaveValue('Пит')
  await expect(dlg.locator('.wcEdName').nth(1)).toHaveValue('Анна')
  const lines = dlg.locator('.wcEdLine')
  await lines.nth(0).locator('input.wcEdIn').nth(0).fill('I **cook** every day')
  await lines.nth(0).locator('input.wcEdIn').nth(1).fill('Я готовлю каждый день')
  await lines.nth(1).locator('input.wcEdIn').nth(0).fill('I don’t **cook**')
  await lines.nth(1).locator('input.wcEdIn').nth(1).fill('Я не готовлю')
  await lines.nth(1).getByLabel('отрицание').check()

  // Превью — как у ученика: лаймовое слово, янтарное отрицание, подпись «Пример диалога»
  const prev = page.locator('.wcEdPreview')
  await expect(prev.locator('.wcTag')).toHaveText('глагол')
  await expect(prev.locator('.wcBub b').first()).toHaveText('cook')
  await expect(prev.locator('.wcDlgLabel')).toHaveText('Пример диалога')
  await expect(prev.locator('.wcNeg').first()).toHaveText('don’t')

  // Пустой блок не сохраняется: добавляем лишний «Текст» и не заполняем
  await page.getByRole('button', { name: '＋ Добавить блок' }).click()
  await page.getByRole('menuitem', { name: '＋ Текст' }).click()
  await page.getByRole('button', { name: /^Сохранить/ }).click()
  await expect(page.locator('.productionSyncStatus')).toContainText('Сохранено и проверено: блоков 2', { timeout: 15_000 })

  // «Граф» → 💾 (канвас пишет script целиком) → «Справка»: справка на месте
  await page.getByRole('button', { name: 'Граф', exact: true }).click()
  await page.locator('.canvasPageSave').click({ timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.locator('.canvasPageActions').getByRole('button', { name: 'Справка', exact: true }).click()
  await expect(page.locator('.rcTitle')).toHaveText('Справка слова · cook', { timeout: 30_000 })
  await expect(page.locator('.wcEdBlock')).toHaveCount(2)
  await expect(page.locator('.wcEdIn.wcEdTag')).toHaveValue('глагол')
})

// У слова trying в сиде есть сообщение урока (у cook ноды пусты — только колода)
test('«＋ в справку» у сообщения урока — копия текста новым блоком', async ({ page }) => {
  await openWordCard(page, 'trying')
  const before = await page.locator('.wcEdBlock').count()
  await page.locator('.rcSrcAdd', { hasText: '＋ в справку' }).first().click()
  await expect(page.locator('.wcEdBlock')).toHaveCount(before + 1)
  await expect(page.locator('.wcEdBlock').last()).toHaveAttribute('data-block-type', 'text')
})
