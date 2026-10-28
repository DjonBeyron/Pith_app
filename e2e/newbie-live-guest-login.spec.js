import { test, expect } from './fixtures.js'
import { submitLoginForm } from './helpers/login.js'
import { makeRng, seedFor, openFeed, think, fingerSwipe, expectNoHScroll } from './helpers/newbiePersona.js'
import { prepareLiveDevice, liveAccount, liveSkipReason } from './helpers/liveAccounts.js'
import { liveClient, revokeLiveSessions } from './helpers/liveBackend.js'

// Живой сценарий №2 (аккаунт №2): «гость → лайк → вход (перенос)». НАСТОЯЩАЯ база. Человек открывает приложение гостем, ставит сердечко
// (лежит в localStorage, форма входа не лезет), через пару слайдов Пит говорит «сохранит лайки… если создашь аккаунт», тап ведёт к
// входу; после входа гостевой лайк уезжает в module_likes (upsert importGuestSocial), а гостевые ключи чистятся.
// Перед стартом строки module_likes аккаунта удаляются (разрешено RLS: module_likes_write_own), после — убираем и перенесённую,
// чтобы аккаунт остался чистым для следующего прогона. Seed 2502.
const skip = liveSkipReason(2)
test.skip(!!skip, skip ?? '')

test('живой гость: лайк → строка Пита → вход → лайк в module_likes, гостевые ключи очищены', async ({ page }) => {
  test.setTimeout(180_000)
  const acc = liveAccount(2)
  const rnd = makeRng(seedFor(2502))
  await prepareLiveDevice(page, 2)
  const db = await liveClient(acc)

  try {
    await test.step('подготовка: у аккаунта нет лайков, устройство — гость с id e2e-live-2-…', async () => {
      await db.deleteLikes()
      expect(await db.likes()).toEqual([])
      await openFeed(page)
      expect(await page.evaluate(() => localStorage.getItem('pithy_anon_id'))).toMatch(/^e2e-live-2-/)
      expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)))).toEqual([]) // входа нет
    })

    let likedId
    await test.step('гость: сердечко работает сразу, без формы входа', async () => {
      await think(page, rnd, 1200, 2500)
      await page.locator('.feedSlideWrapActive').getByRole('button', { name: /Лайк/ }).click()
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_likes_v1') ?? '[]').length)).toBe(1)
      likedId = await page.evaluate(() => JSON.parse(localStorage.getItem('pithy_guest_likes_v1'))[0]) // id модуля из боевой ленты
      await expect(page.getByPlaceholder('Email')).toBeHidden() // поле входа лежит на скрытой вкладке «Профиль»
    })

    await test.step('через два слайда — строка Пита «сохранит лайки и закладки»; тап ведёт к форме входа', async () => {
      await fingerSwipe(page, 'next', { ms: 300 })
      await think(page, rnd, 1500, 2200)
      await fingerSwipe(page, 'next', { ms: 300 })
      await expect(page.locator('.guestSaveHint')).toContainText('Пит сохранит лайки и закладки', { timeout: 8000 })
      await expectNoHScroll(page, 'со строкой Пита')
      await page.locator('.guestSaveHint').click()
      await expect(page.getByPlaceholder('Email')).toBeVisible()
      await expectNoHScroll(page, 'на форме входа')
    })

    await test.step('вход: гостевой лайк переезжает в аккаунт (module_likes), локальные списки пусты', async () => {
      await submitLoginForm(page, acc.email, acc.password)
      await expect.poll(async () => (await db.likes()).map(l => l.module_id), { timeout: 20_000, message: 'лайк гостя должен оказаться в module_likes' }).toContain(likedId)
      await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_guest_likes_v1'))).toBeNull()
      expect(await page.evaluate(() => localStorage.getItem('pithy_guest_saves_v1'))).toBeNull()
      await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 }) // профиль вошедшего
    })

    await test.step('после возврата в ленту в базе ровно одна строка этого лайка', async () => {
      await page.getByRole('button', { name: 'Уроки', exact: true }).click()
      await expect(page.locator('.feedSlideWrapActive')).toBeVisible()
      expect((await db.likes()).filter(l => l.module_id === likedId)).toHaveLength(1) // ровно одна строка, не дубль
    })
  } finally {
    await db.deleteLikes().catch(() => {}) // за собой убираем: следующий прогон снова начинается без лайков
    await db.close()
    await revokeLiveSessions(acc).catch(() => {}) // токены из трассы артефакта становятся мёртвыми
  }
})
