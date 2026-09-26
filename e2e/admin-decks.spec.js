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

// Таблица из урока в карточке. В сиде таблиц нет — урок trying подменяется на
// лету (+ ручная таблица с ячейкой-меню «He/She/It» и привязкой к cook для
// анализа). Проверяет: ответ виден в уроке слева и на превью карточки;
// «Урок для анализа» — с уроками модуля (из «Колод» список был пуст); меню
// ячейки в предпросмотре нажимается; после сохранения отчёт «Колоды» сам
// показывает новое число карточек (раньше — только после перезагрузки)
const TRYING = 'e2e0b000-0000-4000-8000-00000000000b'
const COOK = 'e2e0b000-0000-4000-8000-00000000000c'
const tableNode = {
  id: 'e2e-tab', seq: 3, x: 740, y: 0, size: 'max', type: 'table',
  typeData: { table: {
    mode: 'manual', answer: 'She is trying', statLessonId: COOK,
    distractors: [{ id: 'd1', text: 'are' }],
    table: {
      rowCount: 2, colCount: 2, columns: [{ widthPct: 50 }, { widthPct: 50 }],
      cells: [
        { id: 'h1', row: 0, col: 0, rowspan: 1, colspan: 1, value: 'Кто', isHeader: true },
        { id: 'h2', row: 0, col: 1, rowspan: 1, colspan: 1, value: 'Глагол', isHeader: true },
        { id: 'c1', row: 1, col: 0, rowspan: 1, colspan: 1, value: 'She', options: ['He', 'She', 'It'] },
        { id: 'c2', row: 1, col: 1, rowspan: 1, colspan: 1, value: 'is' },
      ],
    },
  } },
  triggers: [{ id: 'tt1', if: 'table_correct', then: null }, { id: 'tt2', if: 'table_wrong', then: null }],
}

async function injectTable(route) {
  const resp = await route.fetch()
  const json = await resp.json()
  const row = Array.isArray(json) ? json[0] : json
  if (row?.script?.nodes && !row.script.nodes.some(n => n.id === tableNode.id)) row.script.nodes.push(tableNode)
  await route.fulfill({ response: resp, json })
}

test('таблица из урока в карточке: данные, списки, меню ячейки, отчёт', async ({ page }) => {
  await page.route(new RegExp(`/rest/v1/lessons\\?.*select=script%2Ctitle.*${TRYING}`), injectTable)
  await openDecks(page)
  const before = await cardsOf(page, 'trying')
  await openCards(page, 'trying')
  const src = page.locator('.rcSrcRow', { hasText: 'Таблица' })
  await expect(src.locator('.rcSrcAnswerOk')).toHaveText('She is trying')
  await src.getByRole('button', { name: '＋ Карточка из задания' }).click()
  await expect(page.locator('.rcThumbActive')).toContainText('She is trying')
  const stat = page.locator('.productionList .nodeStatLinkSelect')
  await expect(stat).toHaveValue(COOK)
  await expect(stat.locator('option')).toHaveText(['— не привязан —', 'Старт', 'cook', 'Финал'])

  await page.getByRole('button', { name: '▶ Предпросмотр' }).click()
  const preview = page.getByRole('dialog', { name: 'Предпросмотр карточки' })
  await preview.locator('.tableGridCellOptions').click({ timeout: 30_000 })
  await page.locator('.cellMenu').getByRole('button', { name: 'He', exact: true }).click()
  await expect(page.locator('.cellMenu')).toHaveCount(0)
  await expect(preview.locator('.tmAnswerChip')).toHaveText(['He'])
  await preview.getByRole('button', { name: 'К правке' }).click()

  await page.getByRole('button', { name: /^Сохранить/ }).click()
  await expect(page.locator('.productionSyncStatus')).toContainText('Сохранено и проверено', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Назад' }).first().click()
  // Без перезагрузки: отчёт перечитался по событию «колода сохранена»
  await expect.poll(() => cardsOf(page, 'trying'), { timeout: 15_000 }).toBe(before + 1)
})
