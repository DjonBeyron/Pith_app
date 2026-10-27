import { fingerSwipe, think, sheet } from './newbiePersona.js'

// Действия «непоседы» (e2e/newbie-persona-monkey.spec.js): случайные, но по seed, жесты нервного пользователя — свайпы вперёд/назад
// с разной скоростью, тапы по чипу звука, фразе, сердечку и закладке, долгое нажатие (замедление), шторки (ответ, крестик, смахивание
// вниз), игра ленты, переключение вкладок. Каждое действие «промахивается» без шума, если цели на экране нет (человек тоже тапает мимо):
// промахом считаем только таймаут/«не видно»/«перекрыто» — любая другая ошибка роняет тест.
const MISS = /Timeout|not visible|not attached|detached|intercepts pointer|outside of the viewport|Target page|strict mode violation/i

const active = page => page.locator('.feedSlideWrapActive')
const tapAt = (page, x, y) => page.touchscreen.tap(Math.round(x), Math.round(y))

async function swipeNext(page, rnd) { await fingerSwipe(page, 'next', { ms: rnd.int(90, 600), dist: 0.25 + rnd() * 0.3 }) }
async function swipePrev(page, rnd) { await fingerSwipe(page, 'prev', { ms: rnd.int(90, 600), dist: 0.25 + rnd() * 0.3 }) }
// Резкий «нервный» пролист: несколько флипов подряд без пауз
async function burst(page, rnd) { for (let i = 0, n = rnd.int(2, 4); i < n; i++) await fingerSwipe(page, rnd.chance(0.7) ? 'next' : 'prev', { ms: rnd.int(80, 160) }) }

const soundChip = (page) => active(page).locator('.feedSoundChip').click({ timeout: 1500 })

async function tapPhrase(page, rnd) {
  const box = await active(page).locator('.feedPhrase').first().boundingBox({ timeout: 1500 })
  if (box) await tapAt(page, box.x + rnd() * box.width, box.y + rnd() * box.height)
}

const heart = page => active(page).locator('.feedHudBtn').first().click({ timeout: 1500 })
const bookmark = page => active(page).getByRole('button', { name: 'Сохранить в закладки' }).click({ timeout: 1500 })

// Долгое нажатие в зоне замедления (зажми — видео замедлится): настоящие касания, как палец
async function hold(page, rnd) {
  const { width, height } = page.viewportSize()
  const cdp = await page.context().newCDPSession(page)
  const p = { x: Math.round(width * (0.2 + rnd() * 0.6)), y: Math.round(height * (0.35 + rnd() * 0.2)) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await think(page, rnd, 350, 1400)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

// Шторка Пита: ответить на случайную кнопку / крестик / смахнуть вниз пальцем (как закрывают шторку на телефоне)
async function sheetAct(page, rnd) {
  const s = sheet(page).first()
  const box = await s.boundingBox({ timeout: 1500 })
  if (!box) return
  const how = rnd.int(0, 2)
  if (how === 0) {
    const btns = s.locator('.promptSheetBtn')
    const n = await btns.count()
    if (n) await btns.nth(rnd.int(0, n - 1)).click({ timeout: 1500 })
    else await s.getByRole('button', { name: 'Закрыть' }).click({ timeout: 1500 })
  } else if (how === 1) {
    await s.getByRole('button', { name: 'Закрыть' }).click({ timeout: 1500 })
  } else {
    const cdp = await page.context().newCDPSession(page)
    const x = Math.round(box.x + box.width / 2)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: Math.round(box.y + 10) }] })
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(box.y + 10 + i * 18) }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }
}

// Игра ленты, плашка «Сохранить слово» и «Давай» в предложении: что-нибудь нажать
async function gameAct(page, rnd) {
  const game = page.getByRole('group', { name: 'Выбери слово' })
  const seed = page.getByRole('group', { name: 'Чтобы не забыть слово, сохрани его' })
  if (await seed.count()) { await seed.getByRole('button').nth(rnd.int(0, 1)).click({ timeout: 1500 }); return }
  if (await game.count()) {
    if (rnd.chance(0.35)) { await game.getByRole('button', { name: 'Закрыть' }).click({ timeout: 1500 }); return } // передумал играть
    const btns = game.getByRole('button')
    const n = await btns.count()
    if (n) await btns.nth(rnd.int(0, n - 1)).click({ timeout: 1500 })
    return
  }
  await sheet(page).getByRole('button', { name: rnd.chance(0.7) ? 'Давай' : 'Не сейчас' }).click({ timeout: 1500 })
}

// Вкладки нижней панели: ушёл, посмотрел, вернулся
async function tabs(page, rnd) {
  const names = ['Уроки', 'Профиль', 'Рейтинг']
  const nav = rnd.chance(0.25) ? page.locator('[data-nav="learn"]') : page.getByRole('button', { name: rnd.pick(names), exact: true })
  await nav.click({ timeout: 1500 })
  await think(page, rnd, 300, 1200)
}

// Закрыть всё лишнее (рассказ Пита, «Когда удобно», разбор): Escape, крестик, «Дальше» — как человек, застрявший в окне
async function dismissOverlay(page, rnd) {
  await page.keyboard.press('Escape')
  const close = page.locator('.lrSheetBack, [role="dialog"]').getByRole('button', { name: /Закрыть|Дальше|Не сейчас|Готово/ }).first()
  if (rnd.chance(0.6)) await close.click({ timeout: 1500 })
}

// [вес, имя, действие]
export const ACTIONS = [
  [14, 'свайп вперёд', swipeNext], [6, 'свайп назад', swipePrev], [3, 'нервная серия', burst],
  [4, 'чип звука', soundChip], [5, 'тап по фразе', tapPhrase], [3, 'сердечко', heart], [2, 'закладка', bookmark],
  [3, 'зажал (замедление)', hold], [9, 'шторка Пита', sheetAct], [6, 'игра / «Сохранить слово»', gameAct],
  [4, 'вкладки', tabs], [3, 'закрыть окно', dismissOverlay],
]
const TOTAL = ACTIONS.reduce((n, a) => n + a[0], 0)
export function pickAction(rnd) {
  let r = rnd() * TOTAL
  for (const a of ACTIONS) { r -= a[0]; if (r < 0) return a }
  return ACTIONS[0]
}

// Выполнить действие; true — отработало, false — промах (цели не было)
export async function perform(page, rnd, [, name, fn]) {
  try { await fn(page, rnd); return true } catch (e) {
    if (MISS.test(e.message)) return false
    throw new Error(`«${name}»: ${e.message}`)
  }
}

// Усталость: закрыть всё, что осталось открытым (рассказ Пита, «Когда удобно», игра, плашка семени, шторка Пита), и вернуться в «Уроки»
export async function closeEverything(page) {
  const names = /Закрыть|Дальше|Не сейчас|Готово/
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Escape')
    const game = page.getByRole('group', { name: /Выбери слово|Чтобы не забыть слово/ })
    if (await game.count()) await game.getByRole('button', { name: names }).first().click({ timeout: 2000 }).catch(() => {})
    const open = page.locator('.lrSheetBack, [role="dialog"]')
    if (await open.count()) await open.getByRole('button', { name: names }).first().click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(400)
  }
}
