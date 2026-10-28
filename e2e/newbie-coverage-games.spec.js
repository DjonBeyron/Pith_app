import { test, expect } from './fixtures.js'
import { learnTab } from './helpers/newbieSteps.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, scrollUntilSheet, expectNoHScroll } from './helpers/newbiePersona.js'
import { soundOn } from './helpers/newbieFeedActions.js'
import { proof, shot, textOf } from './helpers/newbieEvidence.js'

// Доказательный прогон: B1 (вкладка «Память» скрыта и появляется), B4 («Выбери слово»), B6 («Сохранить слово»)
// (PLAN_NEW_USER.md, CHECK_NEW_USER.md п. 1, 4, 5). Игру ленты Пит предлагает через бюджет (20 с, после 3-го слайда), поэтому каждый
// сценарий листает пальцем спокойно, пока не придёт «Я нашёл игру на минутку». Звук включаем сразу — «Послушаем?» не займёт слот.
test.describe.configure({ mode: 'parallel' })
test.use({ viewport: { width: 375, height: 812 } }) // самый узкий телефон из плана (iPhone 12 mini): скриншоты отчёта снимаются в этом размере
test.beforeEach(({ page }) => bootPersona(page))

const OFFER = 'Я нашёл игру на минутку'
const game = page => page.getByRole('group', { name: 'Выбери слово' })
const seedPlate = page => page.getByRole('group', { name: 'Чтобы не забыть слово, сохрани его' })
const memory = page => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_memory_v1') ?? '{}'))

async function toOffer(page, rnd) {
  await openFeed(page)
  await soundOn(page)
  expect(await scrollUntilSheet(page, rnd, OFFER), 'Пит так и не предложил игру').toBe(true)
}

test('[B4] «Не сейчас» на предложении игры — ничего не открывается, лента на месте', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await toOffer(page, makeRng(seedFor(2301)))
  const seen = await textOf(sheet(page))
  await expect(sheet(page).locator('.promptSheetBtn')).toHaveText(['Давай', 'Не сейчас'])
  await shot(page, testInfo, 'B4', 'предложение-игры')
  await expectNoHScroll(page, 'на предложении игры')
  await sheet(page).getByRole('button', { name: 'Не сейчас' }).click()
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  await expect(game(page)).toHaveCount(0)
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible()
  await proof(testInfo, 'B4', `${seen} → «Не сейчас»: шторка ушла, игра не открылась`, { page })
})

test('[B4.wrong] «Давай» → карточка колоды (контекст + «Выбери слово») → промах «Не то — верно: …» → «Дальше»', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await toOffer(page, makeRng(seedFor(2302)))
  await sheet(page).getByRole('button', { name: 'Давай' }).click()
  await expect(game(page)).toBeVisible()
  await expect(game(page)).toContainText('I want to')
  await expectNoHScroll(page, 'на карточке игры')
  await shot(page, testInfo, 'B4.wrong', 'карточка-игры')
  const options = await textOf(game(page))
  await game(page).getByRole('button', { name: 'kip', exact: true }).click({ timeout: 30_000 })
  await expect(game(page).locator('.chooseVerdict')).toContainText('keep')
  const verdict = await textOf(game(page).locator('.chooseVerdict'))
  expect(verdict).toMatch(/Не то|верно: keep/)
  await shot(page, testInfo, 'B4.wrong', 'промах-верно-keep')
  await game(page).getByRole('button', { name: 'Дальше' }).click()
  await expect(game(page)).toHaveCount(0)
  await expect(seedPlate(page), 'после промаха слово сохранять не предлагают').toHaveCount(0)
  await proof(testInfo, 'B4.wrong', `Карточка: ${options}. Выбрал kip → «${verdict}»; плашки «Сохранить слово» нет`, { page })
})

