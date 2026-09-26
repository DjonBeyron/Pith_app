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

test('«Моя память»: ступени, слово дня, «Повторить сейчас» — за Pro', async ({ page }) => {
  // Память e2e-user из сида: keep (шаг 1, созрело сегодня) во фразе «Keep going · E2E-ОБУЧЕНИЕ»
  test.slow()
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDot/, { timeout: 30_000 }) // есть что повторить
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Сегодня повторяем 1 слово', { timeout: 30_000 })

  // Лестница: keep — в «Новеньких» (going не пройден — в памяти его нет)
  const fresh = page.locator('.memLvl--1')
  await expect(fresh.locator('.memLvlCount')).toHaveText('1')
  await expect(fresh.locator('.memChip')).toHaveText(['keep'])
  await expect(page.locator('.memSideLabel')).toHaveText(/^1\s*слово во временной памяти$/)
  // Все слова ступени: keep — «сегодня»
  await fresh.getByRole('button', { name: 'Все слова: Новенькие слова' }).click()
  await expect(page.getByRole('tab', { name: /Новенькие/ })).toHaveAttribute('aria-selected', 'true')
  const row = page.locator('.memChipRow', { hasText: 'keep' })
  await expect(row).toContainText('сегодня')

  // «Повторить сейчас» — удобство Pro: обычному пользователю — пейволл
  await row.click()
  const sheet = page.getByRole('dialog', { name: 'Слово keep' })
  await expect(sheet).toContainText('Новенькие слова')
  await sheet.getByRole('button', { name: 'Повторить сейчас · Pro' }).click()
  await expect(page.locator('.ppCard')).toBeVisible()
  await page.locator('.ppClose').click()
  // Вкладки ступеней: «Мои» пока пусто
  await page.getByRole('tab', { name: /Мои/ }).click()
  await expect(page.locator('.memHead')).toContainText('Мои слова')
  await expect(page.locator('.memListEmpty')).toBeVisible()
  await page.getByRole('button', { name: '← Назад' }).click()
  // Пятиугольник — фиолетовая страница постоянной памяти (пока пусто)
  await page.getByRole('button', { name: /^Постоянная память/ }).click()
  await expect(page.locator('.memPermCount')).toHaveText(/^0\s*слов выучены навсегда$/)
  await page.getByRole('button', { name: '← Назад' }).click()

  // Сессия дня: верный ответ → итог (+2 XP, мостик в фразу) → «На сегодня всё ✓»
  await main.locator('.lrCta').click()
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
  await page.getByRole('button', { name: 'Память', exact: true }).click()
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

test('лента по памяти: фраза со своим словом — первой, слово подсвечено, метка «Закрепит»', async ({ page }) => {
  // keep в памяти e2e-user и ещё не окреп (шаг < 3): фраза «Keep going» —
  // вверх (у остальных фраз сида нет слов-уроков), «Keep» окрашен силой
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await expect(slide.locator('.feedKnowChip')).toHaveText('Закрепит: keep')
  await expect(slide.locator('.fwKnown')).toHaveText('Keep')
})

test('«Сколько минут в день» меняется во вкладке и сохраняется в аккаунте', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await page.getByRole('button', { name: /Повторение: \d+ минут в день/ }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Минуты в день' }).getByRole('button', { name: /15 мин/ }).click()
  await expect(page.getByRole('button', { name: /Повторение: 15 минут в день/ })).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.getByRole('button', { name: /Повторение: 15 минут в день/ })).toBeVisible({ timeout: 30_000 })
})
