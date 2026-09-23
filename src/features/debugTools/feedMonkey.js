import * as A from './feedMonkeyActions.js'
import { checkFeed, createWatcher, feedOnScreen, settle } from './feedMonkeyChecks.js'

// «Обезьяна» ленты: случайно (но воспроизводимо — по seed) свайпает, листает
// пачками, крутит колесо, уходит на другие вкладки посреди анимации и
// посреди жеста, переключает «Мои уроки», тапает по кнопкам слайда, открывает
// модуль, поиск, дёргает высоту экрана — и после КАЖДОГО действия проверяет
// ленту (feedMonkeyChecks.js). Итог — текстовый лог с нарушениями.
//
// Запуск: кнопка «🐒» в DBG-панели ленты (можно на самом телефоне) или из
// консоли: `await window.__feedMonkey.run({ ms: 60000, seed: 42 })`.

// Воспроизводимый генератор: тот же seed — тот же сценарий
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const H = () => A.feedSwiper()?.size || window.innerHeight

// Каждое действие возвращает { label, maxStep } — maxStep: сколько слайдов
// максимум может честно смениться (для ловли полёта/проскока), -1 — не считать
function makeActions(rnd, hide) {
  const pm = () => (rnd() < 0.6 ? -1 : 1) // чаще вперёд, как листают на самом деле
  const other = () => (rnd() < 0.5 ? 'Профиль' : 'Рейтинг')
  return [
    [26, async () => ({ label: await A.swipe(rnd, { dy: pm() * H() * (0.35 + rnd() * 0.25), ms: 180 + rnd() * 170 }), maxStep: 1 })],
    [10, async () => ({ label: A.flick(rnd, pm() * (30 + rnd() * 120)), maxStep: 1 })],
    // Короче FEEL.FLICK_MIN_PX (12px) — случайное движение, листать нельзя
    [3, async () => ({ label: 'микро' + A.flick(rnd, pm() * (7 + rnd() * 4)), maxStep: 0 })],
    [4, async () => ({ label: 'недосвайп ' + await A.swipe(rnd, { dy: pm() * H() * 0.05, ms: 250 }), maxStep: 1 })],
    [12, async () => {
      const n = 3 + Math.floor(rnd() * 4)
      const dir = pm()
      for (let i = 0; i < n; i++) {
        await A.swipe(rnd, { dy: dir * H() * (0.25 + rnd() * 0.2), ms: 90 + rnd() * 60, steps: 5 })
        await A.sleep(30 + rnd() * 50)
      }
      return { label: `пачка из ${n} быстрых свайпов`, maxStep: n }
    }],
    [5, async () => ({ label: A.wheel(rnd() < 0.6 ? 1 : -1), maxStep: 1 })],
    [12, async () => {
      const tab = other()
      A.clickShellTab(tab)
      await A.sleep(250)
      const problems = hide()
      // Свайп и по экрану другой вкладки, и прямо по скрытой ленте
      await A.swipe(rnd, { dy: pm() * H() * 0.5, ms: 200 })
      await A.sleep(400)
      problems.push(...hide(true))
      A.clickShellTab('Уроки')
      return { label: `ушла на «${tab}», свайпы там, назад`, maxStep: 0, problems }
    }],
    [10, async () => {
      await A.swipe(rnd, { dy: pm() * H() * 0.45, ms: 150 })
      await A.sleep(40 + rnd() * 120) // анимация ещё идёт
      const tab = other()
      A.clickShellTab(tab)
      await A.sleep(500 + rnd() * 700)
      A.clickShellTab('Уроки')
      return { label: `свайп и сразу «${tab}» посреди анимации, назад`, maxStep: 1 }
    }],
    [5, async () => {
      const up = await A.swipe(rnd, { dy: pm() * H() * 0.3, ms: 120, keepDown: true })
      A.clickShellTab(other())
      await A.sleep(200)
      const problems = hide()
      if (typeof up === 'function') up() // палец отпустили уже на другой вкладке
      await A.sleep(500)
      problems.push(...hide(true))
      A.clickShellTab('Уроки')
      return { label: 'вкладка сменилась посреди жеста (палец на экране)', maxStep: 0, problems }
    }],
    [6, async () => {
      A.clickFeedView('Мои уроки')
      await A.sleep(300)
      const problems = hide()
      if (rnd() < 0.5) await A.swipe(rnd, { dy: pm() * H() * 0.5, ms: 200 })
      await A.sleep(300)
      problems.push(...hide(true))
      A.clickFeedView('Рекомендации')
      return { label: '«Мои уроки» и назад', maxStep: 0, problems }
    }],
    [8, async () => {
      const label = A.tapActiveSlide(rnd)
      await A.sleep(350)
      await A.closeOverlays()
      return { label, maxStep: 0 }
    }],
    [3, async () => ({ label: await A.openModuleAndBack(), maxStep: 0 })],
    [3, async () => ({ label: await A.searchPanel(rnd), maxStep: 0 })],
    [5, async () => {
      const both = rnd() < 0.5
      if (both) A.swipe(rnd, { dy: pm() * H() * 0.45, ms: 250 }) // жест параллельно со сменой высоты
      return { label: 'адресная строка: ' + await A.fakeAddressBar(rnd) + (both ? ' + свайп одновременно' : ''), maxStep: 1 }
    }],
  ]
}

