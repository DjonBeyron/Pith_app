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
const seedMemory = (page, step = 1) => page.addInitScript(([d, st]) => {
  if (sessionStorage.getItem('e2e_guest_seeded')) return
  sessionStorage.setItem('e2e_guest_seeded', '1')
  localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
    keep: { word: 'keep', step: st, due_on: d, last_card_id: null, reviews: 0, lapses: 0 },
  }))
}, [today(), step])

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
  // Урок-слово впервые — «Новое слово во временной памяти»; по «Закрыть»
  // слово улетает к вкладке «Память», на ней загорается точка
  await expect(page.locator('.summaryMemCard')).toContainText('Новое слово во временной памяти')
  await expect(page.locator('.summaryMemWord')).toHaveText('keep')
  await page.locator('.summaryCloseBtn').click()

  // Первый пройденный урок → «Сколько минут в день?» (один раз), гостю —
  // вторым шагом «Сохрани прогресс»
  const ask = page.getByRole('dialog', { name: 'Минуты в день' })
  await ask.getByRole('button', { name: /10 мин/ }).click({ timeout: 15_000 })
  await expect(ask).toContainText('Спасибо за ответ') // ~2 с «настраиваем», потом гостю — «Сохрани прогресс»
  await expect(ask).toContainText('Сохрани прогресс', { timeout: 15_000 })
  await ask.getByRole('button', { name: 'Позже' }).click()
  await expect(ask).toHaveCount(0)

  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtnDue/) // новое слово — повторять его завтра, а вкладка уже зовёт (залитая иконка)
  await nav.click()
  await expect(nav).not.toHaveClass(/shellV2NavBtnDue/) // открыли вкладку — перестала звать
  await expect(page.locator('.lrMain')).toContainText('Памяти пора отдыхать', { timeout: 30_000 })
  await expect(page.locator('.lrMain')).toContainText('Сегодня все слова записаны в твою память')
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
  await expect(nav).toHaveClass(/shellV2NavBtnDue/, { timeout: 30_000 })
  // Светится только мозг: иконка лаймовая, подпись «Память» — обычного цвета
  // Цвет мозга набирается плавно (transition 0.8 с, learn.css) — ждём, пока дойдёт до лаймового
  await expect.poll(() => nav.evaluate(el => getComputedStyle(el.querySelector('svg')).color), { timeout: 5000 }).toBe('rgb(182, 254, 59)')
  expect(await nav.evaluate(el => getComputedStyle(el).color)).not.toBe('rgb(182, 254, 59)')
  await nav.click()
  await page.locator('.lrCta').click()
  const review = page.locator('.reviewScreen')
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await expect(review.locator('.reviewTeacherLine').first()).toHaveText('keep теперь помнится лучше.', { timeout: 30_000 }) // последняя карточка — итог придёт сам
  await expect(review.locator('.reviewGuestLead')).toBeVisible()
  // Пока полоска слова пополняется: мигает ВСЯ заливка (не только прирост) и линия на границе; обводка не мигает
  const bar = review.locator('.reviewBar--grow')
  await bar.waitFor({ timeout: 15_000 })
  const probe = () => bar.evaluate(el => ({
    outline: getComputedStyle(el).animationName,
    fill: getComputedStyle(el.querySelector('.memChipFill')).animationName,
    edge: getComputedStyle(el.querySelector('.reviewBarEdge')).animationName,
    fillW: el.querySelector('.memChipFill').getBoundingClientRect().width,
    gainEl: el.querySelectorAll('.reviewBarGain').length,
  }))
  const t1 = await probe()
  expect({ outline: t1.outline, fill: t1.fill, edge: t1.edge, gainEl: t1.gainEl }).toEqual({ outline: 'none', fill: 'reviewFillBlink', edge: 'reviewEdgeBlink', gainEl: 0 })
  await page.waitForTimeout(500)
  const t2 = await probe()
  expect(t2.fillW, 'заливка едет — процесс заполнения виден').toBeGreaterThan(t1.fillW)
  await review.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.shellV2NavBtnActive')).toHaveText('Профиль')
  // Шаг вырос локально: keep всё ещё в «Новых», заливка — три четверти пути
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  const keep = page.locator('.memLvl--1 .memChip', { hasText: 'keep' })
  await expect(keep.locator('.memChipFill')).toHaveAttribute('style', /width: 75%/, { timeout: 30_000 })
})

