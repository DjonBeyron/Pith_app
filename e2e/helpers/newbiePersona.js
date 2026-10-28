import { expect } from '../fixtures.js'
import { prepareNewbie, learnTab } from './newbieSteps.js'
import { MEMORY_STORY } from '../../src/features/learn/memoryStoryText.js' // текст — заглушка владельца: сверяемся с файлом

// Общие приёмы «живых пользователей» (e2e/newbie-persona-*.spec.js): случайные, но воспроизводимые паузы (seed),
// свайпы «пальцем» (настоящие касания через CDP — Swiper их слушает так же, как на телефоне), журнал событий аналитики,
// проверка «нет горизонтального скролла», включение приложения персоной. Персона = один спек, поведение — по её описанию.
// Seed: у каждой персоны свой, переопределяется PERSONA_SEED=число (так повторяется чужой упавший прогон).

// Маленький детерминированный генератор (mulberry32): rnd() → [0,1)
export function makeRng(seed) {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  rnd.int = (min, max) => Math.floor(min + rnd() * (max - min + 1)) // целое в [min, max]
  rnd.pick = list => list[Math.floor(rnd() * list.length)]
  rnd.chance = p => rnd() < p
  return rnd
}

export const seedFor = base => Number(process.env.PERSONA_SEED) || base

// «Подумал»: пауза min..max мс (случайная, но по seed)
export const think = (page, rnd, min, max) => page.waitForTimeout(rnd.int(min, max))

// ---------- касания ----------
const cdpOf = new WeakMap()
async function cdp(page) {
  if (!cdpOf.has(page)) cdpOf.set(page, await page.context().newCDPSession(page))
  return cdpOf.get(page)
}

// Свайп пальцем по ленте: dir 'next' (вверх — следующее видео) | 'prev' (вниз — предыдущее); ms — длительность жеста
// (быстрый флик ~120 мс, спокойный ~400), dist — путь в долях высоты экрана. Точка старта чуть «дрожит» по x
export async function fingerSwipe(page, dir, { ms = 200, dist = 0.45, x } = {}) {
  const { width, height } = page.viewportSize()
  const session = await cdp(page)
  const x0 = x ?? Math.round(width / 2)
  const y0 = Math.round(height * (dir === 'next' ? 0.7 : 0.3))
  const dy = Math.round(height * dist) * (dir === 'next' ? -1 : 1)
  const steps = Math.max(4, Math.round(ms / 16))
  const touch = (type, y, pts = true) => session.send('Input.dispatchTouchEvent', { type, touchPoints: pts ? [{ x: x0, y: Math.round(y) }] : [] })
  await touch('touchStart', y0)
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps)
    await touch('touchMove', y0 + (dy * i) / steps)
  }
  await touch('touchEnd', y0 + dy, false)
}

// Клавиша «вниз/вверх» — запасной способ листать, как в старых спеках (Swiper слушает клавиатуру)
export const keySwipe = (page, dir) => page.keyboard.press(dir === 'next' ? 'ArrowDown' : 'ArrowUp')

// ---------- страница ----------
// Ловушка журнала аналитики: на dev-сервере события в сеть НЕ уходят (track.js: SEND только в сборке), но каждое попадает
// в очередь localStorage `pithy_events_queue`, а через 10 с очередь чистится. Оборачиваем setItem и складываем увиденное в
// window.__events (имя, props, время) — тест читает его через eventsOf()
export function trackEvents(page) {
  return page.addInitScript(() => {
    window.__events = []
    const seen = new Set()
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, v) {
      if (k === 'pithy_events_queue') {
        try { for (const e of JSON.parse(v)) { const id = `${e.sid}|${e.at}|${e.name}`; if (!seen.has(id)) { seen.add(id); window.__events.push(e) } } } catch { /* не наше */ }
      }
      return orig.call(this, k, v)
    }
  })
}
export const eventsOf = async (page, name) => (await page.evaluate(() => window.__events ?? [])).filter(e => !name || e.name === name)

// Положить значения в localStorage ОДИН раз за контекст (init-скрипт идёт на каждую загрузку, и обычная запись затёрла бы
// то, что приложение изменило до перезагрузки)
export function seedOnce(page, entries) {
  return page.addInitScript(items => {
    try {
      if (localStorage.getItem('pithy_persona_seeded')) return
      localStorage.setItem('pithy_persona_seeded', '1')
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
    } catch { /* приватный режим */ }
  }, entries)
}

