import { test, expect } from './fixtures.js'
import { assertLocalBackend } from './helpers/backend.js'

// Сценарии под АДМИНОМ (e2e-admin из supabase/seed.sql). Стартуют уже
// залогиненными (проект admin в playwright.config.js, storageState из
// auth.setup.js). Пишут в базу с правами is_admin — поэтому гоняются ТОЛЬКО
// на локальном стеке: предохранитель валит весь файл, если VITE_SUPABASE_URL
// смотрит не на 127.0.0.1. Вьюпорт десктопный: админка — десктопный экран.

test.beforeAll(() => assertLocalBackend())

// Второй предохранитель — на уровне браузера: любой запрос к облачному
// Supabase обрывается (а fixtures.js роняет тест на requestfailed). Даже если
// приложение каким-то образом собрано с боевым URL, в прод не уйдёт ничего.
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
})

const TABS = ['Модули', 'Файлы', 'Пуши', 'Гонка', 'Стрик', 'Учитель', 'Ошибки', 'Аналитика']

async function openAdmin(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  // Список модулей загрузился — в нём всегда есть тест-модуль из сида
  await expect(page.locator('.amRow', { hasText: 'E2E-ТЕСТ' })).toBeVisible({ timeout: 30_000 })
}

test('все субвкладки админки открываются без ошибок', async ({ page }) => {
  await openAdmin(page)
  for (const name of TABS) {
    const tab = page.locator('.avTab', { hasText: name })
    await tab.click()
    await expect(tab).toHaveClass(/avTabActive/)
    // Дать вкладке догрузить данные: ошибки её запросов ловит fixtures.js
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  }
})

test('тест-модуль в списке и опубликован', async ({ page }) => {
  await openAdmin(page)
  const row = page.locator('.amRow', { hasText: 'E2E-ТЕСТ' })
  await expect(row).toContainText('3 урок')
  await expect(row.getByTitle(/Переключить статус/)).toHaveText('опубликован')
})

test('модуль: создать → уроки создались сами → статусы → удалить', async ({ page }) => {
  // Подтверждаем ТОЛЬКО удаление модуля. Любой другой confirm (например
  // «Разослать пуш всем подписчикам?» при публикации) — отклоняем
  page.on('dialog', d => (d.message().startsWith('Удалить модуль') ? d.accept() : d.dismiss()))
  await openAdmin(page)
  const rows = page.locator('.amRow')
  const before = await rows.count()

  // Новый модуль сразу открывает свою схему; админу Старт/Урок/Финал
  // создаются автоматически (CurriculumView → bulkCreate)
  await page.getByRole('button', { name: '+ Новый модуль' }).click()
  await expect(page.getByText('Старт').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Финал').first()).toBeVisible()
  await page.getByRole('button', { name: /Назад/ }).click()

  // Список отсортирован по дате создания — новый модуль первым
  await expect(rows).toHaveCount(before + 1)
  const row = rows.filter({ hasText: 'Новый модуль' }).first()
  await expect(row).toContainText('3 урок', { timeout: 15_000 })

  // Статус по кругу: черновик → превью → опубликован
  const status = row.getByTitle(/Переключить статус/)
  await expect(status).toHaveText('черновик')
  await status.click()
  await expect(status).toHaveText('превью')
  await status.click()
  await expect(status).toHaveText('опубликован')

  // Статус сохранился на сервере, а не только в оптимистичном UI
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await openAdmin(page)
  await expect(rows.filter({ hasText: 'Новый модуль' }).first().getByTitle(/Переключить статус/))
    .toHaveText('опубликован')

  // Удаление (вместе с уроками) — список вернулся к исходному размеру
  await rows.filter({ hasText: 'Новый модуль' }).first().getByTitle('Удалить модуль').click()
  await expect(rows).toHaveCount(before)
})
