import { test, expect } from './fixtures.js'
import { learnTab } from './helpers/newbieSteps.js'
import { makeRng, seedFor, sheet, storyToRemindAsk, expectNoHScroll } from './helpers/newbiePersona.js'
import { prepareLiveDevice, loginLive, liveAccount, liveSkipReason, freshStartKeepingSession, manual } from './helpers/liveAccounts.js'
import { resetLiveAccount, liveClient, ensureMemoryWords, revokeLiveSessions } from './helpers/liveBackend.js'
import { watchCorrectAnswers, answerPaceQuestion, playOfferedGame } from './helpers/liveGame.js'

// Живой сценарий №1 (аккаунт №1 из E2E_USER_EMAILS): «новичок, вошёл до начала» — НАСТОЯЩАЯ база и боевая лента, заглушек сети нет.
// Вход → сброс до новичка → лента → «Память» скрыта → честные 20 с бюджета Пита → вопрос «Кажется, не зацепило…» → игра «Выбери
// слово» → «Сохранить слово» (проверяем строку в word_memory) → «Память» появилась → рассказ Пита → «Когда удобно» → 20:00
// (проверяем user_profiles) → через ~20 с set_level_profile (ear_level не null). Чего боевое наполнение не дало — пишется в attach
// «manual», а не роняет прогон. Что сбрасывается и что нет — helpers/liveBackend.js и TESTING.md. Seed 2501.
const skip = liveSkipReason(1)
test.skip(!!skip, skip ?? '')

test('живой новичок: вход → лента → вопрос Пита → игра → сохранённое слово → «Память» → «Когда удобно» 20:00', async ({ page }) => {
  test.setTimeout(300_000)
  const acc = liveAccount(1)
  const rnd = makeRng(seedFor(2501))
  const sum = { account: 1, anon: null, reset: null, paced: false, game: null, remind: null, level: null }
  await prepareLiveDevice(page, 1)
  const answers = watchCorrectAnswers(page)
  let db = null

  try {
    await test.step('сброс аккаунта до новичка и вход через форму', async () => {
      sum.reset = await resetLiveAccount(acc)
      if (!sum.reset.full) manual('сброс аккаунта', sum.reset.note)
      await loginLive(page, acc)
      db = await liveClient(acc)
      await freshStartKeepingSession(page) // чистый localStorage с живой сессией: флаги знакомств и счётчики Пита — как у пришедшего впервые
      sum.anon = await page.evaluate(() => localStorage.getItem('pithy_anon_id'))
      expect(sum.anon).toMatch(/^e2e-live-1-/)
    })

    const memBefore = (await db.memoryRows()).length
    const earBefore = (await db.profile())?.ear_level ?? null

    await test.step('первый кадр ленты: шторок нет, вкладки «Память» нет (если память пуста)', async () => {
      await expect(page.locator('.feedSlideWrapActive .feedPhrase').first()).toBeVisible()
      await expect(sheet(page)).toHaveCount(0)
      await page.waitForTimeout(2500) // память вошедшего читается из базы: даём ответу прийти, иначе «нет вкладки» было бы просто «ещё не пришло»
      if (memBefore === 0) await expect(learnTab(page)).toHaveCount(0)
      else manual('«Память» скрыта у новичка', `в памяти аккаунта уже ${memBefore} слов (сброс не удался) — скрытие вкладки не проверяется`)
      await expectNoHScroll(page, 'на ленте')
    })

    await test.step('бюджет Пита: 20 с после входа → быстрые пролисты → вопрос «Кажется, не зацепило…» → ответ', async () => {
      sum.paced = await answerPaceQuestion(page, rnd)
      if (!sum.paced) manual('вопрос Пита о темпе', 'вопрос не появился за 3 серии быстрых пролистов (группа без вопросов или бюджет шторок занят)')
    })
    const pacedAt = Date.now()

    await test.step('игра «Выбери слово» → «Сохранить слово» → строка в word_memory', async () => {
      sum.game = await playOfferedGame(page, rnd, answers)
      if (sum.game.status === 'saved') {
        await expect.poll(async () => (await db.memoryRows()).length, { timeout: 20_000, message: 'слово должно появиться в word_memory' }).toBeGreaterThan(memBefore)
        sum.game.rows = (await db.memoryRows()).map(r => r.word)
      } else {
        manual('игра «Выбери слово» и «Сохранить слово»', sum.game.status)
        const seeded = await ensureMemoryWords(acc, memBefore + 1) // запасной путь: слово кладём в память RPC, как это делает «Сохранить»
        manual('слово в памяти вместо игры', `RPC memory_seed_word: добавлено ${seeded.seeded}`)
        await page.goto('/')
        await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
      }
    })

    await test.step('вкладка «Память» появилась (после игры — мигает)', async () => {
      await expect(learnTab(page)).toBeVisible({ timeout: 20_000 })
      if (sum.game.status === 'saved') await expect(learnTab(page)).toHaveClass(/shellV2NavBtn--blink/)
      await expectNoHScroll(page, 'с вкладкой «Память»')
    })

    await test.step('рассказ Пита → «Когда тебе удобно учиться?» → 20:00 → «Готово»', async () => {
      await page.evaluate(() => localStorage.removeItem('pithy_memory_intro_v1')) // фикстура ставит «рассказ виден»; здесь он нужен
      const ask = await storyToRemindAsk(page, { onStory: () => expectNoHScroll(page, 'на рассказе Пита') })
      await ask.getByRole('button', { name: '20:00' }).click()
      await expect(ask.locator('.raConfirm')).toContainText('Готово')
      await expect(ask.locator('.raConfirm')).toContainText('20:00')
      await expectNoHScroll(page, 'на подтверждении времени')
      // Ветка уведомлений зависит от браузера (в Chromium без разрешения — просьба включить); закрываем любой кнопкой «вышел»
      await ask.getByRole('button', { name: /^(Готово|Не сейчас)$/ }).click()
      await expect(ask).toHaveCount(0)
    })

    await test.step('в базе: remind_at 20:00, remind_enabled, next_remind_at (если известен пояс)', async () => {
      await expect.poll(async () => (await db.profile())?.remind_at, { timeout: 15_000 }).toBe('20:00:00')
      const p = await db.profile()
      expect(p.remind_enabled).toBe(true)
      if (p.tz) expect(p.next_remind_at, 'пояс известен — следующий момент пуша посчитан').not.toBeNull()
      else manual('next_remind_at', 'у профиля нет tz — следующий пуш не считается (needs_tz)')
      sum.remind = { at: p.remind_at, enabled: p.remind_enabled, tz: p.tz, next: p.next_remind_at }
    })

    await test.step('через ~20 с после ответа Пита уровень уходит в базу (set_level_profile → ear_level)', async () => {
      if (!sum.paced) return manual('set_level_profile', 'вопрос о темпе не задавали — уровень не менялся')
      const wait = 25_000 - (Date.now() - pacedAt)
      if (wait > 0) await page.waitForTimeout(wait)
      await expect.poll(async () => (await db.profile())?.ear_level ?? null, { timeout: 30_000, intervals: [2000] }).not.toBeNull()
      sum.level = (await db.profile()).ear_level
      if (earBefore !== null) manual('set_level_profile', `ear_level был ${earBefore} ещё до сценария (сброс профиля недоступен) — запись проверена слабо`)
    })
  } finally {
    await db?.close()
    await revokeLiveSessions(acc).catch(() => {}) // токены из трассы артефакта становятся мёртвыми
    await test.info().attach('итоги', { body: JSON.stringify(sum, null, 2), contentType: 'application/json' })
  }
})
