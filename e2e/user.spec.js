import { test, expect } from './fixtures.js'

// Сценарии под логином (этап D). Стартуют уже залогиненными через storageState
// (см. playwright.config.js, проект mobile-auth + auth.setup.js). Пока —
// проверка, что вход подхватился; дальше добавим энергию/билеты/звёзды.

test('вход подхватился: профиль залогиненного', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  // «Кастомизация» есть только в профиле залогиненного (у гостя — форма входа)
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
})

test('обычный пользователь не видит вкладку «Админ»', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
  // Дождаться, пока профиль (и с ним is_admin) дочитается — иначе проверка
  // «кнопки нет» прошла бы раньше, чем кнопка успела бы появиться
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await expect(page.getByRole('button', { name: 'Админ', exact: true })).toHaveCount(0)
})

test('«Моё обучение»: повторить слово дня, карта памяти, «Повторить сейчас» — за Pro', async ({ page }) => {
  // Память e2e-user из сида: keep (созрело сегодня) во фразе «Keep going · E2E-ОБУЧЕНИЕ»
  test.slow()
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Обучение', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDot/, { timeout: 30_000 }) // есть что повторить
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Повторить · 1 мин', { timeout: 30_000 })
  await expect(main).toContainText('1 слово ждёт')

  // Карта: keep с силой, going без колоды — «не пройдено»
  const phrase = page.locator('.lrPhrase', { hasText: 'Keep going · E2E-ОБУЧЕНИЕ' })
  await phrase.locator('.lrPhraseHead').click()
  await expect(phrase.locator('.lrWord', { hasText: 'going' })).toContainText('не пройдено')
  await expect(phrase.locator('.lrWord', { hasText: 'keep' }).locator('.strengthDotOn')).toHaveCount(1)

  // «Повторить сейчас» — удобство Pro: обычному пользователю — пейволл
  await phrase.locator('.lrWord', { hasText: 'keep' }).click()
  await page.getByRole('button', { name: 'Повторить сейчас · Pro' }).click()
  await expect(page.locator('.ppCard')).toBeVisible()
  await page.locator('.ppClose').click()

  // Сессия дня: верный ответ → итог (+2 XP, мостик в фразу) → «На сегодня всё ✓»
  await main.click()
  const review = page.locator('.reviewScreen')
  await review.getByRole('button', { name: 'Начать', exact: true }).click({ timeout: 30_000 })
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await review.getByRole('button', { name: 'Далее' }).click()
  await expect(review.locator('.reviewTeacherLine')).toHaveText('keep окрепло.', { timeout: 30_000 })
  await expect(review.locator('.reviewReward')).toContainText('+2 XP')
  await expect(review.locator('.reviewBridge')).toContainText('Keep going · E2E-ОБУЧЕНИЕ» · 25%')
  await review.getByRole('button', { name: 'Готово' }).click()
  await expect(main).toContainText('На сегодня всё ✓', { timeout: 30_000 })
  await expect(nav).not.toHaveClass(/shellV2NavBtnDot/)

  // Профиль: «Сохранённые» вместо вкладок «Пройденные»/«Копилка слов»
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  // Первой строкой — память (keep на шаге 2: ещё не «знаю»); тап — в «Моё обучение»
  await expect(page.locator('.pvKnow')).toHaveText('В памяти 1 слово', { timeout: 30_000 })
  await expect(page.locator('.pvSectionTitle')).toHaveText('Сохранённые')
  await expect(page.getByRole('button', { name: 'Пройденные' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Копилка слов' })).toHaveCount(0)
  await page.locator('.pvKnow').click()
  await expect(page.locator('.lrTitle')).toBeVisible()
})

test('схема модуля: у пройденного урока-слова — сила памяти вместо приоритета', async ({ page }) => {
  // Урок keep пройден на этом устройстве (отметка «пройдено» — локальная)
  await page.addInitScript(() => localStorage.setItem('pithy_completed_v1', JSON.stringify(['e2e0d000-0000-4000-8000-00000000000b'])))
  await page.goto('/?m=e2e0d000-0000-4000-8000-0000000000ff')
  await page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' }).click({ timeout: 30_000 })
  const keep = page.locator('.mgNode--lesson', { hasText: 'keep' })
  await expect(keep.locator('.mgLessonStrength')).toContainText('сила памяти', { timeout: 30_000 })
  await expect(keep.locator('.strengthDot')).toHaveCount(5)
  await expect(keep.locator('.mgLessonPriority')).toHaveCount(0)
  // Не пройденный урок — без силы памяти
  await expect(page.locator('.mgNode--lesson', { hasText: 'going' }).locator('.mgLessonStrength')).toHaveCount(0)
})

test('«Отпуск»: пауза расписания и возвращение', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Уезжаю в отпуск' }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Отпуск' }).getByRole('button', { name: 'Поставить на паузу' }).click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Ты в отпуске', { timeout: 30_000 })
  await expect(page.locator('.shellV2NavBtnDot')).toHaveCount(0) // в отпуске не зовём повторять
  await expect(page.getByRole('button', { name: 'Уезжаю в отпуск' })).toHaveCount(0)

  await main.getByRole('button', { name: 'Вернуться из отпуска' }).click()
  await expect(main).not.toContainText('Ты в отпуске', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Уезжаю в отпуск' })).toBeVisible()
})