function pick(rnd, actions) {
  const sum = actions.reduce((s, [w]) => s + w, 0)
  let r = rnd() * sum
  for (const [w, fn] of actions) { if ((r -= w) < 0) return fn }
  return actions[0][1]
}

// Скрытая страница (фоновая вкладка, свёрнутая панель браузера) не рисует
// кадры — CSS-переходы Swiper там замирают на полпути, и проверять физику
// бессмысленно. В этом режиме переходы мгновенные: проверяется логика ленты,
// а анимации — прогоном на живом экране (кнопка 🐒 в DBG на телефоне)
let instant = false
let origSpeed = null
function applyInstant() {
  const sw = A.feedSwiper()
  if (!instant || !sw) return
  if (origSpeed === null) origSpeed = sw.params.speed
  sw.params.speed = 0
}

async function ensureFeed() {
  applyInstant()
  if (feedOnScreen()) return
  await A.closeOverlays()
  A.clickShellTab('Уроки')
  await A.sleep(250)
  if (!feedOnScreen()) A.clickFeedView('Рекомендации')
  await A.sleep(300)
  applyInstant() // экран модуля пересоздаёт Swiper — со своей скоростью
}

let stopFlag = false
let lastReport = ''

export function stopFeedMonkey() { stopFlag = true }

// Индикатор поверх приложения: видно, что обезьяна работает, и можно её
// остановить (на телефоне консоли нет). Сама обезьяна его не трогает
function showBadge() {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#1b2a07;color:#d6ff8a;font:600 12px system-ui;padding:6px 10px;border-radius:14px;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.5);display:flex;gap:8px;align-items:center'
  const txt = document.createElement('span')
  const stop = document.createElement('button')
  stop.textContent = '⏹ стоп'
  stop.style.cssText = 'background:#b6fe3b;color:#0d1500;border:0;border-radius:10px;padding:2px 8px;font:inherit'
  stop.onclick = () => { stopFlag = true; txt.textContent = '🐒 останавливаю…' }
  el.append(txt, stop)
  document.body.appendChild(el)
  return { set: t => { txt.textContent = t }, remove: () => el.remove() }
}
export function lastFeedMonkeyReport() { return lastReport }

