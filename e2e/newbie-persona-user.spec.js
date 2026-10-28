import { test, expect } from './fixtures.js'
import { SESSION_KEY, fakeSession, rpcCalls, writesTo } from './helpers/newbieBackend.js'
import { proof } from './helpers/newbieEvidence.js'
import { bootPersona, openFeed, seedOnce, sheet, makeRng, seedFor, think, fingerSwipe, quickSwipes, storyToRemindAsk, expectNoHScroll } from './helpers/newbiePersona.js'

// Персона «вошедший пользователь» (PLAN_NEW_USER.md → A2, A3, B3, B7, C2, решение 6 «гость получает то же, что вошедший»).
// Вход — настоящий: заглушка отдаёт сессию на /auth/v1/token (форма «Войти») либо сессия лежит в localStorage с самого начала
// (ключ SESSION_KEY, как после прошлого визита). Проверяем, что приложение пишет в базу: RPC set_remind_time, set_prompt_group,
// set_level_profile и перенос гостевых лайков (upsert в module_likes). Seed 1404.
const session = fakeSession()
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
const REMIND = { ok: true, next_remind_at: new Date(Date.now() + 86_400_000).toISOString() }
const stub = {
  session,
  rpc: { set_prompt_group: 'prompts', set_remind_time: REMIND },
  tables: { word_memory: [{ word: 'keep', step: 1, due_on: tomorrow, last_reviewed_at: null, last_card_id: null, reviews: 0, lapses: 0, settled_on: null }] },
}
const levelSaves = calls => rpcCalls(calls, 'set_level_profile')

// Вошедший с прошлого визита: сессия уже в хранилище, в «Памяти» одно слово (с сервера), группа Пита закреплена
async function loggedInUser(page) {
  await seedOnce(page, { [SESSION_KEY]: session })
  return bootPersona(page, { stub })
}

// Спокойно открыть ленту, дождаться вопроса Пита после трёх быстрых пролистов и ответить «Слишком быстро» (двигает уровень)
async function answerPaceQuestion(page, rnd) {
  await openFeed(page)
  await page.locator('.feedSlideWrapActive .feedSoundChip').click() // со звуком: «Послушаем?» не займёт слот Пита
  await think(page, rnd, 18_500, 20_500) // бюджет Пита открывается через 20 с после входа
  await quickSwipes(page, rnd)
  await expect(sheet(page)).toContainText('Кажется, не зацепило', { timeout: 15_000 })
  await sheet(page).getByRole('button', { name: 'Слишком быстро, не успеваю' }).click()
}

