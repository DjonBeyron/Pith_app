import { test, expect } from './fixtures.js'
import { learnTab } from './helpers/newbieSteps.js'
import { proof } from './helpers/newbieEvidence.js'
import { bootPersona, openFeed, sheet, seedOnce, shiftDays, makeRng, seedFor, think, fingerSwipe, eventsOf, expectNoHScroll } from './helpers/newbiePersona.js'

// Персона «вернулся на второй день» (PLAN_NEW_USER.md → B1, C1, C2, A1): в первой сессии он сохранил слово keep, посмотрел рассказ
// Пита, выбрал «20:00». Здесь localStorage приготовлен ровно так, а часы страницы сдвинуты на сутки вперёд (shiftDays: слово «созрело»).
// Ожидаем: вкладка «Память» на месте с первого кадра и не мерцает; рассказ Пита и «Когда удобно?» не повторяются; бюджет шторок
// новой сессии открыт (это уже 2-я сессия: до 2 шторок, 20 с после входа) — «Послушаем?» появляется; в настройках «Напоминание:
// 20:00». Seed 1303.
test.beforeEach(async ({ page }) => {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv') // как у посеянного слова: «повторить завтра»
  await seedOnce(page, {
    pithy_guest_memory_v1: { keep: { word: 'keep', step: 1, due_on: tomorrow, last_card_id: null, reviews: 0, lapses: 0 } },
    pithy_memory_tab_seen_v1: '1',
    pithy_remind_asked_v1: '1',
    pithy_remind_v1: { hh: 20, mm: 0, enabled: true },
    pithy_prompts_v1: { sessions: 1 }, // первая сессия была; normalizeState достроит остальное
  })
  await shiftDays(page, 1)
  // Следим за вкладкой «Память» с первого кадра: когда она появилась, исчезала ли потом, мигала ли
  await page.addInitScript(() => {
    window.__tab = { seq: [], blink: false }
    const look = () => {
      const el = document.querySelector('[data-nav="learn"]')
      const state = el ? 'in' : 'out'
      if (el?.classList.contains('shellV2NavBtn--blink')) window.__tab.blink = true
      const seq = window.__tab.seq
      if (seq.length ? seq.at(-1) !== state : state === 'in') seq.push(state) // «out» до первого появления не считаем
    }
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  })
  await bootPersona(page, { keepIntro: true })
})

test('[A1.day2, B1.day2] второй день: «Память» без мерцания, рассказ и «Когда удобно» не повторяются, шторки разрешены, «Напоминание: 20:00»', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const rnd = makeRng(seedFor(1303))
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_prompts_v1') ?? 'null'))

  await test.step('вход на следующий день: вкладка «Память» сразу на месте, не мигает, не пропадает', async () => {
    await openFeed(page)
    await expect(learnTab(page)).toBeVisible()
    await expect(learnTab(page)).not.toHaveClass(/shellV2NavBtn--blink/)
    await expect(learnTab(page)).toHaveClass(/shellV2NavBtnDue/, { timeout: 15_000 }) // слово созрело: на вкладке пометка «есть что повторить»
    await think(page, rnd, 2500, 4000)
    const tab = await page.evaluate(() => window.__tab)
    expect(tab.seq, 'вкладка не должна пропадать после появления').toEqual(['in'])
    expect(tab.blink, 'мерцание уже погашено первым нажатием').toBe(false)
    await proof(testInfo, 'B1.day2', 'На следующий день вкладка «Память» на месте с первого кадра, не мигает и не пропадает; на ней пометка «есть что повторить» (слово созрело)', { page })
    expect(await page.evaluate(() => localStorage.getItem('pithy_memory_tab_seen_v1'))).toBe('1')
    await expectNoHScroll(page, 'на втором дне')
  })

  await test.step('слово созрело: в ленте и вкладке нет рассказа Пита и вопроса «Когда удобно»', async () => {
    await expect(page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toHaveCount(0)
    const days = await page.evaluate(() => Math.round((Date.now() - performance.timeOrigin) / 86_400_000))
    expect(days, 'часы страницы ушли на сутки вперёд').toBe(1)
  })

  await test.step('новая сессия: счётчик сессий 2, бюджет открыт — «Послушаем?» показывается после 20 с', async () => {
    expect((await state()).sessions).toBe(2)
    await fingerSwipe(page, 'next', { ms: rnd.int(250, 400) })
    await expect(sheet(page)).toContainText('Эти фразы лучше слышать', { timeout: 45_000 })
    const s = await state()
    expect(s.shownSession.map(x => x.id)).toContain('hint:sound')
    await proof(testInfo, 'A1.day2', `Вторая сессия (sessions = ${s.sessions}): бюджет открыт, через 20 с пришла «${await sheet(page).innerText()}»`.replace(/\n+/g, ' '), { page })
    await sheet(page).getByRole('button', { name: 'Без звука' }).click()
    await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  })

  await test.step('тап по «Памяти»: открывается вкладка, рассказа и вопроса времени нет (оба показаны в первый день)', async () => {
    await learnTab(page).click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toHaveCount(0)
    await expect(page.locator('.lrMain')).toBeVisible()
    await expectNoHScroll(page, 'на вкладке «Память»')
  })

  await test.step('«Профиль» → шестерёнка → «Напоминание: 20:00»', async () => {
    await page.getByRole('button', { name: 'Профиль', exact: true }).click()
    await page.locator('.pvGear').click()
    await expect(page.getByRole('button', { name: /Напоминание: 20:00/ })).toBeVisible()
    await expectNoHScroll(page, 'в настройках')
    const opens = await eventsOf(page, 'app_open')
    expect(opens.length).toBeGreaterThan(0)
  })
})