// Часы страницы уходят на n суток вперёд (Date и Date.now; таймеры и анимации идут как обычно — подмена часов Playwright
// заморозила бы Date.now, и бюджет Пита «20 с после входа» никогда бы не открылся). Для «вернулся на второй день»
export function shiftDays(page, n) {
  return page.addInitScript(offset => {
    const Real = Date
    const now = () => Real.now() + offset
    class Shifted extends Real {
      constructor(...a) { if (a.length) super(...a); else super(now()) }
      static now() { return now() }
    }
    window.Date = Shifted
  }, n * 86_400_000)
}

// Персона открывает приложение: заглушка бэкенда + чистое хранилище (prepareNewbie) + журнал событий. Подсказку «замедлить»
// гасим всегда: персоны проверяют свои сценарии, а не очередь подсказок ленты (так же делает newbie-first-session.spec.js)
export async function bootPersona(page, opts = {}) {
  await page.addInitScript(() => { try { localStorage.setItem('pithy_slowmo_hint_seen_v1', '1') } catch { /* приватный режим */ } })
  await trackEvents(page)
  return prepareNewbie(page, opts)
}

export async function openFeed(page) {
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
}

export const sheet = page => page.locator('.promptSheet')

// Нет горизонтального скролла: ширина документа не больше окна, и ни одна шторка/окно не вылезает за правый край
// Шторки въезжают с анимацией (на миг правый край за окном) — поэтому до 1,5 с даём измерению устояться; настоящий выход за край держится
export async function expectNoHScroll(page, where = '') {
  const measure = () => page.evaluate(() => {
    const w = window.innerWidth
    const wide = [...document.querySelectorAll('[role="dialog"], [role="group"], .promptSheet, .lrSheet, .installSlidesCard, .feedHud')]
      .filter(el => el.getClientRects().length)
      .map(el => ({ cls: String(el.className).slice(0, 40), right: Math.round(el.getBoundingClientRect().right) }))
      .filter(x => x.right > w + 1)
    return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w, wide }
  })
  let m = await measure()
  for (let i = 0; i < 6 && (m.wide.length || Math.max(m.sw, m.bw) > m.w); i++) { await page.waitForTimeout(250); m = await measure() }
  expect(Math.max(m.sw, m.bw), `горизонтальный скролл ${where}: ширина ${m.sw}/${m.bw} при окне ${m.w}`).toBeLessThanOrEqual(m.w)
  expect(m.wide, `шторка шире окна ${m.w} px ${where}`).toEqual([])
}

// Лента отвечает: следующий слайд действительно сменился (по тексту фразы активного слайда)
export const activePhrase = page => page.locator('.feedSlideWrapActive .feedPhrase').first().textContent()

// Листаем пальцем спокойно (пауза на слайде 2,4–4,6 с — дольше 2 с, это не «быстрые» пролисты), пока не появится шторка Пита
// с нужным текстом. Чужие шторки (подсказки ленты и т. п.) закрываем крестиком, как это делает человек. → true, если дождались
export async function scrollUntilSheet(page, rnd, text, { max = 18 } = {}) {
  for (let i = 0; i < max; i++) {
    await fingerSwipe(page, 'next', { ms: rnd.int(220, 420) })
    await think(page, rnd, 2400, 4600)
    const s = sheet(page)
    if (await s.filter({ hasText: text }).count()) return true
    if (await s.count()) await s.getByRole('button', { name: 'Закрыть' }).click()
  }
  return false
}

// Вкладка «Память» → рассказ Пита (пролистываем до конца) → кнопка в конце → шторка «Когда удобно учиться?» (возвращаем её).
// Дальше персона сама выбирает время и ветку уведомлений: у гостя, вошедшего и iPhone они разные
export async function storyToRemindAsk(page, { onStory } = {}) {
  await learnTab(page).click()
  const story = page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })
  await expect(story).toBeVisible()
  await onStory?.(story) // персона может что-то проверить на экране рассказа (например, горизонтальный скролл)
  await story.getByRole('button', { name: 'Дальше' }).click()
  await story.getByRole('button', { name: MEMORY_STORY.cta }).click()
  const ask = page.getByRole('dialog', { name: 'Когда удобно учиться' })
  await expect(ask).toContainText('Когда тебе удобно учиться?')
  return ask
}

// Три быстрых пролиста пальцем (паузы меньше 2 с) → вопрос Пита «Кажется, не зацепило…» (если бюджет открыт: прошло 20 с)
export async function quickSwipes(page, rnd, n = 4) {
  for (let i = 0; i < n; i++) {
    await fingerSwipe(page, 'next', { ms: rnd.int(110, 170) })
    await think(page, rnd, 350, 800)
  }
}
