import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Память повторения ГОСТЯ (этап 5e): локальная, по тем же правилам шагов,
// что на сервере; при входе переносится в аккаунт. Модуль «Keep going ·
// E2E-ОБУЧЕНИЕ» есть только в сиде локального стека. Память гостя — в
// localStorage своего браузерного контекста, поэтому тесты не мешают друг
// другу; перенос — в аккаунт e2e-guest, только в проекте mobile (иначе
// mobile и desktop переносили бы в один аккаунт параллельно).
const MODULE = 'e2e0d000-0000-4000-8000-0000000000ff'
const today = () => new Date().toLocaleDateString('sv') // YYYY-MM-DD по часам браузера теста
// Память гостя кладётся ОДИН раз за вкладку (флаг в sessionStorage): скрипт
// инициализации срабатывает на каждой загрузке страницы и иначе вернул бы
// память, которую приложение уже перенесло и стёрло
const seedMemory = page => page.addInitScript(d => {
  if (sessionStorage.getItem('e2e_guest_seeded')) return
  sessionStorage.setItem('e2e_guest_seeded', '1')
  localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
    keep: { word: 'keep', step: 1, due_on: d, last_card_id: null, reviews: 0, lapses: 0 },
  }))
}, today())

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

test('гость проходит урок-слово → слово в его памяти на завтра', async ({ page }) => {
  test.slow()
  await page.goto(`/?m=${MODULE}`)
  await page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' }).click({ timeout: 30_000 })
  // Уроки под замком до диагностики — открываем все сразу
  await page.locator('.mgNode--lesson', { hasText: 'keep' }).click()
  await page.getByRole('button', { name: /Открыть все уроки сразу/ }).click()
  await page.getByRole('button', { name: 'Открыть уроки' }).click()
  await page.locator('.mgNode--lesson', { hasText: 'keep' }).click()
  await page.getByRole('button', { name: /Начать урок/ }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await expect(page.getByText('Урок завершён')).toBeVisible({ timeout: 60_000 })
  await page.locator('.summaryCloseBtn').click()

  // Первый пройденный урок → «Сколько минут в день?» (один раз), гостю —
  // вторым шагом «Сохрани прогресс»
  const ask = page.getByRole('dialog', { name: 'Минуты в день' })
  await ask.getByRole('button', { name: /10 мин/ }).click({ timeout: 15_000 })
  await expect(ask).toContainText('Сохрани прогресс')
  await ask.getByRole('button', { name: 'Позже' }).click()
  await expect(ask).toHaveCount(0)

  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.lrMain')).toContainText('На сегодня всё ✓', { timeout: 30_000 })
  await expect(page.locator('.lrMain')).toContainText('Следующее повторение завтра · 1 слово')
  await expect(page.locator('.lrGuestLead')).toContainText('только в этом браузере')
  // Минуты — в шестерёнке (у гостя — над формой входа)
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await expect(page.getByRole('button', { name: '10 минут в день · изменить' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Уезжаю в отпуск' })).toHaveCount(0) // отпуск — только в аккаунте
})

test('гость повторяет слово дня → итог зовёт войти', async ({ page }) => {
  await seedMemory(page)
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDot/, { timeout: 30_000 })
  await nav.click()
  await page.locator('.lrCta').click()
  const review = page.locator('.reviewScreen')
  await review.getByRole('button', { name: 'Начать', exact: true }).click({ timeout: 30_000 })
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await review.getByRole('button', { name: 'Далее' }).click()
  await expect(review.locator('.reviewTeacherLine').first()).toHaveText('keep окрепло.', { timeout: 30_000 })
  await expect(review.locator('.reviewGuestLead')).toBeVisible()
  await review.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.shellV2NavBtnActive')).toHaveText('Профиль')
  // Шаг вырос локально: keep всё ещё в «Новеньких», заливка — три четверти пути
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  const keep = page.locator('.memLvl--1 .memChip', { hasText: 'keep' })
  await expect(keep.locator('.memChipFill')).toHaveAttribute('style', /width: 75%/, { timeout: 30_000 })
})

test('вход переносит память гостя в аккаунт', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'перенос в общий аккаунт — один раз, не параллельно')
  await seedMemory(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByPlaceholder('Email').fill('e2e-guest@pithy.local')
  await page.getByPlaceholder('Пароль', { exact: true }).fill('e2e-local-password')
  await page.locator('.authBtnPrimary').click()
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })

  // Память теперь серверная: профиль видит слово, локальная — очищена
  await expect(page.locator('.pvKnow')).toHaveText('В памяти 1 слово', { timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_guest_memory_v1'))).toBe(null)
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.lrMain')).toContainText('Сегодня повторяем 1 слово', { timeout: 30_000 })
  await expect(page.locator('.lrGuestLead')).toHaveCount(0)
})

test('«Помнишь?» в ленте: раз в 6–8 видео карточка слова дня, ответ растит память', async ({ page }) => {
  test.slow()
  await seedMemory(page)
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  const remember = page.getByRole('dialog', { name: 'Помнишь?' })
  // Листаем клавиатурой (Swiper слушает ↓), пока не выйдет «Помнишь?» — не
  // раньше 6-го и не позже 8-го видео
  let swipes = 0
  while (swipes < 9 && !(await remember.isVisible())) {
    await page.keyboard.press('ArrowDown')
    swipes += 1
    await page.waitForTimeout(700)
  }
  await expect(remember).toBeVisible()
  expect(swipes).toBeGreaterThanOrEqual(6)
  expect(swipes).toBeLessThanOrEqual(8)

  await remember.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await remember.getByRole('button', { name: 'Далее' }).click()
  await expect(remember).toHaveCount(0, { timeout: 15_000 })
  // Исход записан в память гостя: keep окреп до шага 2, повтор — через 3 дня
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_memory_v1')).keep.step)).toBe(2)
  // Слово дня отвечено — повторять больше нечего: точки нет
  await expect(page.locator('.shellV2NavBtnDot')).toHaveCount(0)
})

test('закрепление фразы: все слова окрепли → собери фразу целиком', async ({ page }) => {
  // hold (единственное слово фразы «Hold on») уже на шаге 3, срок не подошёл
  const due = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString('sv')
  await page.addInitScript(d => {
    if (sessionStorage.getItem('e2e_phrase_seeded')) return
    sessionStorage.setItem('e2e_phrase_seeded', '1')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      hold: { word: 'hold', step: 3, due_on: d, last_card_id: null, reviews: 2, lapses: 0 },
    }))
  }, due)
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDot/, { timeout: 30_000 })
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Закрепить фразу', { timeout: 30_000 })
  // hold на шаге 3 — ступень «Мои слова»
  await expect(page.locator('.memLvl--2 .memChip')).toHaveText(['hold'])
  await main.locator('.lrCta').click()

  const review = page.locator('.reviewScreen')
  await expect(review.locator('.reviewTeacherLine')).toContainText('пора собрать её целиком', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Начать', exact: true }).click()
  const pool = review.locator('.phrasePool')
  await pool.getByRole('button', { name: 'Hold', exact: true }).click({ timeout: 30_000 })
  await pool.getByRole('button', { name: 'on', exact: true }).click()
  await review.getByRole('button', { name: 'Проверить' }).click()
  await expect(review.locator('.reviewVerdict--ok')).toContainText('закреплена', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Далее' }).click()
  await expect(review.locator('.reviewPhraseResultOk')).toHaveText('✨ Фраза «Hold on» закреплена', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Готово' }).click()

  // Повторять сегодня больше нечего
  await expect(main).toContainText('На сегодня всё', { timeout: 30_000 })
  await expect(nav).not.toHaveClass(/shellV2NavBtnDot/)
})
