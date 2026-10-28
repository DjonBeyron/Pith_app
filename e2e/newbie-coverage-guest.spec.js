import { test, expect } from './fixtures.js'
import { SESSION_KEY, fakeSession, writesTo } from './helpers/newbieBackend.js'
import { bootPersona, openFeed, makeRng, seedFor, think, fingerSwipe, expectNoHScroll } from './helpers/newbiePersona.js'
import { active } from './helpers/newbieFeedActions.js'
import { proof, shot, manual, textOf } from './helpers/newbieEvidence.js'

// Доказательный прогон: B7 — гостевой лайк и закладка (PLAN_NEW_USER.md → B7, решение 14, CHECK_NEW_USER.md п. 7): работают сразу без формы
// входа, переживают перезагрузку, через два слайда Пит один раз мягко предлагает аккаунт, при входе всё переезжает в базу.
test.describe.configure({ mode: 'parallel' })
test.use({ viewport: { width: 375, height: 812 } }) // самый узкий телефон из плана (iPhone 12 mini): скриншоты отчёта снимаются в этом размере
test.beforeEach(({ page }) => bootPersona(page))

const like = page => active(page).locator('.feedHud .feedHudBtn').first() // у сердечка нет подписи — первая кнопка худа
const save = page => active(page).getByRole('button', { name: 'Сохранить в закладки' })
const store = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

test('[B7] гость ставит сердечко и закладку — формы входа нет, иконки горят, после перезагрузки на месте', async ({ page }, testInfo) => {
  const rnd = makeRng(seedFor(2401))
  await openFeed(page)
  await think(page, rnd, 1000, 2000)
  await like(page).click()
  await save(page).click()
  await expect(like(page)).toHaveClass(/feedHudBtnLikeOn/)
  await expect(save(page)).toHaveClass(/feedHudBtnSaveOn/)
  await expect(page.getByPlaceholder('Email')).toBeHidden() // форма входа не выскочила
  expect(await store(page, 'pithy_guest_likes_v1')).toHaveLength(1)
  expect(await store(page, 'pithy_guest_saves_v1')).toHaveLength(1)
  await expectNoHScroll(page, 'после лайка')
  await shot(page, testInfo, 'B7', 'лайк-и-закладка-горят')
  await page.reload()
  await expect(active(page)).toBeVisible({ timeout: 30_000 })
  await expect(like(page)).toHaveClass(/feedHudBtnLikeOn/)
  await expect(save(page)).toHaveClass(/feedHudBtnSaveOn/)
  await proof(testInfo, 'B7', 'Тап по сердечку и закладке: подсветились, формы входа нет, ключи pithy_guest_likes_v1 / pithy_guest_saves_v1 по одному id; после перезагрузки иконки по-прежнему горят', { page })
})

test('[B7.hint] через два слайда после первого лайка — строка Пита на 4 с, один раз на устройстве', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const rnd = makeRng(seedFor(2402))
  await openFeed(page)
  await think(page, rnd, 1000, 2000)
  await like(page).click()
  const hint = page.locator('.guestSaveHint')
  await fingerSwipe(page, 'next', { ms: 300 })
  await think(page, rnd, 1500, 2200)
  await expect(hint, 'после одного слайда строки ещё нет').toHaveCount(0)
  await fingerSwipe(page, 'next', { ms: 300 })
  await expect(hint).toContainText('Пит сохранит лайки и закладки, если создашь аккаунт — это полминуты', { timeout: 6000 })
  const seen = await textOf(hint)
  await expectNoHScroll(page, 'на строке Пита')
  await shot(page, testInfo, 'B7.hint', 'строка-Пита-про-аккаунт')
  await expect(hint).toHaveCount(0, { timeout: 8000 }) // гаснет сама через 4 с
  expect((await store(page, 'pithy_guest_like_hint_v1')).shown).toBe(true)
  // ещё один лайк и ещё два слайда — строка не возвращается
  await like(page).click()
  for (let i = 0; i < 3; i++) { await fingerSwipe(page, 'next', { ms: 300 }); await think(page, rnd, 1500, 2200) }
  await expect(hint).toHaveCount(0)
  await proof(testInfo, 'B7.hint', `${seen} (4 с, погасла сама; повторно не показана)`, { page })
})

test('[B7.transfer] гость входит — лайк и закладка переезжают в аккаунт (module_likes, module_bookmarks), локальные списки пусты', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const rnd = makeRng(seedFor(2403))
  const session = fakeSession()
  const calls = await bootPersona(page, { stub: { session, rpc: { set_prompt_group: 'prompts' } } })
  await openFeed(page)
  await think(page, rnd, 1000, 2000)
  await like(page).click()
  await save(page).click()
  const [likedId] = await store(page, 'pithy_guest_likes_v1')
  const [savedId] = await store(page, 'pithy_guest_saves_v1')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByPlaceholder('Email').fill('newbie@example.test')
  await page.getByPlaceholder('Пароль', { exact: true }).fill('correct-horse')
  await page.locator('.authBtnPrimary').click()
  await expect.poll(() => writesTo(calls, 'module_likes').length, { timeout: 15_000 }).toBeGreaterThan(0)
  await expect.poll(() => writesTo(calls, 'module_bookmarks').length, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(writesTo(calls, 'module_likes')[0].body).toEqual([{ user_id: session.user.id, module_id: likedId }])
  expect(writesTo(calls, 'module_bookmarks')[0].body).toEqual([{ user_id: session.user.id, module_id: savedId }])
  await expect.poll(() => store(page, 'pithy_guest_likes_v1')).toBeNull()
  await expect.poll(() => store(page, 'pithy_guest_saves_v1')).toBeNull()
  expect(await page.evaluate(k => !!localStorage.getItem(k), SESSION_KEY)).toBe(true)
  await proof(testInfo, 'B7.transfer', 'Вход по почте и паролю: upsert одной строки в module_likes и одной в module_bookmarks (on_conflict user_id,module_id), гостевые списки в localStorage очищены', { page })
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[B7.real] перенос в настоящую базу — только руками', async ({}, testInfo) => {
  await manual(testInfo, 'B7.real', 'Здесь вход и база — заглушка сети: проверено, что приложение отправляет верные запросы (тест выше), но не то, что боевая база приняла строки и права (RLS) разрешают гостю-новичку запись. Проверять по CHECK_NEW_USER.md п. 7: чистое устройство, лайк гостем, вход, строка в module_likes, гостевые ключи очищены (не в режиме «новенького»)')
})
