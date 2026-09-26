import { test, expect } from './fixtures.js'
import { assertLocalBackend, stubLocalEdgeFunctions } from './helpers/backend.js'

// Плеер повторения (этап 4 системы повторения) под АДМИНОМ, только на
// локальном стеке (см. admin.spec.js). Данные — supabase/seed.sql: в памяти
// e2e-админа слово cook из модуля «I'm trying to cook · E2E-КОЛОДЫ», колода —
// одна карточка: фото → «выбери слово» (cook — верно, cake — нет). «Прожить 7 дней»
// перед каждой сессией — cook созреет и при повторном прогоне на той же базе.
// Одна сессия за другой в одном тесте: обе меняют одну и ту же память

test.beforeAll(() => assertLocalBackend())
test.beforeEach(async ({ page }) => {
  await page.route(/\.supabase\.co\//, route => route.abort())
  await stubLocalEdgeFunctions(page)
})

async function startSession(page, beforeStart = null) {
  await page.getByRole('button', { name: 'Прожить 7 дней' }).click()
  await expect(page.locator('.aeHint', { hasText: /Сдвинуто слов: [1-9]/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('сегодня')
  await page.getByRole('button', { name: 'Начать повторение' }).click()
  const screen = page.locator('.reviewScreen')
  await expect(screen.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await beforeStart?.()
  await screen.getByRole('button', { name: 'Начать', exact: true }).click()
  return screen
}

const option = (screen, text) => screen.locator('.chooseWordPanel').getByRole('button', { name: text, exact: true })

test('сессия: ошибка → слово в конце → верно; «Знаю»; жест, клавиша, итог, XP, мостик в модуль', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()

  // ── 1. Ошибка возвращает слово в конец сессии ───────────────────────
  // Фото карточки сервер отдаёт с задержкой 5 с. Первую карточку греет
  // вступление; скачанное передаётся плееру — фото видно сразу после
  // «Начать». Без передачи плеер качал бы заново и ждал бы те же 5 с
  const PHOTO = '**/icons/icon-512.png'
  await page.route(PHOTO, async route => { await new Promise(r => setTimeout(r, 5000)); await route.continue() })
  let screen = await startSession(page, async () => {
    await page.waitForResponse(r => r.url().includes('icon-512.png'), { timeout: 20_000 })
    await page.waitForTimeout(500)
  })
  await expect(screen.locator('.reviewCard img[src^="blob:"]')).toBeVisible({ timeout: 2500 })
  await page.unroute(PHOTO)
  // Слово во фразе под спойлером, одна капсула на одну карточку
  await expect(screen.locator('.reviewPhraseHidden')).toHaveText('●●●●')
  await expect(screen.locator('.reviewCapsule')).toHaveCount(1)
  await option(screen, 'cake').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--bad')).toContainText('вернётся в конце')
  await expect(screen.locator('.reviewPhraseWord')).toHaveText('cook') // слово проявилось
  await page.keyboard.press('Enter') // «Далее» с клавиатуры
  // Возврат добавил карточку; на возврате «Знаю» нет — только ответ
  await expect(screen.locator('.reviewCapsule')).toHaveCount(2)
  await expect(screen.locator('.reviewCapsule--bad')).toHaveCount(1)
  await expect(screen.getByRole('button', { name: 'Знаю' })).toHaveCount(0)
  await option(screen, 'cook').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--ok')).toHaveText('Верно!')
  await swipeRight(page, screen.locator('.reviewCard')) // «Далее» жестом

  await expect(screen.locator('.reviewSummaryTitle')).toHaveText('Повторение завершено', { timeout: 30_000 })
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook шатается — вернёмся завтра.')
  await expect(screen.locator('.reviewWord--bad')).toContainText('cook')
  await expect(screen.locator('.reviewReward')).toContainText(/\+2 XP|XP за повторение на сегодня уже набран/)
  // Мостик в модуль слова: пройден урок cook — 1 из 4 (сид)
  await expect(screen.locator('.reviewBridge')).toHaveText("Продолжить «I'm trying to cook · E2E-КОЛОДЫ» · 25%")
  await screen.getByRole('button', { name: 'Готово' }).click()
  await expect(screen).toHaveCount(0)

  // ── 2. «Знаю» — без ответа, слово крепнет ───────────────────────────
  screen = await startSession(page)
  await screen.getByRole('button', { name: 'Знаю' }).click()
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook окрепло.', { timeout: 30_000 })
  await expect(screen.locator('.reviewWord--ok .strengthDotOn')).toHaveCount(2) // шаг 1 → 2

  // ── 3. Мостик открывает схему модуля во вкладке «Уроки» ─────────────
  await screen.locator('.reviewBridge').click()
  await expect(screen).toHaveCount(0)
  await expect(page.locator('.feedModuleScreen')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.feedModuleScreen')).toContainText("I'm trying to cook · E2E-КОЛОДЫ")

  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('шаг 2')
})

// Смахнуть карточку вправо мышью (pointer-события — те же, что у пальца)
async function swipeRight(page, card) {
  const box = await card.boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 3, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 3 + 160, y - 10, { steps: 6 })
  await page.mouse.up()
}

// «＋ В обучение» (Админ → Колоды): слово — в память админа к повтору сегодня
// без прохождения урока → вкладка «Память» предлагает повторить → «Убрать»
// (Админ → Повторение). keep не из модуля E2E-КОЛОДЫ — admin-learn.spec.js
// (идёт параллельно) его не смотрит; тесты этого файла идут по очереди, и
// сессия выше keep не видит: в конце теста слово убрано
test('админ вручную добавляет слово в обучение и убирает его', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Колоды' }).click()
  await page.locator('.adkFilter input').uncheck()
  const row = page.locator('.adkRow').filter({ has: page.locator('.adkWord', { hasText: /^keep$/ }) })
  await expect(row.locator('.adkLearn')).toContainText('Не в обучении', { timeout: 30_000 })
  await row.getByRole('button', { name: '＋ В обучение' }).click()
  await expect(row.locator('.adkLearn')).toContainText('В обучении · шаг 1 · к повтору сегодня')

  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Сегодня повторяем 1 слово', { timeout: 30_000 })
  await expect(page.locator('.memLvl--1 .memChip', { hasText: 'keep' })).toBeVisible()
  await main.locator('.lrCta').click()
  const review = page.locator('.reviewScreen')
  await expect(review.locator('.reviewTeacherLine')).toContainText('Сегодня 1 слово', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Не сейчас' }).click()

  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()
  await page.locator('.arvRow', { hasText: 'keep' }).getByRole('button', { name: 'Убрать' }).click()
  await expect(page.locator('.aeHint', { hasText: '«keep» убрано из обучения' })).toBeVisible()
  await expect(page.locator('.arvRow', { hasText: 'keep' })).toHaveCount(0)
})
