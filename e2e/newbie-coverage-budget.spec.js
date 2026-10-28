import { test, expect } from './fixtures.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, think, fingerSwipe, quickSwipes, eventsOf, expectNoHScroll } from './helpers/newbiePersona.js'
import { proof, shot, textOf } from './helpers/newbieEvidence.js'

// Доказательный прогон: A1 (бюджет Пита), A2 (оценка уровня), B3 (вопрос по поведению) — PLAN_NEW_USER.md, CHECK_NEW_USER.md п. 1, 3.
// Каждый сценарий — человек с телефоном 390 px: честное время (часы не подменяем), настоящие касания, в конце proof() кладёт в отчёт
// то, что он увидел. Видео и трасса включены для всего проекта newbie (playwright.config.js). Seed 2101 + номер (PERSONA_SEED переопределяет).
test.describe.configure({ mode: 'parallel' }) // сценарии независимы (у каждого свой контекст и хранилище) — по воркерам
test.beforeEach(({ page }) => bootPersona(page))

const PACE = 'Кажется, не зацепило'
const levelOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_level_v1') ?? 'null'))

// До вопроса Пита по поведению: со звуком (чтобы «Послушаем?» не занял слот), ждём 20 с бюджета, три быстрых пролиста пальцем
async function toPaceQuestion(page, rnd) {
  await openFeed(page)
  await page.locator('.feedSlideWrapActive .feedSoundChip').click()
  await think(page, rnd, 19_000, 20_500)
  await quickSwipes(page, rnd, 4)
  await expect(sheet(page)).toContainText(PACE, { timeout: 15_000 })
}

test('[A1] бюджет Пита — не раньше 20 с, по одной шторке, крестик, не чаще 1 на 5 слайдов, ≤2 за сессию', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const rnd = makeRng(seedFor(2101))
  const t0 = Date.now()

  await test.step('A1: открыл ленту — 12 секунд тишина (подсказка про звук готова с 8 с, но бюджет молчит до 20 с)', async () => {
    await openFeed(page)
    await think(page, rnd, 11_500, 12_500)
    await expect(sheet(page)).toHaveCount(0)
    await shot(page, testInfo, 'A1', 'до-20-с-шторок-нет')
  })

  let first = ''
  let firstAfterS = 0
  await test.step('A1: после 20 с приходит ровно одна шторка Пита, на ней всегда есть крестик', async () => {
    await expect(sheet(page)).toHaveCount(1, { timeout: 25_000 })
    const elapsed = Date.now() - t0
    expect(elapsed, `шторка пришла через ${elapsed} мс после входа — раньше 20 с нельзя`).toBeGreaterThanOrEqual(19_000)
    first = await textOf(sheet(page))
    firstAfterS = Math.round(elapsed / 1000)
    await expect(sheet(page).getByRole('button', { name: 'Закрыть' })).toBeVisible()
    await expectNoHScroll(page, 'на шторке бюджета')
    await shot(page, testInfo, 'A1', 'первая-шторка-после-20-с')
  })

  await test.step('A1: закрыл крестиком — следующие 4 слайда шторок нет (не чаще 1 на 5 слайдов)', async () => {
    await sheet(page).getByRole('button', { name: 'Закрыть' }).click()
    await expect(sheet(page)).toHaveCount(0)
    for (let i = 0; i < 4; i++) {
      await fingerSwipe(page, 'next', { ms: rnd.int(240, 420) })
      await think(page, rnd, 2300, 3200)
      await expect(sheet(page), `слайд ${i + 1} после шторки`).toHaveCount(0)
    }
  })

  await test.step('A1: дальше листает спокойно — за всю сессию показов не больше двух, между ними ≥5 слайдов', async () => {
    for (let i = 0; i < 10; i++) {
      await fingerSwipe(page, 'next', { ms: rnd.int(240, 420) })
      await think(page, rnd, 2300, 3200)
      if (await sheet(page).count()) await sheet(page).getByRole('button', { name: 'Закрыть' }).click()
    }
    const log = (await eventsOf(page)).filter(e => e.name === 'prompt_shown' || (e.name === 'feed_swipe' && e.props?.dir !== 'prev'))
    const shown = log.filter(e => e.name === 'prompt_shown')
    expect(shown.length, 'в первые три сессии — не больше 2 шторок за сессию').toBeLessThanOrEqual(2)
    const gaps = []
    let swipes = 0
    for (const e of log) { if (e.name === 'prompt_shown') { gaps.push(swipes); swipes = 0 } else swipes++ }
    for (const g of gaps.slice(1)) expect(g, `слайдов между шторками: ${gaps}`).toBeGreaterThanOrEqual(5)
    await proof(testInfo, 'A1', `Первая шторка через ${firstAfterS} с после входа: «${first}». Показов за сессию: ${shown.length} (лимит 2).`, { page, shown: shown.map(e => e.props?.id) })
  })
})

