import { test, expect } from './fixtures.js'
import { curricula } from './helpers/newbieBackend.js'
import { bootPersona, openFeed, sheet, shiftDays, fingerSwipe, eventsOf, activePhrase, expectNoHScroll } from './helpers/newbiePersona.js'
import { soundOn, active, rubPhrase } from './helpers/newbieFeedActions.js'
import { proof, shot } from './helpers/newbieEvidence.js'

// Доказательный прогон: F1 — «лесенка» из 5 слайдов на втором визите (PLAN_NEW_USER.md → решение 18, CHECK_NEW_USER.md п. 12).
// Лесенка невидима: лента на втором визите начинается с пяти фраз по нарастанию сложности (1, 1, 2, 2, 3), а по тому, где человек
// стал замедляться, открывать фразу/перевод или быстро листать, модель уровня получает измерение «уха» (событие feed_ladder).
// Сложность фраз — от админа (curricula.difficulty_admin): голосов у молодого приложения почти нет. Порядок админа нарочно «в перемешку».
// Сценарий идёт насквозь: визит 1 (лесенки нет, пишется firstDay) → часы страницы на сутки вперёд → визит 2 (счётчик визитов 2).
test.use({ viewport: { width: 375, height: 812 } })

// Строки curricula в порядке админа: токен easy/mid/hard/none в названии выдаёт сложность на экране (none — сложность не задана)
const SPEC = [['hard', 3], ['mid', 2], ['easy', 1], ['mid', 2], ['easy', 1], ['none', null], ['easy', 1], ['mid', 2], ['hard', 3], ['easy', 1], ['mid', 2], ['none', null]]
const rows = SPEC.map(([kind, d], i) => ({ ...curricula[i], lesson_ids: [], title: `Ladder ${kind} ${i}`, difficulty: null, difficulty_votes: 0, difficulty_admin: d }))
const kindOf = text => /ladder (easy|mid|hard|none)/i.exec(text)?.[1].toLowerCase()

test.beforeEach(({ page }) => bootPersona(page, { stub: { tables: { curricula: rows } } }))

const ls = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key)
// Если вылезла шторка Пита (бюджет открывается через 20 с) — закрываем крестиком, как человек: она не должна мешать листать
async function closeSheet(page) {
  if (await sheet(page).count()) await sheet(page).getByRole('button', { name: 'Закрыть' }).click().catch(() => null)
}
// Открыть фразу из-под шариков тапом по координатам: после свайпов проверка «виден ли элемент» у Playwright на слайдах Swiper
// сбоит («outside of the viewport»), хотя шарики на экране; человек просто тапает по ним
async function tapPhrase(page) {
  const box = await active(page).locator('.phraseBubbleWrap').boundingBox({ timeout: 5000 })
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(900)
}
// Смотрит слайд n секунд и листает дальше пальцем
async function dwellThenNext(page, ms) {
  await page.waitForTimeout(ms)
  await closeSheet(page)
  await fingerSwipe(page, 'next', { ms: 220 })
  await page.waitForTimeout(700) // дать слайду доехать: тап по движущемуся слайду попадает в предыдущий
}

test('[F1.first] первый визит: лесенки нет — порядок админа, firstDay записан', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await openFeed(page)
  const first = await activePhrase(page)
  expect(kindOf(first), 'первая фраза — строка 0 админа (hard), а не лёгкая из лесенки').toBe('hard')
  const rec = await ls(page, 'pithy_ladder_v1')
  expect(rec).toMatchObject({ done: false, shownDay: '', ids: [] })
  expect(rec.firstDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(await eventsOf(page, 'feed_ladder')).toHaveLength(0)
  await proof(testInfo, 'F1.first', `Первый визит: лента начинается с «${first}» (порядок админа), в Local Storage pithy_ladder_v1 записан firstDay = ${rec.firstDay}, лесенки нет`, { page })
})

