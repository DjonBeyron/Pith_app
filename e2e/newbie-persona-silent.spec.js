import { test, expect } from './fixtures.js'
import { proof } from './helpers/newbieEvidence.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, think, fingerSwipe, scrollUntilSheet, eventsOf, expectNoHScroll, activePhrase } from './helpers/newbiePersona.js'

// Персона «тихий гость без звука» (PLAN_NEW_USER.md → B2, решение 6, B4, B6): человек в метро или на работе, звук не включает ни разу.
// Листает пальцем спокойно, читает текст. Что должно произойти: через ~20 с (подсказка про звук ждёт 8 с на слайде, но бюджет Пита
// не показывает шторки раньше 20 с после входа) — «Послушаем?» → «Без звука» → реплика «…текст под видео»; значок сложности
// скрыт всё это время (его проявляет только первое прослушивание со звуком); игра «Выбери слово» по предложению Пита открывается
// беззвучной, текстом; «Сохранить слово» кладёт слово в память гостя. Seed 1101 (PERSONA_SEED переопределяет).
test.beforeEach(({ page }) => bootPersona(page))

const diffClass = page => page.locator('.feedSlideWrapActive .diffWrap').first().getAttribute('class')

test('[B2.sound, B4.silent] тихий гость: «Без звука» → текст под видео → беззвучная игра → «Сохранить слово»', async ({ page }, testInfo) => {
  test.setTimeout(170_000)
  const rnd = makeRng(seedFor(1101))

  await test.step('первый слайд: звук не включаем, значок сложности скрыт, шторок нет', async () => {
    await openFeed(page)
    await expect(page.locator('.feedSlideWrapActive .feedSoundChip')).toBeVisible()
    expect(await diffClass(page)).toContain('diffHidden')
    await expect(sheet(page)).toHaveCount(0)
    await expectNoHScroll(page, 'на первом слайде')
  })

  await test.step('читает: два спокойных свайпа пальцем, дальше задерживается на слайде', async () => {
    await think(page, rnd, 1500, 3000)
    const first = await activePhrase(page)
    await fingerSwipe(page, 'next', { ms: rnd.int(250, 450) })
    await expect.poll(() => activePhrase(page)).not.toBe(first) // палец листает по-настоящему
    await think(page, rnd, 2500, 4500)
    await fingerSwipe(page, 'prev', { ms: rnd.int(250, 450) }) // вернулся перечитать
    await expect.poll(() => activePhrase(page)).toBe(first)
    await think(page, rnd, 1500, 2500)
    expect(await diffClass(page)).toContain('diffHidden') // без прослушивания значок не проявляется
    await expect(sheet(page)).toHaveCount(0) // раньше 20 с шторок нет
  })

  await test.step('«Послушаем?»: шторка с двумя ответами, крестиком и без «Спроси позже»', async () => {
    await expect(sheet(page)).toContainText('Эти фразы лучше слышать', { timeout: 40_000 })
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveText(['Послушаем?', 'Без звука'])
    await expect(sheet(page).getByRole('button', { name: 'Закрыть' })).toBeVisible()
    await expectNoHScroll(page, 'на шторке «Послушаем?»')
  })

  await test.step('«Без звука» → реплика Пита «…текст под видео» на 3 секунды → шторка уходит', async () => {
    await think(page, rnd, 600, 1500)
    await sheet(page).getByRole('button', { name: 'Без звука' }).click()
    await expect(sheet(page)).toContainText('можно и без звука, текст под видео')
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveCount(0)
    await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
    // звук так и не включён: чип на месте, флага нет, значок сложности скрыт
    await expect(page.locator('.feedSlideWrapActive .feedSoundChip')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('pithy_sound_v1'))).not.toBe('1')
    expect(await diffClass(page)).toContain('diffHidden')
    const shown = await eventsOf(page, 'prompt_answer')
    expect(shown.some(e => e.props?.id === 'hint:sound' && e.props?.answer === 'later')).toBe(true)
  })

  await test.step('Пит предлагает игру: «Давай» → «Выбери слово» открыта текстом, без звука', async () => {
    expect(await scrollUntilSheet(page, rnd, 'Пит нашёл игру на минутку')).toBe(true)
    await sheet(page).getByRole('button', { name: 'Давай' }).click()
    const game = page.getByRole('group', { name: 'Выбери слово' })
    await expect(game).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.chooseSheet--text')).toBeVisible() // текстовая версия: плеер играет беззвучно
    await expect(page.locator('.feedSlideWrapActive .feedSoundChip')).toBeVisible() // и звук ленты не включился
    await expectNoHScroll(page, 'на игре')
    await proof(testInfo, 'B4.silent', 'Без звука «Выбери слово» открыта текстовой версией (chooseSheet--text), звук ленты не включился, значок сложности по-прежнему скрыт', { page })
    await think(page, rnd, 700, 1800)
    await game.getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
    await expect(game.locator('.chooseVerdict')).toHaveText('Верно!')
    await game.getByRole('button', { name: 'Дальше' }).click()
    await expect(game).toHaveCount(0)
  })

  await test.step('«Сохранить слово» работает: слово в памяти гостя, значок всё ещё скрыт', async () => {
    const seed = page.getByRole('group', { name: 'Чтобы не забыть слово, сохрани его' })
    await expect(seed).toBeVisible({ timeout: 15_000 })
    await expectNoHScroll(page, 'на плашке «Сохранить слово»')
    await seed.getByRole('button', { name: 'Сохранить' }).click()
    await expect(seed).toHaveCount(0)
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pithy_guest_memory_v1')))).toHaveProperty('keep.step', 1)
    expect(await diffClass(page)).toContain('diffHidden')
  })
})
