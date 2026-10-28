import { test, expect } from './fixtures.js'
import { SESSION_KEY, fakeSession, rpcCalls } from './helpers/newbieBackend.js'
import { learnTab } from './helpers/newbieSteps.js'
import { bootPersona, openFeed, seedOnce, storyToRemindAsk, expectNoHScroll } from './helpers/newbiePersona.js'
import { fakePush } from './helpers/newbiePush.js'
import { guestMemoryOf } from './helpers/newbieWords.js'
import { proof, shot, textOf } from './helpers/newbieEvidence.js'
import { MEMORY_STORY } from '../src/features/learn/memoryStoryText.js'

// Доказательный прогон: C1 (рассказ Пита о «Памяти»), C2 («Когда удобно учиться?» и все ветки уведомлений), A3 (напоминание уходит в базу),
// PLAN_NEW_USER.md, CHECK_NEW_USER.md п. 6 и 10. Новичок с одним словом keep в памяти (как после «Сохранить»); вошедший — сессия в localStorage,
// RPC в заглушке сети. Push подменяется в странице (helpers/newbiePush.js): настоящего FCM в headless нет.
test.describe.configure({ mode: 'parallel' })
test.use({ viewport: { width: 375, height: 812 } }) // самый узкий телефон из плана (iPhone 12 mini): скриншоты отчёта снимаются в этом размере
// Человек с Android-телефоном (Chrome): стенд newbie по умолчанию притворяется iPhone (devices['iPhone 13']), а у iPhone ветка уведомлений своя
// («Домой», e2e/newbie-persona-iphone.spec.js). Размер экрана остаётся телефонным
test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' })

const session = fakeSession()
const REMIND = { ok: true, next_remind_at: new Date(Date.now() + 86_400_000).toISOString() }
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
const serverWord = [{ word: 'keep', step: 1, due_on: tomorrow, last_reviewed_at: null, last_card_id: null, reviews: 0, lapses: 0, settled_on: null }]
const stub = { session, rpc: { set_prompt_group: 'prompts', set_remind_time: REMIND, save_push_subscription: null }, tables: { word_memory: serverWord } }
const oneWord = { pithy_guest_memory_v1: guestMemoryOf([['keep', 'держать']]) }

// once — рассказ Пита снимаем с флага «уже видел» ТОЛЬКО при первой загрузке вкладки (bootPersona делает это на каждой загрузке и сломал бы проверку «после перезагрузки не повторяется»)
async function asGuest(page, { once = false } = {}) {
  await seedOnce(page, oneWord)
  if (once) await page.addInitScript(() => { try { if (!sessionStorage.getItem('e2e_intro_cleared')) { localStorage.removeItem('pithy_memory_intro_v1'); sessionStorage.setItem('e2e_intro_cleared', '1') } } catch { /* приватный режим */ } })
  const calls = await bootPersona(page, { stub: { session: null }, keepIntro: once })
  await openFeed(page)
  return calls
}
async function asUser(page, push = null) {
  if (push) await fakePush(page, push)
  await seedOnce(page, { [SESSION_KEY]: session }) // слово у вошедшего приходит с сервера (word_memory в заглушке)
  const calls = await bootPersona(page, { stub })
  await openFeed(page)
  return calls
}
const pick = async (ask, hhmm) => { await ask.getByRole('button', { name: hhmm }).click(); await expect(ask.locator('.raConfirm')).toContainText('Готово') }

test('[C1] первое открытие «Памяти» — Пит рассказывает субтитрами сам по таймеру; «Дальше» пропускает; в конце кнопка', async ({ page }, testInfo) => {
  await asGuest(page)
  await learnTab(page).click()
  const story = page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })
  await expect(story).toBeVisible()
  await expectNoHScroll(page, 'на рассказе')
  const now = story.locator('.memStoryLine--now')
  const first = await now.innerText()
  expect(MEMORY_STORY.lines).toContain(first)
  await expect(now).not.toHaveText(first, { timeout: 10_000 }) // строки сменяются сами, без нажатий
  expect(await story.locator('audio').count(), 'озвучки нет (audioUrl: null) — только субтитры').toBe(0)
  const seen = await textOf(story.locator('.memStoryLines'))
  await shot(page, testInfo, 'C1', 'рассказ-субтитры')
  await expect(story.getByRole('button', { name: 'Дальше' })).toBeVisible()
  await story.getByRole('button', { name: 'Дальше' }).click()
  await expect(now).toHaveText(MEMORY_STORY.lines.at(-1))
  await expect(story.getByRole('button', { name: MEMORY_STORY.cta })).toBeVisible()
  await shot(page, testInfo, 'C1', 'кнопка-в-конце')
  await proof(testInfo, 'C1', `Субтитры Пита сами сменились: «${seen}»; «Дальше» → «${MEMORY_STORY.lines.at(-1)}» и кнопка «${MEMORY_STORY.cta}»`, { page })
  await story.getByRole('button', { name: MEMORY_STORY.cta }).click()
  await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toBeVisible()
})

test('[C2.guest] гость — 20:00 → «запомнил время, напомню, когда войдёшь», в базу ничего не уходит', async ({ page }, testInfo) => {
  const calls = await asGuest(page)
  const ask = await storyToRemindAsk(page)
  await expect(ask.getByRole('button')).toHaveText(['9:00', '14:00', '20:00', 'Своё время', 'Не нужно, загляну сам'])
  await expectNoHScroll(page, 'на «Когда удобно?»')
  await shot(page, testInfo, 'C2.guest', 'когда-удобно-учиться')
  await pick(ask, '20:00')
  await expect(ask.locator('.raConfirm')).toContainText('напомню, когда войдёшь в аккаунт')
  expect(rpcCalls(calls, 'set_remind_time')).toHaveLength(0)
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pithy_remind_v1')))).toMatchObject({ hh: 20, mm: 0, enabled: true })
  await proof(testInfo, 'C2.guest', await textOf(ask.locator('.raConfirm')), { page })
})