export async function runFeedMonkey({ ms = 60000, seed = Date.now() % 100000, onStep, instant: forceInstant } = {}) {
  stopFlag = false
  instant = forceInstant ?? document.hidden
  origSpeed = null
  const rnd = mulberry32(seed)
  const log = []
  const bad = {}
  const errors = []
  const onErr = e => errors.push(String(e?.message || e?.reason?.message || e?.reason || e))
  const origConsoleError = console.error
  console.error = (...args) => { errors.push(args.map(String).join(' ').slice(0, 200)); origConsoleError(...args) }
  window.addEventListener('error', onErr)
  window.addEventListener('unhandledrejection', onErr)

  const watcher = createWatcher()
  let hiddenIdx = null
  // Проверка скрытой ленты: при первом вызове запоминаем слайд, потом сверяем
  const hide = (again = false) => {
    const sw = A.feedSwiper()
    if (!again) hiddenIdx = sw ? sw.activeIndex : null
    return checkFeed({ changes: [], maxStep: -1, hiddenIdx })
  }
  const actions = makeActions(rnd, hide)
  const badge = showBadge()
  let badCount = 0
  const t0 = performance.now()
  let step = 0
  await ensureFeed()
  while (!stopFlag && performance.now() - t0 < ms) {
    step++
    watcher.bind()
    watcher.take()
    hiddenIdx = null
    const before = A.feedSwiper()?.activeIndex
    const errBefore = errors.length
    let res
    try { res = await pick(rnd, actions)() } catch (e) { res = { label: 'ОШИБКА ДЕЙСТВИЯ ' + e.message, maxStep: -1 } }
    const settled = await settle()
    await A.sleep(150)
    watcher.bind()
    const problems = [...(res.problems || []), ...checkFeed({ changes: watcher.take(), maxStep: res.maxStep })]
    if (!settled) problems.push('ЗАВИСАНИЕ: анимация не закончилась за 1.5с')
    // Одинаковые JS-ошибки за шаг — одной строкой с числом повторов
    const errCount = new Map()
    for (const e of errors.slice(errBefore)) errCount.set(e, (errCount.get(e) || 0) + 1)
    for (const [e, n] of errCount) problems.push(`JS-ОШИБКА${n > 1 ? ` ×${n}` : ''}: ${e}`)
    const after = A.feedSwiper()?.activeIndex
    const t = ((performance.now() - t0) / 1000).toFixed(1)
    log.push(`[${t}с] #${step} ${res.label} | слайд ${before ?? '—'} → ${after ?? '—'}${problems.length ? ' | ⚠ ' + problems.join('; ') : ''}`)
    for (const p of problems) {
      const k = p.split(/[ :]/)[0]
      ;(bad[k] ||= []).push(`#${step}: ${p}`)
    }
    badCount += problems.length
    badge.set(`🐒 шаг ${step} · нарушений ${badCount}`)
    onStep?.(step, problems.length)
    await ensureFeed()
  }

  watcher.unbind()
  badge.remove()
  const swEnd = A.feedSwiper()
  if (swEnd && origSpeed !== null) swEnd.params.speed = origSpeed
  console.error = origConsoleError
  window.removeEventListener('error', onErr)
  window.removeEventListener('unhandledrejection', onErr)
  const secs = ((performance.now() - t0) / 1000).toFixed(0)
  const kinds = Object.keys(bad)
  lastReport = [
    `🐒 обезьяна ленты: seed=${seed}, ${step} действий за ${secs}с${stopFlag ? ' (остановлена)' : ''}`,
    instant ? 'режим: страница скрыта — переходы мгновенные (проверена логика, не анимации)' : 'режим: живой экран, настоящие анимации',
    kinds.length ? `НАРУШЕНИЯ: ${kinds.map(k => `${k}×${bad[k].length}`).join(', ')}` : 'нарушений нет ✓',
    ...kinds.flatMap(k => bad[k].slice(0, 3).map(s => `  ${s}`)),
    '',
    'лог действий:',
    ...log.slice(-300),
  ].join('\n')
  return lastReport
}

window.__feedMonkey = { run: runFeedMonkey, stop: stopFeedMonkey, report: lastFeedMonkeyReport }
