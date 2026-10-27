import { test, expect } from './fixtures.js'
import { learnTab, memoryTabToRemind } from './helpers/newbieSteps.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, think, fingerSwipe, eventsOf, expectNoHScroll } from './helpers/newbiePersona.js'

// Персона «контрольная группа» (PLAN_NEW_USER.md → решение 23, раздел 7): устройство закреплено в группе без «умных» вопросов Пита
// (localStorage.pithy_prompt_group_v1 = control). Что должно НЕ случиться: после трёх быстрых пролистов вопроса Пита нет, шторки про
// звук нет (подсказки интерфейса), предложений игр нет. Что случается у всех: «Память» после первого слова, рассказ Пита, «Когда
// удобно учиться?». Старые задания («Ловля слов», «О чём диалог», старые подсказки ленты) группе разрешены (legacy) — в заглушке
// их нет, поэтому проверяем на уровне журнала: app_open ушёл с group: 'control', все prompt_* — с той же группой, а id запрещённых
// видов среди показанных нет. Журнал читаем из очереди localStorage (на dev-сервере в сеть события не уходят — см. trackEvents).
// Seed 1202.
test.beforeEach(({ page }) => bootPersona(page, { group: 'control' }))

const FORBIDDEN = /^(behavior:|hint:(sound|rub|word|slow)$|choose:|fill:|picture:)/
const NOT_SHOWN = /Кажется, не зацепило|Пит нашёл игру|Эти фразы лучше слышать|Потри фразу|Тапни слово/

// Ни одной «умной» шторки на экране; чужую (старое задание) закрываем и идём дальше, как человек
async function expectNoSmartSheet(page) {
  if (!(await sheet(page).count())) return
  await expect(sheet(page)).not.toContainText(NOT_SHOWN)
  await sheet(page).getByRole('button', { name: 'Закрыть' }).click()
}

test('контрольная группа: ни вопроса Пита, ни игр, ни новых подсказок; «Память» и «Когда удобно» — как у всех', async ({ page }) => {
  test.setTimeout(170_000)
  const rnd = makeRng(seedFor(1202))

  await test.step('вход: группа закреплена за устройством, app_open несёт group: control', async () => {
    await openFeed(page)
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pithy_prompt_group_v1')))).toMatchObject({ group: 'control' })
    const opens = await eventsOf(page, 'app_open')
    expect(opens.length).toBeGreaterThan(0)
    for (const e of opens) expect(e.props.group).toBe('control')
  })

  await test.step('30 секунд без звука: шторки «Послушаем?» нет (подсказки интерфейса скрыты)', async () => {
    await think(page, rnd, 2000, 3500)
    await fingerSwipe(page, 'next', { ms: rnd.int(250, 400) })
    for (let i = 0; i < 5; i++) { // бюджет открывается через 20 с после входа — смотрим дольше, ~30 с
      await think(page, rnd, 5500, 6500)
      await expectNoSmartSheet(page)
    }
    await expectNoHScroll(page, 'у контрольной группы')
  })

  await test.step('включает звук и быстро листает пальцем (флики, паузы меньше 2 с): вопроса Пита нет', async () => {
    await page.locator('.feedSlideWrapActive .feedSoundChip').click()
    for (let i = 0; i < 5; i++) {
      await fingerSwipe(page, 'next', { ms: rnd.int(110, 170) })
      await think(page, rnd, 350, 900)
    }
    await think(page, rnd, 3000, 4000) // у «с вопросами» шторка вышла бы тут же (20 с давно прошли)
    await expect(sheet(page).filter({ hasText: 'Кажется, не зацепило' })).toHaveCount(0)
    await expectNoSmartSheet(page)
  })

  await test.step('спокойно листает дальше: предложений игр нет, ни «Выбери слово», ни «Пит нашёл игру»', async () => {
    for (let i = 0; i < 12; i++) {
      await fingerSwipe(page, rnd.chance(0.2) ? 'prev' : 'next', { ms: rnd.int(220, 420) })
      await think(page, rnd, 2300, 3600)
      await expectNoSmartSheet(page)
      await expect(page.locator('.chooseSheet')).toHaveCount(0)
    }
  })

  await test.step('журнал: показанное — только разрешённое, и везде group: control', async () => {
    const prompts = (await eventsOf(page)).filter(e => e.name.startsWith('prompt_'))
    for (const e of prompts) {
      expect(e.props.group, `${e.name} ${e.props.id}`).toBe('control')
      expect(e.props.id, `запрещённый вид у контрольной группы: ${e.props.id}`).not.toMatch(FORBIDDEN)
    }
  })

  await test.step('первое слово → вкладка «Память» → рассказ Пита → «Когда удобно учиться?» (показывается всем)', async () => {
    await page.evaluate(() => {
      const d = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
      localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 1, due_on: d, last_card_id: null, reviews: 0, lapses: 0 } }))
      localStorage.setItem('pithy_memory_fresh_v1', '1')
      window.dispatchEvent(new Event('pithy:memory-changed'))
      window.dispatchEvent(new Event('pithy:memory-fresh'))
    })
    await expect(learnTab(page)).toBeVisible()
    await memoryTabToRemind(page)
  })
})
