import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Медиа-урок из сида локального стека (модуль «E2E-МЕДИА»): голосовое, фото и
// «выбери фото». Гоняет то, чего нет в текстовом тест-модуле: прогрев файлов
// (usePlayerPreload → preloadFetchOne: скачивание, разбор голосового, blob-
// ссылки), «мгновенные» ноды (фото) и ответ галереи (photoPick.js). Файлы —
// статика самого dev-сервера, поэтому только на локальном стеке.
const MEDIA_MODULE_ID = 'e2e0c000-0000-4000-8000-0000000000ff'

const learnBtn = page => page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' })

test('медиа-урок: голосовое и фото из прогрева, «выбери фото» → урок завершён', async ({ page }) => {
  test.skip(!isLocalBackend(), 'модуль «E2E-МЕДИА» есть только в сиде локального стека')
  test.slow()

  await page.goto(`/?m=${MEDIA_MODULE_ID}`)
  await learnBtn(page).click()
  await page.getByRole('button', { name: 'Начать', exact: true }).click()
  await page.getByRole('button', { name: /Начать урок/ }).click()

  const player = page.locator('.lessonPlayer')
  // Голосовое и фото играют с blob-ссылок: файлы скачал прогрев, а не <audio>/<img> сами
  await expect(player.locator('audio[src^="blob:"]')).toHaveCount(1, { timeout: 30_000 })
  await expect(player.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 30_000 })

  // «Выбери фото»: галерея → верная плитка (alt = подпись фото)
  await page.getByRole('button', { name: /Прикрепи фото/ }).click({ timeout: 30_000 })
  await page.locator('.pcGalleryTile').filter({ has: page.locator('img[alt="верно"]') }).click()

  await expect(page.getByText('Урок завершён')).toBeVisible({ timeout: 60_000 })
})