test('[B4, B6, B1] верный ответ → «Сохранить» → слово в памяти, вкладка «Память» появилась и мерцает, «Здесь твои слова не потеряются»', async ({ page }, testInfo) => {
  test.setTimeout(170_000)
  const rnd = makeRng(seedFor(2303))
  await test.step('B1: у новичка вкладок три — «Уроки», «Профиль», «Рейтинг»; «Памяти» нет', async () => {
    await openFeed(page)
    await expect(learnTab(page)).toHaveCount(0)
    for (const name of ['Уроки', 'Профиль', 'Рейтинг']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await shot(page, testInfo, 'B1', 'первый-экран-без-вкладки-Память')
  })
  await soundOn(page)
  expect(await scrollUntilSheet(page, rnd, OFFER)).toBe(true)
  await sheet(page).getByRole('button', { name: 'Давай' }).click()
  await game(page).getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await expect(game(page).locator('.chooseVerdict')).toHaveText('Верно!')
  await shot(page, testInfo, 'B4', 'верно')
  await proof(testInfo, 'B4', 'Карточка колоды «I want to ___ it.» → выбрал keep → «Верно!» → «Дальше»', { page })
  await game(page).getByRole('button', { name: 'Дальше' }).click()

  await test.step('B6: плашка «Чтобы не забыть слово, сохрани его» — без слов «память» и «вкладка»', async () => {
    await expect(seedPlate(page)).toBeVisible({ timeout: 15_000 })
    await expect(seedPlate(page)).toContainText('keep')
    expect(await textOf(seedPlate(page))).not.toMatch(/памят|вкладк/i)
    await expect(seedPlate(page).getByRole('button')).toHaveText(['Сохранить', 'Не сейчас'])
    await expectNoHScroll(page, 'на плашке семени')
    await shot(page, testInfo, 'B6', 'плашка-Сохранить-слово')
    await proof(testInfo, 'B6', await textOf(seedPlate(page)), { page })
    await seedPlate(page).getByRole('button', { name: 'Сохранить' }).click()
    await expect(seedPlate(page)).toHaveCount(0)
    expect((await memory(page)).keep, 'слово записано гостю').toMatchObject({ word: 'keep', step: 1 })
  })

  await test.step('B1: вкладка «Память» появилась, мерцает, над панелью строка Пита на 3 с', async () => {
    await expect(learnTab(page)).toBeVisible()
    await expect(learnTab(page)).toHaveClass(/shellV2NavBtn--blink/)
    await expect(page.locator('.memTabHello')).toHaveText('Здесь твои слова не потеряются')
    await shot(page, testInfo, 'B1', 'Память-мерцает-и-строка-Пита')
    await expect(page.locator('.memTabHello')).toHaveCount(0, { timeout: 6000 }) // строка гаснет через 3 с
    await proof(testInfo, 'B1', 'Вкладка «Память» появилась после сохранения слова, мерцает; над панелью было «Здесь твои слова не потеряются» (3 с)', { page })
  })

  await test.step('B1: перезагрузка — вкладка на месте, мерцание осталось; тап гасит его навсегда', async () => {
    await page.reload()
    await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
    await expect(learnTab(page)).toHaveClass(/shellV2NavBtn--blink/)
    await learnTab(page).click()
    await expect(learnTab(page)).not.toHaveClass(/shellV2NavBtn--blink/)
    expect(await page.evaluate(() => localStorage.getItem('pithy_memory_tab_seen_v1'))).toBe('1')
  })
})

test('[B6.later] «Не сейчас» на плашке — слово не сохраняется, вкладка «Память» не появляется', async ({ page }, testInfo) => {
  test.setTimeout(170_000)
  await toOffer(page, makeRng(seedFor(2304)))
  await sheet(page).getByRole('button', { name: 'Давай' }).click()
  await game(page).getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await game(page).getByRole('button', { name: 'Дальше' }).click()
  await expect(seedPlate(page)).toBeVisible({ timeout: 15_000 })
  await shot(page, testInfo, 'B6.later', 'плашка')
  await seedPlate(page).getByRole('button', { name: 'Не сейчас' }).click()
  await expect(seedPlate(page)).toHaveCount(0)
  expect(await memory(page)).toEqual({})
  await expect(learnTab(page)).toHaveCount(0)
  await proof(testInfo, 'B6.later', 'Плашка «Чтобы не забыть слово, сохрани его» → «Не сейчас»: памяти гостя пусто, вкладки «Память» нет', { page })
})