test('[B7.transfer] гость ставит сердечко, потом входит прямо в сессии: лайк переезжает в аккаунт, группа Пита уходит в профиль', async ({ page }) => {
  test.setTimeout(120_000)
  const rnd = makeRng(seedFor(1404))
  const calls = await bootPersona(page, { stub })

  await test.step('гость: сердечко работает сразу, без формы входа', async () => {
    await openFeed(page)
    await think(page, rnd, 1200, 2500)
    await page.locator('.feedSlideWrapActive').getByRole('button', { name: /Лайк/ }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_likes_v1') ?? '[]').length)).toBe(1)
    await expect(page.getByPlaceholder('Email')).toBeHidden() // форма входа не выскочила (поле лежит на скрытой вкладке «Профиль»)
  })

  await test.step('через два слайда — строка Пита «сохранит лайки… если создашь аккаунт»; тап ведёт к входу', async () => {
    await fingerSwipe(page, 'next', { ms: 300 })
    await think(page, rnd, 1500, 2200)
    await fingerSwipe(page, 'next', { ms: 300 })
    await expect(page.locator('.guestSaveHint')).toContainText('Сохраню лайки и закладки', { timeout: 6000 })
    await page.locator('.guestSaveHint').click()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expectNoHScroll(page, 'на форме входа')
  })

  await test.step('вход по почте и паролю: гостевой лайк уходит в module_likes одним upsert, локальный список пуст', async () => {
    const likedId = await page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_likes_v1'))[0])
    await page.getByPlaceholder('Email').fill('newbie@example.test')
    await page.getByPlaceholder('Пароль', { exact: true }).fill('correct-horse')
    await page.locator('.authBtnPrimary').click()
    await expect.poll(() => writesTo(calls, 'module_likes').length, { timeout: 15_000 }).toBeGreaterThan(0)
    const post = writesTo(calls, 'module_likes')[0]
    expect(post.method).toBe('POST')
    expect(post.body).toEqual([{ user_id: session.user.id, module_id: likedId }])
    expect(post.query).toContain('on_conflict=user_id,module_id')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_guest_likes_v1'))).toBeNull()
    await expect.poll(() => rpcCalls(calls, 'set_prompt_group').length).toBeGreaterThan(0)
    expect(rpcCalls(calls, 'set_prompt_group')[0].body).toEqual({ p_group: 'prompts' })
  })
})

test('[A3, A2.server] вошедший: «Когда удобно» → set_remind_time 20:00; быстрые пролисты → вопрос Пита → set_level_profile через 20 с', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const rnd = makeRng(seedFor(1405))
  const calls = await loggedInUser(page)

  await test.step('вошёл: группа ушла в профиль, слово с сервера открыло вкладку «Память»', async () => {
    await openFeed(page)
    await expect(page.locator('[data-nav="learn"]')).toBeVisible()
    await expect.poll(() => rpcCalls(calls, 'set_prompt_group').length).toBeGreaterThan(0)
    expect(rpcCalls(calls, 'set_prompt_group')[0].body).toEqual({ p_group: 'prompts' })
  })

  await test.step('рассказ Пита → «Когда удобно учиться?» → 20:00 → в базу уходит set_remind_time', async () => {
    const ask = await storyToRemindAsk(page)
    await ask.getByRole('button', { name: '20:00' }).click()
    await expect(ask.locator('.raConfirm')).toContainText('Готово')
    await expect(ask.locator('.raConfirm')).toContainText('20:00')
    expect(rpcCalls(calls, 'set_remind_time').at(-1).body).toEqual({ p_remind_at: '20:00', p_enabled: true })
    await expectNoHScroll(page, 'на подтверждении времени')
    // Ветка уведомлений зависит от браузера (в Chromium без разрешения — просьба включить); закрываем любой кнопкой «вышел»
    await ask.getByRole('button', { name: /^(Готово|Не сейчас)$/ }).click()
    await expect(ask).toHaveCount(0)
  })

  await test.step('«Уроки» → три быстрых пролиста → вопрос Пита → ответ «Слишком быстро»', async () => {
    await page.getByRole('button', { name: 'Уроки', exact: true }).click()
    await page.waitForTimeout(1500)
    await quickSwipes(page, rnd)
    await expect(sheet(page)).toContainText('Кажется, не зацепило', { timeout: 40_000 })
    await sheet(page).getByRole('button', { name: 'Слишком быстро, не успеваю' }).click()
  })

  await test.step('уровень уходит на сервер не сразу, а через ~20 с (set_level_profile с числами обеих осей)', async () => {
    expect(levelSaves(calls)).toHaveLength(0)
    await expect.poll(() => levelSaves(calls).length, { timeout: 30_000, intervals: [1000] }).toBeGreaterThan(0)
    const b = levelSaves(calls)[0].body
    for (const k of ['p_ear', 'p_ear_sigma', 'p_vocab', 'p_vocab_sigma']) expect(typeof b[k], k).toBe('number')
    await proof(testInfo, 'A2.server', `Ответ «Слишком быстро» → через ~20 с RPC set_level_profile: слух ${b.p_ear.toFixed(2)} ±${b.p_ear_sigma.toFixed(2)}, словарь ${b.p_vocab.toFixed(2)} ±${b.p_vocab_sigma.toFixed(2)}`, { page })
  })
})

test('[A2.server] вошедший: ответ Пита и сворачивание страницы (pagehide) сразу отправляют уровень, не дожидаясь 20 с', async ({ page }) => {
  test.setTimeout(100_000)
  const rnd = makeRng(seedFor(1406))
  const calls = await loggedInUser(page)
  await answerPaceQuestion(page, rnd)
  const before = levelSaves(calls).length
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect.poll(() => levelSaves(calls).length, { timeout: 3000 }).toBeGreaterThan(before)
})