// Сервер считает «сегодня» пользователя по его поясу (по умолчанию Europe/Moscow,
// user_local_today), поэтому браузер теста — в том же поясе: иначе с 21:00 до 24:00
// UTC серверное «сегодня» на день впереди и перенесённое слово «не к повтору сегодня»
test.describe('перенос памяти в аккаунт', () => {
  test.use({ timezoneId: 'Europe/Moscow' })

  test('вход переносит память гостя в аккаунт', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'перенос в общий аккаунт — один раз, не параллельно')
    await seedMemory(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Профиль', exact: true }).click()
    await page.getByPlaceholder('Email').fill('e2e-guest@pithy.local')
    await page.getByPlaceholder('Пароль', { exact: true }).fill('e2e-local-password')
    await page.locator('.authBtnPrimary').click()
    await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })

    // Память теперь серверная: локальная — очищена (надписи «В памяти N слов» в профиле больше нет)
    await expect(page.locator('.pvKnow')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_guest_memory_v1'))).toBe(null)
    await page.getByRole('button', { name: 'Память', exact: true }).click()
    await expect(page.locator('.lrMain')).toContainText('Сегодня повторяем 1 слово', { timeout: 30_000 })
    await expect(page.locator('.lrGuestLead')).toHaveCount(0)
  })
})

test('лента: слово к повтору дышит после открытия фразы; тап — проверка прямо в переводе; верный ответ растит память', async ({ page }) => {
  test.slow()
  await seedMemory(page)
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  const keep = slide.locator('.fwWord', { hasText: 'Keep' })
  // Фраза закрыта — «Тихо»: ничего не дышит; открыли — дышит только keep (срок сегодня), цвет — «Новые» (небесный)
  await expect(slide.locator('.fwDue')).toHaveCount(0)
  await slide.locator('.phraseBubbleWrap').click()
  await expect(slide.locator('.fwDue')).toHaveText('Keep')
  await expect(keep).toHaveClass(/fwKnown--1/)
  expect(await keep.evaluate(el => getComputedStyle(el).color)).toBe('rgb(79, 179, 238)')
  // Тап: та же линия и плашка, но сначала проверка: подпись и три варианта (верный + два чужих)
  // Метка на самом слайде: после ответа память обновляется, и слайд не должен пересоздаваться (фраза снова закрылась бы шариками,
  // первый тап по слову «пропадал»)
  await slide.locator('.feedSlide').evaluate(el => { el.dataset.probe = '1' })
  await keep.click({ force: true }) // слово к повтору дышит (scale) — Playwright считает его «нестабильным»
  const plate = slide.locator('.wtPlate')
  await expect(plate.locator('.rcCap')).toHaveText('Закрепить знание')
  await expect(plate.locator('.rcOpt')).toHaveCount(3)
  await expect(plate.getByRole('button', { name: 'держать', exact: true })).toBeVisible()
  // Верно: галочка, перевод, чип слова; исход — в память гостя (keep: шаг 2, повтор через 3 дня)
  await plate.getByRole('button', { name: 'держать', exact: true }).click()
  await expect(plate.locator('.rcCheck')).toBeVisible()
  await expect(plate.locator('.rcRow b')).toHaveText('держать')
  await expect(plate.locator('.reviewBar')).toContainText('keep')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_memory_v1')).keep.step)).toBe(2)
  // Плашка сама уходит (≈3 с), слово больше не дышит; повторять больше нечего — точки на «Памяти» нет
  await expect(plate).toHaveCount(0, { timeout: 15_000 })
  await expect(slide.locator('.fwDue')).toHaveCount(0)
  await expect(page.locator('.shellV2NavBtnDue')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.feedSlideWrapActive .feedSlide[data-probe="1"]')).toHaveCount(1) // тот же слайд, фраза открыта
  // Повторный тап по тому же слову — обычный перевод (без проверки)
  await keep.click()
  await expect(slide.locator('.wtPlate')).toHaveText('держать')
  await expect(slide.locator('.rcCap')).toHaveCount(0)
})

test('лента: дневной лимит «дыхания» выбран — слово не дышит, но тап человека всё равно открывает проверку', async ({ page }) => {
  test.slow()
  await seedMemory(page)
  // 3 предложения за сегодня уже были (RECALL_PER_DAY) — сама приманка больше не показывается
  await page.addInitScript(d => localStorage.setItem('pithy_feed_recall_v1', JSON.stringify({ date: d, count: 3 })), today())
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  const keep = slide.locator('.fwWord', { hasText: 'Keep' })
  await expect(keep).toHaveClass(/fwKnown--1/)
  await page.waitForTimeout(600) // дыхание, если бы оно было, уже началось бы
  await expect(slide.locator('.fwDue')).toHaveCount(0)
  await keep.click()
  const plate = slide.locator('.wtPlate')
  await expect(plate.locator('.rcCap')).toHaveText('Закрепить знание')
  await expect(plate.locator('.rcOpt')).toHaveCount(3)
})

test('лента: срок слова настал, пока фраза уже открыта — слово начинает дышать само', async ({ page }) => {
  test.slow()
  // Память гостя: keep повторять только завтра — сегодня фраза «пустая»
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e_guest_seeded')) return
    sessionStorage.setItem('e2e_guest_seeded', '1')
    const next = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 1, due_on: next, last_card_id: null, reviews: 0, lapses: 0 },
    }))
  })
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  await page.waitForTimeout(600)
  await expect(slide.locator('.fwDue')).toHaveCount(0)
  // Срок настал (как «прожить день» или возврат в приложение на другой день): память обновилась, фраза та же и открыта
  await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('pithy_guest_memory_v1'))
    m.keep.due_on = new Date().toLocaleDateString('sv')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify(m))
    window.dispatchEvent(new Event('pithy:memory-changed'))
  })
  await expect(slide.locator('.fwDue')).toHaveText('Keep', { timeout: 15_000 })
  // и тап по нему — проверка, а не обычный перевод
  await slide.locator('.fwWord', { hasText: 'Keep' }).click({ force: true }) // дышит — см. выше
  await expect(slide.locator('.wtPlate .rcCap')).toHaveText('Закрепить знание')
})

