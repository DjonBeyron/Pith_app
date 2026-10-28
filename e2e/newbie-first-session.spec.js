import { test, expect } from './fixtures.js'
import { prepareNewbie, learnTab, memoryTabToRemind } from './helpers/newbieSteps.js'

// Первая сессия нового пользователя целиком (PLAN_NEW_USER.md → раздел 9 «Проверка»): первый слайд → звук → быстрые пролисты →
// вопрос Пита (B3) → ответ → реплика Пита → игра «Выбери слово» (B4) → «Сохранить слово» (B6) → вкладка «Память» (B1) →
// рассказ Пита (C1) → «Когда удобно учиться?» (C2) → выход. Новичок = гость с чистым localStorage; бэкенд — заглушка сети
// (helpers/newbieBackend.js), поэтому прогон не зависит ни от базы, ни от Docker. Листаем клавишей ↓, как guest-slowhint.spec.js.
// Реальное время: шторка Пита не раньше 20 с после входа (MIN_MS_AFTER_OPEN в prompts/promptRules.js) — ждём её честно,
// часы не подменяем (Swiper, видео и таймеры бюджета живут на одних часах).
// В первые три сессии бюджет Пита — не больше двух шторок за сессию (MAX_PER_SESSION_EARLY), и вопрос по поведению уже занимает одну.
// Подсказка «Зажми, чтобы замедлить» (3-е видео со звуком) заняла бы вторую и вытеснила игру, поэтому её гасим флагом «уже пользовался»
// (так же делает guest-slowhint.spec.js): здесь проверяется путь «вопрос → игра → семя», а не очередь подсказок
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('pithy_slowmo_hint_seen_v1', '1') } catch { /* приватный режим */ } })
  await prepareNewbie(page)
})

const next = async (page, pauseMs) => { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(pauseMs) }
const sheet = page => page.locator('.promptSheet')

// Спокойно листаем (дольше 2 с на слайд — это уже не «быстрые»), пока Пит не предложит игру. Бюджет Пита — один на всё: между
// шторками не меньше пяти слайдов, а подсказки ленты (например «замедлить» на 3-м видео со звуком) идут впереди предложения
// игры — такие закрываем крестиком и листаем дальше. Лента длинная (24 фразы), так что запаса хватает
async function swipeUntilGameOffer(page) {
  for (let i = 0; i < 16; i++) {
    await next(page, 2300)
    if (await sheet(page).filter({ hasText: 'Я нашёл игру на минутку' }).count()) return
    if (await sheet(page).count()) await sheet(page).getByRole('button', { name: 'Закрыть' }).click()
  }
}

test('[B1, B3, B4, B6, C1, C2.guest] новичок: от первого слайда до «Когда удобно учиться?»', async ({ page }) => {
  test.setTimeout(150_000)

  await test.step('первый слайд: «Память» скрыта, видео и чип «Включить звук» на месте', async () => {
    await page.goto('/')
    await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.feedSlideWrapActive .feedPhrase')).toContainText('Newbie phrase')
    await expect(learnTab(page)).toHaveCount(0) // B1: у нового пользователя вкладки «Память» нет
    await expect(sheet(page)).toHaveCount(0) // и вопросов Пита раньше времени нет
  })

  await test.step('звук: тап по чипу включает его для всей ленты', async () => {
    await page.locator('.feedSlideWrapActive .feedSoundChip').click()
    await expect(page.locator('.feedSoundChip')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('pithy_sound_v1'))).toBe('1')
  })

  await test.step('быстрые пролисты подряд (быстрее 2 с на слайд)', async () => {
    // Первый слайд мог провисеть дольше 2 с (загрузка, тап по чипу) — тогда первый пролист «медленный» и не считается,
    // поэтому листаем шесть раз (под нагрузкой воркеров любой пролист может затянуться): три быстрых подряд в любом случае набираются (paceQuestion.js: PACE_STREAK = 3)
    for (let i = 0; i < 6; i++) await next(page, 500)
    await expect(sheet(page)).toHaveCount(0) // раньше 20 с шторки нет: бюджет Пита ждёт
  })

  await test.step('вопрос Пита: «Кажется, не зацепило…» с тремя ответами и крестиком', async () => {
    await expect(sheet(page)).toContainText('Кажется, не зацепило', { timeout: 40_000 })
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveText(['Слишком быстро, не успеваю', 'Слишком просто, хочется сложнее', 'Всё хорошо, просто смотрю'])
    await expect(sheet(page).getByRole('button', { name: 'Закрыть' })).toBeVisible()
  })

  await test.step('ответ → реплика Пита на 3 секунды → шторка уходит', async () => {
    await sheet(page).getByRole('button', { name: 'Слишком быстро, не успеваю' }).click()
    await expect(sheet(page)).toContainText('Понял')
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveCount(0) // вместо кнопок — одна строка
    await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  })

  await test.step('игра «Выбери слово»: Пит предлагает, «Давай» открывает карточку слова', async () => {
    await swipeUntilGameOffer(page)
    await expect(sheet(page)).toContainText('Я нашёл игру на минутку')
    await sheet(page).getByRole('button', { name: 'Давай' }).click()
    const game = page.getByRole('group', { name: 'Выбери слово' })
    await expect(game).toBeVisible()
    await game.getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 }) // верный вариант
    await expect(game.locator('.chooseVerdict')).toHaveText('Верно!')
    await game.getByRole('button', { name: 'Дальше' }).click()
    await expect(game).toHaveCount(0)
  })

  await test.step('«Сохранить слово»: после верного ответа плашка семени, слово — в память гостя', async () => {
    const seed = page.getByRole('group', { name: 'Чтобы не забыть слово, сохрани его' })
    await expect(seed).toBeVisible({ timeout: 15_000 })
    await expect(seed).toContainText('keep')
    expect(seed).not.toContainText(/памят|вкладк/i) // в первый раз этих слов в тексте нет
    await seed.getByRole('button', { name: 'Сохранить' }).click()
    await expect(seed).toHaveCount(0)
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pithy_guest_memory_v1')))).toHaveProperty('keep.step', 1)
  })

  await test.step('вкладка «Память» → рассказ Пита → «Когда удобно учиться?» → 20:00 → «Готово»', () => memoryTabToRemind(page))

  await test.step('выход: шторки закрыты, лента на месте', async () => {
    await expect(page.locator('.lrSheetBack')).toHaveCount(0)
    await page.getByRole('button', { name: 'Уроки', exact: true }).click()
    await expect(page.locator('.feedSlideWrapActive')).toBeVisible()
  })
})