test('[A2] «Слишком просто» — гостевой уровень слуха уходит вверх, ключ pithy_level_v1', async ({ page }, testInfo) => {
  test.setTimeout(100_000)
  const rnd = makeRng(seedFor(2102))
  await toPaceQuestion(page, rnd)
  const before = await levelOf(page)
  await shot(page, testInfo, 'A2', 'вопрос-Пита')
  await sheet(page).getByRole('button', { name: 'Слишком просто, хочется сложнее' }).click()
  await expect.poll(async () => (await levelOf(page))?.ear.n ?? 0, { timeout: 8000 }).toBeGreaterThan(before?.ear.n ?? 0)
  const after = await levelOf(page)
  expect(after.ear.level, 'слишком просто = слух выше').toBeGreaterThan(before?.ear.level ?? 0.5)
  await proof(testInfo, 'A2', `Ответ «Слишком просто»: слух ${(before?.ear.level ?? 0.5).toFixed(2)} → ${after.ear.level.toFixed(2)} (неуверенность ${after.ear.sigma.toFixed(2)}), словарь ${after.vocab.level.toFixed(2)}`, { page, before, after })
})

test('[A2] «Слишком быстро» — гостевой уровень слуха уходит вниз', async ({ page }, testInfo) => {
  test.setTimeout(100_000)
  const rnd = makeRng(seedFor(2103))
  await toPaceQuestion(page, rnd)
  const before = await levelOf(page)
  await sheet(page).getByRole('button', { name: 'Слишком быстро, не успеваю' }).click()
  await expect.poll(async () => (await levelOf(page))?.ear.n ?? 0, { timeout: 8000 }).toBeGreaterThan(before?.ear.n ?? 0)
  const after = await levelOf(page)
  expect(after.ear.level, 'слишком быстро = слух ниже').toBeLessThan(before?.ear.level ?? 0.5)
  await proof(testInfo, 'A2', `Ответ «Слишком быстро»: слух ${(before?.ear.level ?? 0.5).toFixed(2)} → ${after.ear.level.toFixed(2)}`, { page, before, after })
})

test('[B3] вопрос по поведению — три ответа, реплика Пита на 3 секунды, повторно за сессию не спрашивает', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const rnd = makeRng(seedFor(2104))
  await toPaceQuestion(page, rnd)
  let seen = ''

  await test.step('B3: «Кажется, не зацепило…» — три ответа и крестик', async () => {
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveText(['Слишком быстро, не успеваю', 'Слишком просто, хочется сложнее', 'Всё хорошо, просто смотрю'])
    await expect(sheet(page).getByRole('button', { name: 'Закрыть' })).toBeVisible()
    seen = await textOf(sheet(page))
    await shot(page, testInfo, 'B3', 'вопрос-три-ответа')
  })
  await test.step('B3: ответ «Всё хорошо» → реплика Пита вместо кнопок → шторка уходит сама', async () => {
    await sheet(page).getByRole('button', { name: 'Всё хорошо, просто смотрю' }).click()
    await expect(sheet(page)).toContainText('Хорошо, смотри дальше')
    await expect(sheet(page).locator('.promptSheetBtn')).toHaveCount(0)
    seen += ' → ' + (await textOf(sheet(page)))
    await shot(page, testInfo, 'B3', 'реплика-Пита')
    await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  })
  await test.step('B3: ещё быстрые пролисты — вопрос в этой сессии не повторяется', async () => {
    await quickSwipes(page, rnd, 6)
    await think(page, rnd, 1500, 2500)
    await expect(sheet(page).filter({ hasText: PACE })).toHaveCount(0)
    const answers = (await eventsOf(page, 'prompt_answer')).filter(e => e.props?.id === 'behavior:pace')
    expect(answers.map(e => e.props.answer)).toEqual(['fine'])
  })
  await proof(testInfo, 'B3', seen, { page })
})
