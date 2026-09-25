import { test, expect } from './fixtures.js'
import { MODULE_ID, hasTestModule } from './config.js'

// Гостевые сценарии (этап C): гость не пишет на сервер — безопасный слой.
// Через fixtures.js каждый тест попутно валится при ошибке консоли/сети.

// Кнопка «Изучить фразу» АКТИВНОГО слайда. Лента виртуализирована: в DOM
// лежат и соседние слайды за экраном, у каждого своя такая кнопка, и
// .first() попадал в невидимого соседа («element is outside of the viewport»).
// Активный слайд помечен классом feedSlideWrapActive (FeedSwiper.jsx)
const learnBtn = page => page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' })

test('лента загрузилась: есть слайд с кнопкой «Изучить фразу»', async ({ page }) => {
  await page.goto('/')
  await expect(learnBtn(page))
    .toBeVisible({ timeout: 30_000 })
})

test('deep-link /?m=<id> открывает ленту на тест-модуле', async ({ page }) => {
  test.skip(!hasTestModule, 'нет id тест-модуля в e2e/config.js')
  await page.goto(`/?m=${MODULE_ID}`)
  // Закреплённая фраза показывается первой — её «Изучить фразу» видна сразу
  await expect(learnBtn(page))
    .toBeVisible({ timeout: 30_000 })
})

test('«Изучить фразу» тест-модуля → схема со Стартом', async ({ page }) => {
  test.skip(!hasTestModule, 'нет id тест-модуля в e2e/config.js')
  await page.goto(`/?m=${MODULE_ID}`)
  await learnBtn(page).click()
  await expect(page.getByRole('button', { name: /Назад/ })).toBeVisible({ timeout: 30_000 })
  // «Старт» есть только если у модуля сохранены уроки. Пока пусто —
  // мягкий skip (дострой модуль в админке + 💾), тест позеленеет сам.
  const start = page.getByText('Старт').first()
  // waitFor, а не isVisible: isVisible не ждёт (timeout игнорирует) — схема не
  // успевала отрисоваться, и тест тихо skip'ался вместо проверки
  const hasStart = await start.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  test.skip(!hasStart, 'тест-модуль ещё без уроков (lesson_ids пуст) — дострой в админке')
  await expect(start).toBeVisible()
})

test('гость проходит Старт и урок → звёзды в итогах', async ({ page }) => {
  test.skip(!hasTestModule, 'нет id тест-модуля в e2e/config.js')
  // Полный прогон через плеер: селекторы и флоу проверены вручную end-to-end
  // (Старт → урок → «верно» → 3★). Но в headless Playwright на нестабильной
  // сети РФ предзагрузка скрипта урока при запуске иногда отдаёт пустой набор
  // нод («Нод нет»), и тест флачит. Гоняем только при E2E_PLAYER=1 — в CI это
  // job local (локальный Supabase с сидом, сети нет — стабильно зелёный).
  test.skip(!process.env.E2E_PLAYER, 'полный прогон плеера — только при E2E_PLAYER=1 (локально флак на сети РФ)')
  test.slow() // длинный флоу через плеер + медленная сеть

  await page.goto(`/?m=${MODULE_ID}`)
  await learnBtn(page).click()

  // Старт (text-нода) — запускаем и ждём экрана итогов
  await page.getByRole('button', { name: 'Начать', exact: true }).click()
  await page.getByRole('button', { name: /Начать урок/ }).click()
  await expect(page.getByText('Урок завершён')).toBeVisible({ timeout: 60_000 })
  // Кнопка итогов, а не «×» в шапке урока (у неё тоже aria-label «Закрыть»)
  await page.locator('.summaryCloseBtn').click()

  // Старт пройден → средний «Урок» разблокировался, запускаем его
  await page.locator('.mgNode--lesson', { hasText: 'Урок' }).click()
  await page.getByRole('button', { name: /Начать урок/ }).click()

  // «выбери слово»: верный вариант — первый («верно», см. тест-модуль)
  await page.getByRole('button', { name: 'верно', exact: true }).click()

  // Итоги обычного урока → блок звёзд (ответ верный → 3★)
  await expect(page.locator('.summaryStarsBlock')).toBeVisible({ timeout: 60_000 })
})

// ОТЛОЖЕНО (этап C, требует доработки): тесты HUD активного слайда —
// «лайк гостем → форма входа», «тап по звуку → оверлей исчез». Лента
// бесконечная и виртуализированная: все копии слайда с одинаковым testid
// спозиционированы вне вьюпорта (y ≈ -64000), надёжного «активного» DOM-узла
// нет → клик по нужной кнопке через селектор нестабилен. Ревизит: либо
// маркер активного слайда в коде ленты, либо клик по видимому по boundingBox.
// Пока покрыто вручную (PROJECT.md: тап гостя по лайку → форма входа).

test('«Моё обучение» гостю: память пуста, «Войти» ведёт в профиль', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.locator('.lrMainTitle')).toHaveText('Память пока пуста', { timeout: 30_000 })
  await page.locator('.lrGuestLead').getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.shellV2NavBtnActive')).toHaveText('Профиль')
})
