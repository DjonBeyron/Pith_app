import { test, expect } from './fixtures.js'
import { devices } from '@playwright/test'
import { SESSION_KEY, fakeSession, rpcCalls } from './helpers/newbieBackend.js'
import { proof } from './helpers/newbieEvidence.js'
import { bootPersona, openFeed, seedOnce, sheet, storyToRemindAsk, expectNoHScroll } from './helpers/newbiePersona.js'

// Персона «iPhone в Safari, не с экрана «Домой»» (PLAN_NEW_USER.md → C2, решение 13): iPhone 12 mini, 375×812, UA Safari.
// Движок — Chromium (на WebKit проект не ставится), поэтому iPhone «изображаем»: UA и размеры из devices['iPhone 12 Mini'], платформа
// и касания — init-скриптом. isIOS() в приложении (shared/lib/pwaInstall.js) смотрит только на UA «iPhone|iPad|iPod» — этого хватает.
// Что должно быть: после «Когда удобно?» → 20:00 вошедшему — честная ветка «На iPhone уведомления приходят только приложению
// на экране «Домой»» с «Как добавить» и «Не сейчас»; гостю — «напомню, когда войдёшь»; приложению на экране «Домой»
// (navigator.standalone) — обычная просьба включить; на каждой шторке нет горизонтального скролла (document ≤ 375 px).
const { defaultBrowserType: _ignored, ...iPhone } = devices['iPhone 12 Mini']
test.use({ ...iPhone, viewport: { width: 375, height: 812 }, screen: { width: 375, height: 812 } })

const session = fakeSession()
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
const stub = {
  session,
  rpc: { set_prompt_group: 'prompts', set_remind_time: { ok: true, next_remind_at: new Date(Date.now() + 86_400_000).toISOString() } },
  tables: { word_memory: [{ word: 'keep', step: 1, due_on: tomorrow, last_reviewed_at: null, last_card_id: null, reviews: 0, lapses: 0, settled_on: null }] },
}
const ADD_HOME = 'На iPhone уведомления приходят только приложению на экране «Домой»'

// Safari на iPhone: платформа и касания как у телефона; standalone — только если просят («экран Домой»).
// Разрешение на уведомления закрепляем как «ещё не спрашивали» ('default'): в headless-shell Chromium на GitHub
// Notification.permission по умолчанию 'denied', и ветка уведомлений («Домой» / «Включить») не показывалась
const asIPhone = (page, { standalone = false } = {}) => page.addInitScript(isStandalone => {
  const set = (k, v) => Object.defineProperty(navigator, k, { get: () => v, configurable: true })
  set('platform', 'iPhone')
  set('maxTouchPoints', 5)
  if (isStandalone) set('standalone', true)
  if (window.Notification) Object.defineProperty(window.Notification, 'permission', { get: () => 'default', configurable: true })
}, standalone)

const signedIn = async (page, opts) => {
  await asIPhone(page, opts)
  await seedOnce(page, { [SESSION_KEY]: session })
  return bootPersona(page, { stub })
}

test('[C2.iphone] iPhone в Safari, вошёл: «Когда удобно?» → 20:00 → «На iPhone … только приложению на экране «Домой»» → «Как добавить»', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const calls = await signedIn(page)

  await test.step('экран 375×812: определился iPhone в Safari, лента без горизонтального скролла', async () => {
    await openFeed(page)
    expect(await page.evaluate(() => window.innerWidth)).toBe(375)
    expect(await page.evaluate(() => /iPhone/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent))).toBe(true)
    await expectNoHScroll(page, 'на ленте')
    await expect(sheet(page)).toHaveCount(0)
  })

  await test.step('рассказ Пита и «Когда удобно?» умещаются в 375 px', async () => {
    await expect(page.locator('[data-nav="learn"]')).toBeVisible()
    const ask = await storyToRemindAsk(page, { onStory: () => expectNoHScroll(page, 'на рассказе Пита') })
    await expectNoHScroll(page, 'на «Когда удобно?»')
    await ask.getByRole('button', { name: 'Своё время' }).click()
    await expect(ask.locator('.raClock')).toContainText('по твоим часам сейчас')
    await expectNoHScroll(page, 'на «Своё время»')
    await ask.getByRole('button', { name: 'Своё время' }).click()
    await ask.getByRole('button', { name: '20:00' }).click()
    await expect(ask.locator('.raConfirm')).toContainText('Готово')
    expect(rpcCalls(calls, 'set_remind_time').at(-1).body).toEqual({ p_remind_at: '20:00', p_enabled: true })
  })

  await test.step('ветка iPhone: честное объяснение, «Как добавить» и «Не сейчас»; «Включить уведомления» не предлагают', async () => {
    const ask = page.getByRole('dialog', { name: 'Когда удобно учиться' })
    await expect(ask).toContainText(ADD_HOME)
    await expect(ask.getByRole('button', { name: 'Как добавить' })).toBeVisible()
    await expect(ask.getByRole('button', { name: 'Не сейчас' })).toBeVisible()
    await expect(ask.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0)
    await expectNoHScroll(page, 'на ветке iPhone')
    await proof(testInfo, 'C2.iphone', (await ask.innerText()).replace(/\s+/g, ' '), { page })
  })

  await test.step('«Как добавить»: три слайда инструкции для Safari, каждый без горизонтального скролла', async () => {
    const ask = page.getByRole('dialog', { name: 'Когда удобно учиться' })
    await ask.getByRole('button', { name: 'Как добавить' }).click()
    const card = page.locator('.installSlidesCard')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Установи приложение')
    await expectNoHScroll(page, 'на слайде 1')
    await card.getByRole('button', { name: 'Вперёд' }).click()
    await expect(card).toContainText('Нажми «Поделиться» внизу экрана Safari') // шаги именно для iPhone, не «⋮» Chrome
    await expect(card).toContainText('На экран «Домой»')
    await expectNoHScroll(page, 'на слайде 2')
    await card.getByRole('button', { name: 'Вперёд' }).click()
    await expect(card).toContainText('Готово!')
    await expect(card.getByRole('button', { name: 'Вперёд' })).toBeDisabled()
    await expectNoHScroll(page, 'на слайде 3')
    await card.getByRole('button', { name: 'Закрыть' }).click()
    await expect(card).toHaveCount(0)
  })

  await test.step('«Не сейчас» закрывает шторку, выбор времени остаётся', async () => {
    const ask = page.getByRole('dialog', { name: 'Когда удобно учиться' })
    await ask.getByRole('button', { name: 'Не сейчас' }).click()
    await expect(ask).toHaveCount(0)
    await expectNoHScroll(page, 'после шторки')
  })
})