test('лента: слово перешло на ступень — место под пометку занято сразу, плашка не прыгает, текст «засело в памяти»', async ({ page }) => {
  test.slow()
  await seedMemory(page, 2) // шаг 2 → верный ответ даёт шаг 3 = «Знакомые»: новая ступень
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  await slide.locator('.fwWord', { hasText: 'Keep' }).click({ force: true })
  const plate = slide.locator('.wtPlate')
  await plate.getByRole('button', { name: 'держать', exact: true }).click()
  // Пометка уже в разметке с ответа (проявится позже, вместе со вспышкой полоски) — место занято, плашка не меняет размер
  const note = plate.locator('.rcNoteUp')
  await expect(note).toHaveText(/слово засело\s*в памяти/)
  // Плашка сама появляется с масштабом (wtPlateIn, 0,75 → 1): замер до конца появления даёт «прыжок» высоты, которого нет
  await plate.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)))
  const before = await plate.boundingBox()
  // Переход ступени — «трубки»: заливка дошла до края, вся трубка поехала влево, справа въехала следующая (две трубки в ряд)
  const rail = plate.locator('.reviewBarRail')
  await expect(rail).toHaveClass(/reviewBarRail--slide/, { timeout: 10_000 })
  await expect(plate.locator('.reviewBar')).toHaveCount(2)
  const mid = await plate.boundingBox()
  expect(Math.abs(mid.width - before.width), 'плашка не раздувается, пока едут трубки').toBeLessThan(1.5)
  expect(Math.abs(mid.height - before.height), 'и не вытягивается').toBeLessThan(1.5)
  const labels = await plate.locator('.reviewBarLevel').allTextContents()
  expect(labels, 'слева прежняя ступень, справа следующая').toEqual(['Новые слова', 'Знакомые слова'])
  // Встала на место прежней: трубка одна, ступень новая, заливка — место слова на ней (шаг 3 = четверть)
  await expect(plate.locator('.reviewBar')).toHaveCount(1, { timeout: 10_000 })
  await expect(plate.locator('.reviewBarLevel')).toHaveText('Знакомые слова')
  await expect(plate.locator('.memChipFill')).toHaveAttribute('style', /width: 25%/)
  const after = await plate.boundingBox()
  expect(Math.abs(after.height - before.height), 'высота плашки не прыгает').toBeLessThan(1.5)
  expect(Math.abs(after.width - before.width), 'ширина плашки не прыгает').toBeLessThan(1.5)
  expect(await note.evaluate(el => getComputedStyle(el).opacity), 'пометка к этому моменту проявилась').toBe('1')
})

