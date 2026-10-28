import { test, expect } from './fixtures.js'
import { learnTab } from './helpers/newbieSteps.js'
import { seedOnce, openFeed, makeRng, seedFor, think, expectNoHScroll } from './helpers/newbiePersona.js'
import { prepareLiveDevice, loginLive, liveAccount, liveSkipReason, manual } from './helpers/liveAccounts.js'
import { ensureMemoryWords, setRemind, revokeLiveSessions } from './helpers/liveBackend.js'

// Живой сценарий №3 (аккаунт №3): «второй день / повторный визит». НАСТОЯЩАЯ база. В аккаунте уже есть сохранённые слова (с прошлых
// прогонов или сид: RPC memory_seed_word) и выбрано напоминание 20:00; на устройстве — флаги «первый день уже был» (вкладка «Память»
// нажата, рассказ Пита показан, «Когда удобно» спрошено, одна сессия позади). Ожидаем: «Память» на месте с первого кадра и не мигает,
// рассказ и вопрос времени не повторяются, в настройках «Напоминание: 20:00», «Скажи вслух» видна при ≥ 3 словах с переводом.
// Аккаунт этим сценарием НЕ сбрасывается — слова копятся между прогонами (на тест это не влияет). Seed 2503.
const skip = liveSkipReason(3)
test.skip(!!skip, skip ?? '')

// Конец сценария (в том числе упавшего): гасим все сессии аккаунта — токены из трассы артефакта становятся мёртвыми
test.afterEach(async () => { if (!skip) await revokeLiveSessions(liveAccount(3)).catch(() => {}) })

test('живой второй день: «Память» сразу, рассказ не повторяется, «Напоминание: 20:00», «Скажи вслух»', async ({ page }) => {
  test.setTimeout(180_000)
  const acc = liveAccount(3)
  const rnd = makeRng(seedFor(2503))

  const mem = await test.step('подготовка в базе: хотя бы 4 слова в памяти и напоминание 20:00', async () => {
    const m = await ensureMemoryWords(acc, 4)
    await setRemind(acc, '20:00', true)
    return m
  })

  await prepareLiveDevice(page, 3)
  await seedOnce(page, {
    pithy_memory_tab_seen_v1: '1', // вкладку «Память» уже нажимали: мерцание погашено
    pithy_remind_asked_v1: '1',    // «Когда удобно учиться?» уже спрашивали
    pithy_prompts_v1: { sessions: 1 }, // первая сессия была; normalizeState достроит остальное
  })

  await test.step('вход, затем перезапуск приложения с флагами второго дня', async () => {
    await loginLive(page, acc)
    // localStorage не чистим (флаги нужны), только перезагружаем: приложение стартует как при повторном визите вошедшего
    await page.goto('/')
    await openFeed(page)
  })

  await test.step('«Память» на месте с первого кадра, не мигает; рассказа и «Когда удобно» нет', async () => {
    await expect(learnTab(page)).toBeVisible({ timeout: 20_000 })
    await expect(learnTab(page)).not.toHaveClass(/shellV2NavBtn--blink/)
    await think(page, rnd, 2000, 3500)
    await expect(page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toHaveCount(0)
    await expectNoHScroll(page, 'на втором дне')
  })

  await test.step('вкладка «Память»: открывается без рассказа; «Скажи вслух» при ≥ 3 словах с переводом', async () => {
    await learnTab(page).click()
    await expect(page.locator('.lrMain')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Когда удобно учиться' })).toHaveCount(0)
    const say = page.getByTestId('say-aloud-launch').first()
    if (mem.withTranslation >= 3) await expect(say).toBeVisible({ timeout: 15_000 })
    else manual('«Скажи вслух»', `в памяти только ${mem.withTranslation} слов с переводом из модулей (нужно ≥ 3; засеяно ${mem.seeded}) — кнопку проверить вручную`)
    await expectNoHScroll(page, 'на вкладке «Память»')
  })

  await test.step('«Профиль» → шестерёнка → «Напоминание: 20:00»', async () => {
    await page.getByRole('button', { name: 'Профиль', exact: true }).click()
    await page.locator('.pvGear').click()
    await expect(page.getByRole('button', { name: /Напоминание: 20:00/ })).toBeVisible({ timeout: 15_000 })
    await expectNoHScroll(page, 'в настройках')
  })
})