test('[C2.iphone-home] iPhone, приложение с экрана «Домой»: ветки «добавь на экран» нет, предлагают включить уведомления', async ({ page }, testInfo) => {
  await signedIn(page, { standalone: true })
  await openFeed(page)
  const ask = await storyToRemindAsk(page)
  await ask.getByRole('button', { name: '20:00' }).click()
  await expect(ask.locator('.raConfirm')).toContainText('Готово')
  await expect(ask).not.toContainText(ADD_HOME)
  await expect(ask.getByRole('button', { name: 'Включить уведомления' })).toBeVisible()
  await expectNoHScroll(page, 'на «Включить уведомления»')
  await proof(testInfo, 'C2.iphone-home', (await ask.innerText()).replace(/\s+/g, ' '), { page })
})

test('[C2.iphone-guest] iPhone в Safari, гость: время запоминаем, про «Домой» молчим, обещаем напоминание после входа', async ({ page }, testInfo) => {
  await asIPhone(page)
  await seedOnce(page, { pithy_guest_memory_v1: { keep: { word: 'keep', step: 1, due_on: tomorrow, last_card_id: null, reviews: 0, lapses: 0 } } })
  await bootPersona(page, { stub: { ...stub, session: null } })
  await openFeed(page)
  const ask = await storyToRemindAsk(page)
  await ask.getByRole('button', { name: '20:00' }).click()
  await expect(ask.locator('.raConfirm')).toContainText('напомню, когда войдёшь в аккаунт')
  await expect(ask).not.toContainText(ADD_HOME)
  await expectNoHScroll(page, 'у гостя')
  await proof(testInfo, 'C2.iphone-guest', (await ask.innerText()).replace(/\s+/g, ' '), { page })
})

// iPad с iPadOS 13+ в Safari выдаёт себя за Mac (UA «Macintosh», maxTouchPoints 5): isIOS() в pwaInstall.js ловит только «iPhone|iPad|iPod»,
// поэтому вошедший на таком iPad не увидит ветку «Домой» — а в обычной вкладке Safari Push API нет, и он получит просто «Готово».
// Сейчас такой iPad получает «Готово. Сегодня в 20:00 придёт одно уведомление про слово» — обещание, которое Safari не выполнит.
// Исправлено в v3.3.29: isIOSNavigator (iosDetect.js) учитывает platform «MacIntel» + maxTouchPoints > 1
test.describe('iPad в Safari (UA как у Mac)', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    viewport: { width: 820, height: 1180 },
  })
  test('[C2.ipad] вошёл на iPad: ветка «На iPhone… только приложению на экране «Домой»»', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 })
      delete window.PushManager // в Safari вне экрана «Домой» Push API нет
    })
    await seedOnce(page, { [SESSION_KEY]: session })
    await bootPersona(page, { stub })
    await openFeed(page)
    const ask = await storyToRemindAsk(page)
    await ask.getByRole('button', { name: '20:00' }).click()
    await expect(ask).toContainText(ADD_HOME)
    await proof(testInfo, 'C2.ipad', (await ask.innerText()).replace(/\s+/g, ' '), { page })
  })
})