test('лента: ошибка в проверке слова — без галочки, «вернёмся завтра», шаг не растёт', async ({ page }) => {
  test.slow()
  await seedMemory(page)
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  await slide.locator('.fwWord', { hasText: 'Keep' }).click({ force: true }) // дышит — см. выше
  const plate = slide.locator('.wtPlate')
  await expect(plate.locator('.rcOpt')).toHaveCount(3)
  // Любой чужой вариант
  await plate.locator('.rcOpt:not(:text-is("держать"))').first().click()
  await expect(plate.locator('.rcNoteBad')).toContainText('вернёмся')
  await expect(plate.locator('.rcCheck')).toHaveCount(0)
  // again: шаг не ниже 1, слово вернётся завтра, ошибка записана
  await expect.poll(() => page.evaluate(() => {
    const k = JSON.parse(localStorage.getItem('pithy_guest_memory_v1')).keep
    return `${k.step}/${k.lapses}`
  })).toBe('1/1')
  await expect(plate).toHaveCount(0, { timeout: 15_000 })
})

test('лента: тап мимо закрывает проверку без штрафа — память не меняется', async ({ page }) => {
  await seedMemory(page)
  await page.goto('/')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  await slide.locator('.phraseBubbleWrap').click()
  await slide.locator('.fwWord', { hasText: 'Keep' }).click({ force: true }) // дышит — см. выше
  await expect(slide.locator('.rcCap')).toBeVisible()
  await page.mouse.click(8, 300) // мимо слова и плашки
  await expect(slide.locator('.wtPlate')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_memory_v1')).keep)).toMatchObject({ step: 1, reviews: 0, lapses: 0 })
  // Слово всё ещё дышит — спросим, когда захочется
  await expect(slide.locator('.fwDue')).toHaveText('Keep')
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
  await expect(nav).toHaveClass(/shellV2NavBtnDue/, { timeout: 30_000 })
  await nav.click()
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Закрепить фразу', { timeout: 30_000 })
  // hold на шаге 3 — ступень «Знакомые слова»
  await expect(page.locator('.memLvl--2 .memChip')).toHaveText(['hold'])
  await main.locator('.lrCta').click()

  const review = page.locator('.reviewScreen')
  const pool = review.locator('.phrasePool')
  await pool.getByRole('button', { name: 'Hold', exact: true }).click({ timeout: 30_000 })
  await pool.getByRole('button', { name: 'on', exact: true }).click()
  await review.getByRole('button', { name: 'Проверить' }).click()
  await expect(review.locator('.reviewVerdict--ok')).toContainText('закреплена', { timeout: 30_000 }) // карточка фразы — последняя: итог придёт сам
  await expect(review.locator('.reviewPhraseResultOk')).toHaveText('✨ Фраза «Hold on» закреплена', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Готово' }).click()

  // Повторять сегодня больше нечего
  await expect(main).toContainText('Памяти пора отдыхать', { timeout: 30_000 })
  await expect(nav).not.toHaveClass(/shellV2NavBtnDue/)
})

test('родное слово на месячной проверке → постоянная память: итог, пятиугольник, фиолетовая страница', async ({ page }) => {
  // keep — родное (шаг 5), месячная проверка — сегодня
  await page.addInitScript(d => {
    if (sessionStorage.getItem('e2e_settle_seeded')) return
    sessionStorage.setItem('e2e_settle_seeded', '1')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 5, due_on: d, last_card_id: null, reviews: 4, lapses: 0 },
    }))
  }, today())
  await page.goto('/')
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(page.locator('.memLvl--3 .memChip')).toHaveText(['keep'], { timeout: 30_000 })
  await page.locator('.lrCta').click()
  const review = page.locator('.reviewScreen')
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await expect(review.locator('.reviewSettled')).toHaveText('✨ «keep» ушло в постоянную память', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Готово' }).click()

  // «Усвоенные» опустели, пятиугольник — 1; его страница — keep
  await expect(page.locator('.memLvl--3 .memLvlCount')).toHaveText('0', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /1 Слово в постоянной памяти/ })).toBeVisible()
  await page.getByRole('button', { name: /Слово в постоянной памяти/ }).click()
  await expect(page.locator('.memTitle')).toHaveText('Четвёртый уровень памяти')
  await expect(page.locator('.memHead')).toContainText('Тут хранятся слова из «Усвоенных»')
  await expect(page.getByRole('tab', { name: /Постоянная/ })).toContainText('1')
  await expect(page.locator('.memChipRow')).toHaveText(['keep'])
})
