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

  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.locator('.lrMain')).toContainText('На сегодня всё ✓', { timeout: 30_000 })
  await expect(page.locator('.lrMain')).toContainText('Следующее повторение завтра · 1 слово')
  await expect(page.locator('.lrGuestLead')).toContainText('только в этом браузере')
})

test('гость повторяет слово дня → итог зовёт войти', async ({ page }) => {
  await seedMemory(page)
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Обучение', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDot/, { timeout: 30_000 })
  await nav.click()
  await page.locator('.lrMain').click()
  const review = page.locator('.reviewScreen')
  await review.getByRole('button', { name: 'Начать', exact: true }).click({ timeout: 30_000 })
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await review.getByRole('button', { name: 'Далее' }).click()
  await expect(review.locator('.reviewTeacherLine').first()).toHaveText('keep окрепло.', { timeout: 30_000 })
  await expect(review.locator('.reviewGuestLead')).toBeVisible()
  await review.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.shellV2NavBtnActive')).toHaveText('Профиль')
  // Шаг вырос локально: в карте keep — сила 2
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  const phrase = page.locator('.lrPhrase', { hasText: 'Keep going · E2E-ОБУЧЕНИЕ' })
  await phrase.locator('.lrPhraseHead').click()
  await expect(phrase.locator('.lrWord', { hasText: 'keep' }).locator('.strengthDotOn')).toHaveCount(2)
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
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.locator('.lrMain')).toContainText('Повторить · 1 мин', { timeout: 30_000 })
  await expect(page.locator('.lrGuestLead')).toHaveCount(0)
})
