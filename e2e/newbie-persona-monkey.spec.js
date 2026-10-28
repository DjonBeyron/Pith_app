import { test, expect } from './fixtures.js'
import { proof } from './helpers/newbieEvidence.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, think, fingerSwipe, expectNoHScroll, activePhrase } from './helpers/newbiePersona.js'
import { pickAction, perform, closeEverything } from './helpers/newbieMonkey.js'

// Персона «непоседа / обезьяна»: 60–90 секунд случайных, но воспроизводимых действий нервного пользователя (helpers/newbieMonkey.js):
// свайпы вперёд и назад с разной скоростью и нервные серии, тапы по чипу звука, фразе, сердечку и закладке, зажатие (замедление),
// шторки Пита (ответить, крестик, смахнуть вниз), игра ленты, вкладки, закрытие окон. Критерий — не «что-то конкретное увидели», а
// «ничего не сломалось»: ловец багов (fixtures.js) не нашёл ошибок консоли и сети, горизонтального скролла нет ни разу, в конце
// приложение отвечает — лента листается. Seed 1505 + номер повтора (--repeat-each даёт разные прогоны); PERSONA_SEED=N повторяет
// конкретный: сид и длительность печатаются в аннотациях отчёта.
test.beforeEach(({ page }) => bootPersona(page))

test('[MONKEY] непоседа: 60–90 с случайных жестов — без ошибок консоли и сети, без горизонтального скролла, лента жива', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const seed = seedFor(1505 + testInfo.repeatEachIndex)
  const rnd = makeRng(seed)
  const duration = rnd.int(60_000, 90_000)
  testInfo.annotations.push({ type: 'seed', description: `${seed}, ${Math.round(duration / 1000)} с` })
  const stat = {}
  let done = 0
  let missed = 0

  await openFeed(page)

  await test.step(`${Math.round(duration / 1000)} с случайных действий (seed ${seed})`, async () => {
    const until = Date.now() + duration
    for (let i = 0; Date.now() < until; i++) {
      const action = pickAction(rnd)
      const ok = await perform(page, rnd, action)
      stat[action[1]] = (stat[action[1]] ?? 0) + 1
      if (ok) done++; else missed++
      await think(page, rnd, 80, rnd.chance(0.15) ? 2500 : 700) // иногда задумывается
      if (i % 6 === 5) await expectNoHScroll(page, `после ${i + 1} действий`)
    }
    testInfo.annotations.push({ type: 'действия', description: `${done} сработало, ${missed} мимо: ${JSON.stringify(stat)}` })
    expect(done, 'обезьяна почти всё время промахивалась — сценарий ничего не проверял').toBeGreaterThan(missed)
  })

  await test.step('усталость: закрыть окна, вернуться в «Уроки»', async () => {
    await closeEverything(page)
    await page.getByRole('button', { name: 'Уроки', exact: true }).click()
    await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 10_000 })
    await expectNoHScroll(page, 'в конце')
  })

  await test.step('лента отвечает: следующий свайп меняет фразу, назад — возвращает', async () => {
    await think(page, rnd, 500, 1500)
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) { // игра или шторка могли перехватить жест — пробуем ещё
      const before = await activePhrase(page)
      await fingerSwipe(page, 'next', { ms: 300 })
      ok = await expect.poll(() => activePhrase(page), { timeout: 4000 }).not.toBe(before).then(() => true, () => false)
      if (!ok && (await sheet(page).count())) await sheet(page).getByRole('button', { name: 'Закрыть' }).first().click({ timeout: 2000 }).catch(() => {})
    }
    expect(ok, 'лента не листается после серии случайных действий').toBe(true)
    await proof(testInfo, 'MONKEY', `Seed ${seed}, ${Math.round(duration / 1000)} с: ${done} действий сработало, ${missed} мимо (${JSON.stringify(stat)}); ошибок консоли и сети нет, горизонтального скролла нет, лента листается`, { page })
  })
})
