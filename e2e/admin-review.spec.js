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

async function startSession(page) {
  await page.getByRole('button', { name: 'Прожить 7 дней' }).click()
  await expect(page.locator('.aeHint', { hasText: /Сдвинуто слов: [1-9]/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('сегодня')
  await page.getByRole('button', { name: 'Начать повторение' }).click()
  // Вступления с «Начать» нет: «Ищу слова…» → сразу первая карточка
  const screen = page.locator('.reviewScreen')
  await expect(screen.locator('.reviewLoading')).toContainText('Ищу слова')
  await expect(screen).not.toHaveClass(/reviewScreen--lvl/) // ступень слова ещё неизвестна — фон нейтральный, а не чужого цвета
  await expect(screen.getByRole('button', { name: 'Начать', exact: true })).toHaveCount(0)
  return screen
}

const option = (screen, text) => screen.locator('.chooseWordPanel').getByRole('button', { name: text, exact: true })

test('сессия: ошибка → слово в конце → верно; жест, клавиша, итог, XP, мостик в модуль', async ({ page }) => {
  test.slow()
  // Счётчик награды в переносе XP: пишем каждое его значение (шарики отнимают от него по доле)
  await page.addInitScript(() => {
    window.__xpSeq = []
    new MutationObserver(() => {
      const el = document.querySelector('.summaryXpEarned > span:first-child')
      if (el && el.textContent !== window.__xpSeq[window.__xpSeq.length - 1]) window.__xpSeq.push(el.textContent)
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()

  // ── 1. Ошибка возвращает слово в конец сессии ───────────────────────
  // Фото карточки сервер отдаёт с задержкой 5 с
  const PHOTO = '**/icons/icon-512.png'
  await page.route(PHOTO, async route => { await new Promise(r => setTimeout(r, 5000)); await route.continue() })
  let screen = await startSession(page)
  await expect(screen.locator('.reviewCard')).toBeVisible({ timeout: 30_000 })
  // Перед заданием — точки «печатает»; пока греется медиа они держатся, но не дольше ~1,5 с, даже если
  // фото грузится 5 с: дальше карточка играет сама (медиа догрузится)
  await expect(screen.locator('.reviewCardFrame .playerWaitingDots')).toBeVisible({ timeout: 2000 })
  // Рамка карточки тёмная уже на точках (как плеер) — не серая с узором, которая потом темнеет
  expect(await screen.locator('.reviewCardFrame').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(14, 16, 19)')
  expect(await screen.locator('.reviewCardFrame .lessonPlayer').count()).toBe(0) // плеер ещё не смонтирован
  await expect(screen.locator('.reviewCardFrame .lessonPlayer')).toBeVisible({ timeout: 2500 }) // точки отстояли ≤ ~1,5 с, а не 5 с загрузки фото
  await page.unroute(PHOTO)
  // Слово cook — на первом шаге («Новые»): оттенок фона, точки закрытого слова и акцент «худа» чата — небесные
  await expect(screen).toHaveClass(/reviewScreen--lvl1/)
  expect(await screen.locator('.reviewPhraseHidden').evaluate(el => getComputedStyle(el).color)).toBe('rgb(79, 179, 238)')
  expect(await screen.locator('.reviewCardFrame .lessonPlayer').evaluate(el => getComputedStyle(el).getPropertyValue('--player-accent').trim())).toBe('#4fb3ee')
  // Слово во фразе под спойлером, одна капсула на одну карточку — внизу, под панелью действий
  await expect(screen.locator('.reviewPhraseHidden')).toHaveText('●●●●')
  await expect(screen.locator('.reviewCapsule')).toHaveCount(1)
  expect((await screen.locator('.reviewCapsules').boundingBox()).y).toBeGreaterThan((await screen.locator('.reviewCard').boundingBox()).y)
  // Место под панель действий занято всегда: при ответе карточка не двигается
  const cardBox = async () => { const b = await screen.locator('.reviewCard').boundingBox(); return [b.y, b.height].map(Math.round) }
  const footH = async () => Math.round((await screen.locator('.reviewActions').boundingBox()).height)
  const still = { card: await cardBox(), foot: await footH() }
  await option(screen, 'cake').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--bad')).toContainText('мы ещё вернёмся к этому слову')
  await expect(screen.locator('.reviewPhraseWord')).toHaveText('cook') // слово проявилось
  await expect(screen.locator('.rvSlot--open')).toHaveCount(1, { timeout: 3000 }) // переход кончился: слот снова обычный текст
  expect(await screen.locator('.rvSlot').evaluate(el => el.style.width)).toBe('') // ширина вернулась в авто — фраза не зависит от размера окна
  await expect(screen.locator('.reviewPhraseHidden')).toBeHidden() // точки убраны из потока
  await page.waitForTimeout(900) // плашка откинулась, подсказка проявилась
  expect({ card: await cardBox(), foot: await footH() }).toEqual(still)
  await swipeLeft(page, screen.locator('.reviewCard')) // «Далее» жестом (карточка не последняя)
  // Возврат добавил карточку
  await expect(screen.locator('.reviewCapsule')).toHaveCount(2)
  await expect(screen.locator('.reviewCapsule--bad')).toHaveCount(1)
  await option(screen, 'cook').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--ok')).toHaveText('Верно!')
  await page.waitForTimeout(900)
  expect({ card: await cardBox(), foot: await footH() }).toEqual(still) // и при верном ответе — на месте
  // Последняя карточка: ни «Далее», ни «смахни…» — пауза на плашке, затемнение, итог поверх еле видной карточки
  await expect(screen.locator('.reviewSwipeHint, .reviewNext')).toHaveCount(0)
  // Колода до итога не темнеет: затемнение — это подложка самого итога, она появляется вместе с результатами
  await expect(screen.locator('.reviewSummary')).toHaveCount(0)
  await expect(screen.locator('.reviewSummaryTitle')).toHaveText('Повторение завершено', { timeout: 30_000 })
  await expect(screen.locator('.reviewSummary.lessonSummaryOverlayVisible')).toBeVisible()
  await expect.poll(() => screen.locator('.reviewSummary').evaluate(el => getComputedStyle(el).backgroundColor), { timeout: 3000 }).toBe('rgba(0, 0, 0, 0.9)')
  await expect(screen.locator('.reviewCard')).toHaveCount(1) // карточка осталась под итогом
  await expect(screen.locator('.reviewCard')).toBeVisible()
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook пока даётся непросто — вернёмся к нему завтра.')
  await expect(screen.locator('.reviewWord--soft')).toContainText('cook')
  await expect(screen.locator('.reviewReward')).toContainText(/серии|серия/, { timeout: 20_000 }) // после переноса награды в XP-полоску; «+N XP» текстом не пишем
  // Перенос XP в полоску: шариков столько же, сколько XP, но не больше десяти; каждый отлёт отнимает от счётчика
  // свою долю (доли отличаются не больше чем на 1), в конце счётчик пуст
  await expect(screen.locator('.reviewReward--on')).toHaveCount(1, { timeout: 20_000 }) // строка серии включается, когда перенос закончен
  const seq = (await page.evaluate(() => window.__xpSeq)).map(Number)
  expect(seq.length, 'счётчик XP менялся').toBeGreaterThan(1)
  const steps = seq.slice(1).map((v, i) => seq[i] - v)
  expect(seq[seq.length - 1]).toBe(0)
  expect(steps.length).toBe(Math.min(seq[0], 10))
  expect(steps.every(d => d > 0)).toBe(true)
  expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1)
  expect(steps.reduce((a, b) => a + b, 0)).toBe(seq[0])
  // Мостик в модуль слова: пройден урок cook — 1 из 4 (сид)
  await expect(screen.locator('.reviewBridge .reviewBridgeMain')).toHaveText('Продолжить изучение')
  await expect(screen.locator('.reviewBridge .reviewBridgePhrase')).toHaveText("«I'm trying to cook · E2E-КОЛОДЫ»") // фраза — на своей строке
  await expect(screen.locator('.reviewBridge .reviewBridgeSub')).toHaveText('Пройдено 25% урока')
  await expect(screen.locator('.reviewBridge .reviewBridgeSub b')).toHaveText('25%')
  await screen.getByRole('button', { name: 'Готово' }).click()
  await expect(screen).toHaveClass(/reviewScreen--leaving/) // экран растворяется, а не пропадает разом
  await expect(screen).toHaveCount(0, { timeout: 5000 })

  // ── 2. Верный ответ — слово крепнет ─────────────────────────────────
  screen = await startSession(page)
  await option(screen, 'cook').click({ timeout: 30_000 })
  await expect(screen.locator('.reviewVerdict--ok')).toBeVisible()
  await page.keyboard.press('Enter') // последняя карточка: итог и сам придёт через паузу, Enter — сразу
  await expect(screen.locator('.reviewTeacherLine')).toHaveText('cook теперь помнится лучше.', { timeout: 30_000 })
  await expect(screen.locator('.reviewWord--ok .memChipFill')).toHaveAttribute('style', /width: 75%/, { timeout: 15_000 }) // шаг 1 → 2: полоска доросла до 75% ступени

  // ── 3. Мостик открывает схему модуля во вкладке «Уроки» ─────────────
  await screen.locator('.reviewBridge').click()
  await expect(screen).toHaveCount(0)
  await expect(page.locator('.feedModuleScreen')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.feedModuleScreen')).toContainText("I'm trying to cook · E2E-КОЛОДЫ")

  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await expect(page.locator('.arvRow', { hasText: 'cook' })).toContainText('шаг 2')
})

// На касании (телефон) вместо кнопки «Далее» — подсказка «смахни карточку влево». Место под неё
// занято заранее: карточка при верном ответе не двигается по вертикали, а подсказка и полоска
// прогресса не налезают друг на друга
test.describe('на касании', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } })
  test('ответ: карточка на месте, подсказка под ней, полоска прогресса ниже', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Админ', exact: true }).click()
    await page.locator('.avTab', { hasText: 'Повторение' }).click()
    const screen = await startSession(page)
    await expect(screen.locator('.reviewCard')).toBeVisible({ timeout: 30_000 })
    const box = async sel => { const b = await screen.locator(sel).boundingBox(); return { y: Math.round(b.y), h: Math.round(b.height) } }
    await page.waitForTimeout(1000) // фраза доопустилась из-за верха экрана
    const before = await box('.reviewCard')
    const phraseBefore = await box('.reviewPhrase')
    // Ошибка с первой попытки: слово вернётся другой карточкой, значит эта — не последняя и её смахивают
    // (на последней подсказки нет — после ответа экран сам уходит в итог)
    await option(screen, 'cake').tap({ timeout: 30_000 })
    await expect(screen.locator('.reviewVerdict--bad')).toBeVisible()
    await expect(screen.locator('.reviewSwipeHint')).toBeVisible()
    await page.waitForTimeout(1200) // подсказка проявилась
    expect(await box('.reviewCard')).toEqual(before) // карточка не сдвинулась
    // и чат внутри неё не уехал: рамка не прокручивается (раньше сдвигалась на высоту распорки, снизу торчал край панели)
    expect(await screen.locator('.reviewCardFrame').evaluate(el => el.scrollTop)).toBe(0)
    expect(await box('.reviewPhrase')).toEqual(phraseBefore) // фраза наверху — там же
    const hint = await screen.locator('.reviewSwipeHint').boundingBox()
    const bar = await screen.locator('.reviewCapsules').boundingBox()
    const card = await screen.locator('.reviewCard').boundingBox()
    expect(hint.y).toBeGreaterThanOrEqual(card.y + card.height) // подсказка под карточкой
    expect(bar.y).toBeGreaterThanOrEqual(hint.y + hint.height - 1) // полоска ниже подсказки, не поверх
    expect(bar.height).toBeLessThanOrEqual(2.5) // тонкая
  })
})

// Смахнуть карточку влево мышью (pointer-события — те же, что у пальца)
async function swipeLeft(page, card) {
  const box = await card.boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 2 / 3, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 2 / 3 - 160, y - 10, { steps: 6 })
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
  await expect(review.locator('.reviewCard')).toBeVisible({ timeout: 30_000 }) // сразу карточка, без «Начать»
  await review.getByRole('button', { name: 'Назад' }).click()

  await page.getByRole('button', { name: 'Админ', exact: true }).click()
  await page.locator('.avTab', { hasText: 'Повторение' }).click()
  await page.locator('.arvRow', { hasText: 'keep' }).getByRole('button', { name: 'Убрать' }).click()
  await expect(page.locator('.aeHint', { hasText: '«keep» убрано из обучения' })).toBeVisible()
  await expect(page.locator('.arvRow', { hasText: 'keep' })).toHaveCount(0)
})