test('[C2.custom, A3] вошедший — «Своё время» 07:40 → сверка с часами телефона → в базу уходит set_remind_time 07:40', async ({ page }, testInfo) => {
  const calls = await asUser(page)
  const ask = await storyToRemindAsk(page)
  await ask.getByRole('button', { name: 'Своё время' }).click()
  await ask.locator('.raTime').fill('07:40')
  await expect(ask.locator('.raClock')).toContainText(/по твоим часам сейчас \d\d:\d\d/)
  await shot(page, testInfo, 'C2.custom', 'своё-время-и-часы-телефона')
  const clock = await textOf(ask.locator('.raClock'))
  await ask.getByRole('button', { name: 'Сохранить' }).click()
  await expect(ask.locator('.raConfirm')).toContainText('7:40')
  expect(rpcCalls(calls, 'set_remind_time').at(-1).body).toEqual({ p_remind_at: '07:40', p_enabled: true })
  const confirm = await textOf(ask.locator('.raConfirm'))
  await proof(testInfo, 'C2.custom', `Своё время: ${clock}; после «Сохранить»: ${confirm}`, { page })
  await proof(testInfo, 'A3', `RPC set_remind_time(p_remind_at '07:40', p_enabled true); подтверждение: ${confirm}`)
})

test('[C2.none, A3] вошедший — «Не нужно, загляну сам» → set_remind_time выключено, подтверждение «Не буду писать»', async ({ page }, testInfo) => {
  const calls = await asUser(page)
  const ask = await storyToRemindAsk(page)
  await ask.getByRole('button', { name: 'Не нужно, загляну сам' }).click()
  await expect(ask.locator('.raConfirm')).toContainText('Не буду писать')
  expect(rpcCalls(calls, 'set_remind_time').at(-1).body).toEqual({ p_remind_at: null, p_enabled: false })
  await expect(ask.getByRole('button')).toHaveText(['Готово']) // про уведомления не уговаривают
  await proof(testInfo, 'C2.none', await textOf(ask.locator('.raDone')), { page })
})

test('[C2.ask] вошедший, разрешения не просили — «Включить уведомления» по тапу → подписка уходит в базу', async ({ page }, testInfo) => {
  const calls = await asUser(page, 'ask-grant')
  const ask = await storyToRemindAsk(page)
  await pick(ask, '20:00')
  await expect(ask).toContainText('Чтобы напоминание дошло, нужно разрешить уведомления')
  expect(await page.evaluate(() => window.__pushAsked), 'разрешение само не просят — только по тапу').toBe(0)
  const before = await textOf(ask.locator('.raDone'))
  await shot(page, testInfo, 'C2.ask', 'просьба-включить-уведомления')
  await ask.getByRole('button', { name: 'Включить уведомления' }).click()
  await expect(ask).toContainText('Уведомления включены')
  await expect.poll(() => rpcCalls(calls, 'save_push_subscription').length).toBeGreaterThan(0)
  await expect(ask.getByRole('button', { name: 'Готово' })).toBeVisible()
  await proof(testInfo, 'C2.ask', `${before} → тап «Включить уведомления» → «Уведомления включены», подписка сохранена`, { page })
})

test('[C2.denied] отказ от уведомлений — «Хорошо, без уведомлений», уговоров нет', async ({ page }, testInfo) => {
  await asUser(page, 'ask-deny')
  const ask = await storyToRemindAsk(page)
  await pick(ask, '20:00')
  await ask.getByRole('button', { name: 'Включить уведомления' }).click()
  await expect(ask).toContainText('Хорошо, без уведомлений')
  await expect(ask.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0)
  expect(await page.evaluate(() => window.__pushAsked)).toBe(1)
  await expect(ask.getByRole('button')).toHaveText(['Готово'])
  await proof(testInfo, 'C2.denied', await textOf(ask.locator('.raDone')), { page })
})

test('[C2.granted] уведомления уже включены — просьбы нет, одна кнопка «Готово»', async ({ page }, testInfo) => {
  await asUser(page, 'granted')
  const ask = await storyToRemindAsk(page)
  await pick(ask, '20:00')
  await expect(ask).not.toContainText('нужно разрешить уведомления')
  await expect(ask.getByRole('button')).toHaveText(['Готово'])
  await proof(testInfo, 'C2.granted', await textOf(ask.locator('.raDone')), { page })
})

test('[C2.repeat] рассказ и вопрос второй раз не показываются; в настройках «Напоминание: 20:00 · изменить» открывает ту же шторку', async ({ page }, testInfo) => {
  await asGuest(page, { once: true })
  const ask = await storyToRemindAsk(page)
  await pick(ask, '20:00')
  await ask.getByRole('button', { name: 'Готово' }).click()
  await page.reload()
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
  await learnTab(page).click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.locator('.pvGear').click()
  const row = page.getByRole('button', { name: /Напоминание: 20:00/ })
  await expect(row).toContainText('изменить')
  await shot(page, testInfo, 'C2.repeat', 'настройки-Напоминание-20-00')
  const seen = await textOf(row)
  await row.click()
  await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' }).getByRole('button', { name: '20:00' })).toHaveClass(/raOptOn/)
  await proof(testInfo, 'C2.repeat', `После перезагрузки рассказа и вопроса нет; в настройках «${seen}» открывает шторку с отмеченным 20:00`, { page })
})
