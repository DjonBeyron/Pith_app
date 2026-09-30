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
  // Озвучка: библиотеки word_audio в сиде нет — подменяем (одно слово keep),
  // а play() только записываем: слышно ли, проверять не нужно
  await page.route(/\/rest\/v1\/word_audio/, route => route.fulfill({
    json: [{ lang: 'en', key: 'keep', text: 'keep', url: 'https://audio.test/keep.mp3' }],
  }))
  await page.route(/audio\.test/, route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }))
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { window.__plays = [...(window.__plays ?? []), this.src]; return Promise.resolve() }
  })
  await page.goto('/')
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDue/, { timeout: 30_000 }) // есть что повторить
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Сегодня повторяем 1 слово', { timeout: 30_000 })
  // Кнопка «Повторить»: три обводки вокруг; затемнение снизу — над нижней панелью, без кликов
  await expect(main.locator('.lrCtaRing')).toHaveCount(3)
  await expect(page.locator('.lrEdgeBottom')).toHaveCSS('pointer-events', 'none')
  // Шарик слова к повтору стартует крупнее, чем финиширует: сжимается вместе с линией связи
  const [s0, s1] = await page.locator('.memBall').first().evaluate(el => ['--s0', '--s1'].map(k => Number(el.style.getPropertyValue(k))))
  expect(s1).toBeGreaterThan(0)
  expect(s0).toBeGreaterThan(s1)

  // Лестница: keep — в «Новых» (going не пройден — в памяти его нет)
  const fresh = page.locator('.memLvl--1')
  await expect(fresh.locator('.memLvlCount')).toHaveText('1')
  await expect(fresh.locator('.memChip')).toHaveText(['keep'])
  await expect(page.locator('.memSideLabel')).toHaveText(/^1\s*слово во временной памяти$/)
  // Все слова ступени: keep — «сегодня»
  await fresh.getByRole('button', { name: 'Все слова: Новые слова' }).click()
  await expect(page.getByRole('tab', { name: /Новые/ })).toHaveAttribute('aria-selected', 'true')
  const row = page.locator('.memChipRow', { hasText: 'keep' })
  await expect(row).toContainText('сегодня')
  // Кнопка ▶ — из той же базы озвучки, что слова в уроках
  await row.getByRole('button', { name: 'Воспроизвести «keep»' }).click({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => window.__plays)).toEqual(['https://audio.test/keep.mp3'])
  // Описание ступени: как слова сюда попадают → что делать → куда перейдут
  await expect(page.locator('.memHead')).toContainText('Сюда попадают слова из уроков')
  await expect(page.locator('.memHead')).toContainText('перейдёт в «Знакомые»')

  // Окно слова: уровень памяти («1 из 4»), из какого урока пришло, срока повтора нет;
  // «Повторить сейчас» — удобство Pro: обычному пользователю — пейволл
  await row.locator('.memChipMain').click()
  const sheet = page.getByRole('dialog', { name: 'Слово keep' })
  await expect(sheet).toContainText('Новое слово')
  await expect(sheet).toContainText('Уровень 1 из 4')
  await expect(sheet).toContainText('Из урока «keep» · фраза «Keep going · E2E-ОБУЧЕНИЕ»')
  await expect(sheet).not.toContainText('повтор сегодня')
  await sheet.getByRole('button', { name: 'Повторить сейчас · Pro' }).click()
  await expect(page.locator('.ppCard')).toBeVisible()
  await page.locator('.ppClose').click()
  // Шапка страницы: полное название уровня и стрелка «назад» (не «Моя память»); вкладок четыре
  await expect(page.locator('.memTitle')).toHaveText('Первый уровень памяти')
  await expect(page.getByRole('tab')).toHaveCount(4)
  // Вкладки ступеней: «Знакомые» пока пусто
  await page.getByRole('tab', { name: /Знакомые/ }).click()
  await expect(page.locator('.memTitle')).toHaveText('Второй уровень памяти')
  await expect(page.locator('.memHead')).toContainText('Знакомые слова')
  await expect(page.locator('.memListEmpty')).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  // Лестница снова с линиями: точки у шапки, трёх ступеней и связи в пятиугольник
  await expect(page.locator('.memWires circle')).toHaveCount(6)
  // Пятиугольник — «N Слов в постоянной памяти»; его страница — четвёртая вкладка «Постоянная» (пока пусто)
  const perm = page.getByRole('button', { name: /в постоянной памяти/ })
  await expect(perm).toContainText('0')
  await perm.click()
  await expect(page.locator('.memTitle')).toHaveText('Четвёртый уровень памяти')
  await expect(page.getByRole('tab', { name: /Постоянная/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.memHead')).toContainText('Постоянная память')
  await expect(page.locator('.memHead')).toContainText('Тут будут храниться слова из «Усвоенных»')
  await expect(page.locator('.memPermCount')).toHaveCount(0)
  // Повторный тап по значку «Память» — назад на главный экран (без кнопки «Назад»)
  await nav.click()
  await expect(page.locator('.memPage')).toHaveCount(0)
  await expect(page.locator('.memZone')).toBeVisible()

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
  await expect(nav).not.toHaveClass(/shellV2NavBtnDue/)

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

// Настройки повторения — в шестерёнке профиля (единственной в приложении)
const openSettings = async page => {
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click({ timeout: 30_000 })
}

test('«Отпуск»: пауза расписания (в настройках) и возвращение (во вкладке «Память»)', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: 'Уезжаю в отпуск' }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Отпуск' }).getByRole('button', { name: 'Поставить на паузу' }).click()
  await expect(page.getByText(/Ты в отпуске с .* — вернуться можно во вкладке «Память»/)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.shellV2NavBtnDue')).toHaveCount(0) // в отпуске не зовём повторять

  await page.getByRole('button', { name: 'Память', exact: true }).click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Ты в отпуске', { timeout: 30_000 })
  await main.getByRole('button', { name: 'Вернуться из отпуска' }).click()
  await expect(main).not.toContainText('Ты в отпуске', { timeout: 30_000 })
  // Во вкладке настроек нет — ни отпуска, ни минут
  await expect(page.getByRole('button', { name: 'Уезжаю в отпуск' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
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

test('«Сколько минут в день» меняется в настройках и сохраняется в аккаунте', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await expect(page.getByText(/^За 7 дней|^На этой неделе повторений/)).toBeVisible({ timeout: 30_000 }) // итоги недели
  await page.getByRole('button', { name: /^\d+ минут в день · изменить$/ }).click()
  await page.getByRole('dialog', { name: 'Минуты в день' }).getByRole('button', { name: /15 мин/ }).click()
  await expect(page.getByRole('button', { name: '15 минут в день · изменить' })).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await openSettings(page)
  await expect(page.getByRole('button', { name: '15 минут в день · изменить' })).toBeVisible({ timeout: 30_000 })
})
