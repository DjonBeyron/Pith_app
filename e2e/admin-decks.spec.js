import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Колоды карточек повтора (этап 3 системы повторения) под АДМИНОМ, только на
// локальном стеке (см. admin.spec.js). Данные — черновой модуль «E2E-КОЛОДЫ»
// из supabase/seed.sql: слово trying без колоды, cook — с одной карточкой

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
  // Подтверждения редактора («выйти без сохранения?») — принимаем
  page.on('dialog', d => d.accept())
})

async function openDecks(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Колоды' }).click()
  // Все слова, не только проблемные — cook может стать «готово» в повторах
  await page.locator('.adkFilter input').uncheck()
  await expect(page.locator('.adkRow').first()).toBeVisible({ timeout: 30_000 })
}

const row = (page, word) => page.locator('.adkRow').filter({ has: page.locator('.adkWord', { hasText: new RegExp(`^${word}$`) }) })

// «нет колоды» → 0, «мало · 2» / «готово · 3» → число
async function cardsOf(page, word) {
  const text = await row(page, word).locator('.adkChip').innerText()
  return /нет колоды/.test(text) ? 0 : Number(text.split('·')[1])
}

async function openCards(page, word) {
  await row(page, word).getByRole('button', { name: 'Карточки' }).click()
  await expect(page.locator('.rcTitle')).toHaveText(`Карточки повтора · ${word}`, { timeout: 30_000 })
}

test('админка показывает слова без колоды и с малой колодой', async ({ page }) => {
  await openDecks(page)
  await expect(row(page, 'cook').locator('.adkChip')).toHaveText(/мало · 1|готово/)
  await expect(row(page, 'trying')).toContainText('E2E-КОЛОДЫ → trying')
})

test('черновик колоды из урока → сохранить → в отчёте на карточку больше', async ({ page }) => {
  await openDecks(page)
  const before = await cardsOf(page, 'trying')
  await openCards(page, 'trying')
  // Пустая карточка помечена и при сохранении выбрасывается (статус об этом)
  await page.getByRole('button', { name: '+ Карточка' }).click()
  await expect(page.locator('.rcThumbActive')).toContainText('пустая — не сохранится')
  await page.getByRole('button', { name: 'Черновик из урока' }).click()
  // В уроке одно задание — черновик из одной карточки: контекст + «выбери слово»
  await expect(page.locator('.rcThumbActive')).toContainText(`Карточка ${before + 2}`)
  await expect(page.locator('.rcThumbActive')).toContainText('2 ноды')
  await page.getByRole('button', { name: /^Сохранить/ }).click()
  await expect(page.locator('.productionSyncStatus')).toContainText('Сохранено и проверено', { timeout: 15_000 })
  await expect(page.locator('.productionSyncStatus')).toContainText('пустые убраны: 1')

  await page.getByRole('button', { name: 'Назад' }).first().click()
  await openDecks(page)
  expect(await cardsOf(page, 'trying')).toBe(before + 1)
})

test('сохранение урока из «Графа» не стирает колоду', async ({ page }) => {
  await openDecks(page)
  const before = await cardsOf(page, 'cook')
  expect(before).toBeGreaterThan(0)
  await openCards(page, 'cook')
  // Карточки → Граф → 💾 (канвас пишет script целиком) → Карточки
  await page.getByRole('button', { name: 'Граф', exact: true }).click()
  await page.locator('.canvasPageSave').click({ timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  // Кнопка шапки канваса (под оверлеем в админке есть свои «Карточки»)
  await page.locator('.canvasPageActions').getByRole('button', { name: 'Карточки', exact: true }).click()
  await expect(page.locator('.rcTitle')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.rcThumbs .rcThumb:not(.rcThumbAdd)')).toHaveCount(before)
})

// Урок слева (ReviewLessonSource): фильтры по типам, «＋ Карточка из
// задания» (контекст + задание одним нажатием), «＋ в карточку» по одной ноде
test('урок слева: фильтры, карточка из задания, ноды по одной', async ({ page }) => {
  await openDecks(page)
  await openCards(page, 'trying')
  const source = page.getByRole('complementary', { name: 'Урок' })
  const rows = source.locator('.rcSrcRow')
  await expect(rows).toHaveCount(2)
  await source.getByRole('button', { name: /^Задания/ }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.rcSrcAnswerOk')).toHaveText('trying')
  await source.getByRole('button', { name: /^Все/ }).click()

  const thumbs = page.locator('.rcThumbs .rcThumb:not(.rcThumbAdd)')
  const before = await thumbs.count()
  await source.getByRole('button', { name: '＋ Карточка из задания' }).click()
  await expect(thumbs).toHaveCount(before + 1)
  await expect(page.locator('.rcThumbActive')).toContainText(`Карточка ${before + 1}`)
  await expect(page.locator('.productionList [data-node-id]')).toHaveCount(2)

  await page.getByRole('button', { name: '+ Карточка' }).click()
  await rows.nth(0).getByRole('button', { name: '＋ в карточку' }).click()
  await rows.nth(1).getByRole('button', { name: '＋ в карточку' }).click()
  await expect(page.locator('.productionList [data-node-id]')).toHaveCount(2)
  await expect(page.locator('.rcThumbActive')).toContainText('2 ноды')
  // Прежние карточки на месте — в том же ряду превью
  await expect(thumbs).toHaveCount(before + 2)
  await expect(page.getByRole('button', { name: 'Сохранить •' })).toBeVisible()
})

// Печать в ноде карточки: поле текста — модельное (браузеру ввод запрещён),
// правку оно шлёт функцией от актуальной ноды. Раньше список нод такую
// правку терял — буквы не появлялись ни в одной ноде. Затем предпросмотр:
// несохранённая карточка играет в плеере до конца (плашка итога)
test('в ноду карточки печатается текст, предпросмотр играет карточку', async ({ page }) => {
  await openDecks(page)
  await openCards(page, 'trying')
  await page.getByRole('button', { name: '+ Карточка' }).click()
  await page.getByRole('button', { name: '+ Добавить первую ноду' }).click()
  await page.locator('.nodeTypeSelectItem', { hasText: 'Текстовое сообщение' }).click()
  const field = page.locator('.productionList .richTextField').first()
  await field.click()
  await page.keyboard.type('Привет из карточки')
  await expect(field).toHaveText('Привет из карточки')
  await expect(page.getByRole('button', { name: 'Сохранить •' })).toBeVisible()

  await page.getByRole('button', { name: '▶ Предпросмотр' }).click()
  const preview = page.getByRole('dialog', { name: 'Предпросмотр карточки' })
  await expect(preview.locator('.reviewCardFrame')).toContainText('Привет из карточки', { timeout: 15_000 })
  await expect(preview.locator('.reviewVerdict')).toContainText('Верно', { timeout: 20_000 })
  // «Заново» — плеер с начала; короткая карточка тут же доигрывает снова
  await preview.getByRole('button', { name: 'Заново' }).click()
  await expect(preview.locator('.reviewVerdict')).toContainText('Верно', { timeout: 20_000 })
  await preview.getByRole('button', { name: 'К правке' }).click()
  await expect(preview).toHaveCount(0)
  await expect(field).toHaveText('Привет из карточки')
})