test('[F1] второй визит: первые пять слайдов идут 1,1,2,2,3; итог feed_ladder двигает уровень', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  // --- визит 1: просто открыли (счётчик визитов 1, firstDay = сегодня) и закрыли
  await openFeed(page)
  const day1 = await ls(page, 'pithy_ladder_v1')
  expect((await ls(page, 'pithy_prompts_v1')).sessions).toBe(1)
  const levelBefore = await ls(page, 'pithy_level_v1')

  // --- визит 2: на следующий день (часы страницы на сутки вперёд; init-скрипт подействует на ближайшую загрузку)
  await shiftDays(page, 1)
  await page.reload()
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  expect((await ls(page, 'pithy_prompts_v1')).sessions, 'это второй визит').toBe(2)

  await soundOn(page) // со звуком фраза доступна для открытия (в беззвучном режиме её закрывает чип «Включить звук»)
  const order = []
  // Слайд 1 (лёгкая) и 2 (лёгкая): смотрит спокойно, дольше 8 с
  order.push(kindOf(await activePhrase(page)))
  await dwellThenNext(page, 9000)
  order.push(kindOf(await activePhrase(page)))
  await dwellThenNext(page, 9000)
  // Слайд 3 (средняя): открыл фразу из-под шариков и ушёл быстро — признак трудности
  order.push(kindOf(await activePhrase(page)))
  await closeSheet(page)
  await tapPhrase(page)
  await shot(page, testInfo, 'F1', 'ladder-средняя-фраза-открыта')
  await dwellThenNext(page, 300)
  // Слайд 4 (средняя): открыл фразу и потёр перевод — тоже трудно
  order.push(kindOf(await activePhrase(page)))
  await closeSheet(page)
  await tapPhrase(page)
  await rubPhrase(page)
  await dwellThenNext(page, 300)
  // Слайд 5 (сложная): смотрит 3 с, без действий — не «спокойно» (меньше 8 с) и не «трудно»
  order.push(kindOf(await activePhrase(page)))
  expect(order, 'порядок первых пяти слайдов: лёгкая, лёгкая, средняя, средняя, сложная').toEqual(['easy', 'easy', 'mid', 'mid', 'hard'])
  await expectNoHScroll(page, 'на лесенке')
  await dwellThenNext(page, 3000)

  // Итог: одно событие feed_ladder с потолком 1 (спокойно только на лёгких) и трудностью с сложности 2
  await expect.poll(async () => (await eventsOf(page, 'feed_ladder')).length, { timeout: 10_000 }).toBe(1)
  const [ev] = await eventsOf(page, 'feed_ladder')
  expect(ev.props).toMatchObject({ top: 1, hard: 2 })
  expect(ev.props.steps).toMatch(/^1:\d{4,5}:0,1:\d{4,5}:0,2:\d+:1,2:\d+:1,3:\d+:0$/)

  // Лесенка пройдена: запись закрыта, фразы и день сохранены
  const rec = await ls(page, 'pithy_ladder_v1')
  expect(rec).toMatchObject({ firstDay: day1.firstDay, done: true, tries: 1 })
  expect(rec.ids).toHaveLength(5)
  expect(rec.shownDay).not.toBe(day1.firstDay)

  // Модель уровня получила измерение «уха»: наблюдений больше, уровень ниже (трудно уже на средних)
  const levelAfter = await ls(page, 'pithy_level_v1')
  expect(levelAfter.ear.n).toBeGreaterThan(levelBefore?.ear?.n ?? 0)
  expect(levelAfter.ear.level).toBeLessThan(levelBefore?.ear?.level ?? 0.5)
  expect(levelAfter.ear.sigma).toBeLessThan(levelBefore?.ear?.sigma ?? 0.35)
  expect(levelAfter.vocab.n, 'словарь лесенка не трогает').toBe(levelBefore?.vocab?.n ?? 0)
  await shot(page, testInfo, 'F1', 'ladder-итог')
  await proof(testInfo, 'F1', `Второй визит: порядок слайдов ${order.join(', ')}; feed_ladder ${ev.props.steps} (потолок ${ev.props.top}, трудно с ${ev.props.hard}); pithy_level_v1.ear: уровень ${levelBefore?.ear?.level ?? 0.5} → ${levelAfter.ear.level.toFixed(2)}, наблюдений ${levelAfter.ear.n}`, { page })
})

test('[F1.reload] перезагрузка в тот же день до конца лесенки: те же пять фраз', async ({ page }) => {
  test.setTimeout(90_000)
  await openFeed(page)
  await shiftDays(page, 1)
  await page.reload()
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  const ids = (await ls(page, 'pithy_ladder_v1')).ids
  expect(ids).toHaveLength(5)
  const first = await activePhrase(page)
  await page.reload() // всё ещё второй день (init-скрипт сдвига остаётся), лесенка не пройдена — прежние фразы
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  expect((await ls(page, 'pithy_ladder_v1')).ids).toEqual(ids)
  expect(await activePhrase(page)).toBe(first)
})
