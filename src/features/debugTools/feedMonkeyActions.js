// Действия «обезьяны» ленты (см. feedMonkey.js): настоящие жесты через
// синтетические PointerEvent (Swiper не проверяет isTrusted — жест идёт
// через его же обработчики: pointerdown на слайде, move/up на document),
// колесо, переключение вкладок и видов, тапы по кнопкам ленты, экран модуля,
// поиск, «сворачивание адресной строки».
//
// Безопасность: кликаем только внутри ленты, по навигации оболочки и по
// кнопкам закрытия. Никаких профиля/рейтинга/админки изнутри (там есть
// действия с сервером — гонка, настройки с перезагрузкой), никаких
// «войти/выйти/удалить/оплатить/поделиться», никаких полей ввода.

export const sleep = ms => new Promise(r => setTimeout(r, ms))

const DENY = /выйт|выход|удал|logout|delete|сброс|очист|оплат|куп|подпис|\bpro\b|админ|admin|подел|репост|share|скача|download|установ|install|отправ|пароль|почт|регистр|войти|вход|dbg/i

let pointerSeq = 1000

export function feedSwiper() {
  return document.querySelector('.feedSwiper')?.swiper ?? null
}

function labelOf(el) {
  return `${el.getAttribute('aria-label') || ''} ${el.textContent || ''} ${el.className || ''}`.trim()
}

export function isVisible(el) {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  return !el.closest('.shellV2TabHidden, .feedViewHidden') && getComputedStyle(el).visibility !== 'hidden'
}

function findButton(re, root = document) {
  return [...root.querySelectorAll('button, [role="button"]')].find(b => isVisible(b) && re.test(labelOf(b)))
}

// Жест пальцем по ленте: dy < 0 — листаем вперёд (палец вверх)
// Палец: все события жеста идут в элемент, где он коснулся, и всплывают до
// document (там их ловит Swiper) — ровно как у настоящего касания: тач-указатель
// неявно «захвачен» стартовым элементом, target у него всегда элемент. Слать
// move/up прямо в document нельзя: глобальные обработчики приложения честно
// ждут элемент (e.target.matches/closest) и падали — ложные JS-ошибки в тесте.
// Если под пальцем не лента (она скрыта за другой вкладкой) — жест всё равно
// шлём в скрытую ленту: проверяем, что она его не примет
function finger(sw, rnd, dy, yFrac) {
  const r = sw.el.getBoundingClientRect()
  const x = r.left + r.width * (0.25 + rnd() * 0.3)
  const y0 = r.top + r.height * (dy < 0 ? yFrac : 1 - yFrac)
  const id = ++pointerSeq
  const under = document.elementFromPoint(x, y0)
  const target = under && sw.el.contains(under) ? under : sw.wrapperEl
  const send = (type, y, buttons = 1) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch',
    isPrimary: true, clientX: x, clientY: y, button: 0, buttons,
  }))
  send('pointerdown', y0)
  return {
    move: k => send('pointermove', y0 + dy * k),
    up: () => send('pointerup', y0 + dy, 0),
  }
}

export async function swipe(rnd, { dy, ms, steps = 8, keepDown = false }) {
  const sw = feedSwiper()
  if (!sw) return 'нет ленты'
  const f = finger(sw, rnd, dy, 0.75)
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps)
    f.move(i / steps)
  }
  if (keepDown) return f.up // палец ещё на экране — вызывающий отпустит сам
  f.up()
  return `${dy < 0 ? 'вперёд' : 'назад'} ${Math.abs(dy).toFixed(0)}px за ${ms.toFixed(0)}мс`
}

// Быстрый флик: все события подряд, без таймеров — так ведёт себя быстрый палец.
// Через sleep его не сымитировать: если среда тормозит таймеры (скрытая
// вкладка), «100-мс флик» по меткам событий растягивается до 400+мс и честно
// считается медленным ведением
export function flick(rnd, dy, steps = 4) {
  const sw = feedSwiper()
  if (!sw) return 'нет ленты'
  const f = finger(sw, rnd, dy, 0.7)
  for (let i = 1; i <= steps; i++) f.move(i / steps)
  f.up()
  return `флик ${dy < 0 ? 'вперёд' : 'назад'} ${Math.abs(dy).toFixed(0)}px`
}

export function wheel(dir) {
  const sw = feedSwiper()
  if (!sw) return 'нет ленты'
  sw.el.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * 120, bubbles: true, cancelable: true }))
  return dir > 0 ? 'колесо вниз' : 'колесо вверх'
}

// Вкладки оболочки: только навигация, внутрь профиля/рейтинга не лезем
export function clickShellTab(name) {
  const btn = [...document.querySelectorAll('.shellV2NavBtn')].find(b => b.textContent.includes(name))
  if (!btn) return `нет вкладки ${name}`
  btn.click()
  return `вкладка «${name}»`
}

export function clickFeedView(name) {
  const btn = findButton(new RegExp(name))
  if (!btn) return `нет вида ${name}`
  btn.click()
  return `вид «${name}»`
}

// Случайная безопасная кнопка на активном слайде ленты (лайк, закладка,
// сложность, звук, перевод…) или тап по видео/фразе
export function tapActiveSlide(rnd) {
  const slide = document.querySelector('.feedSlideWrapActive')
  if (!slide) return 'нет активного слайда'
  const cands = [...slide.querySelectorAll('button, [role="button"], canvas, .slideVideoRoot, .phraseWord, img')]
    .filter(el => isVisible(el) && !DENY.test(labelOf(el)) && !/Изучить/.test(labelOf(el)))
  if (!cands.length) return 'нечего тапать'
  const el = cands[Math.floor(rnd() * cands.length)]
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  return `тап: ${labelOf(el).slice(0, 40) || el.tagName}`
}

// Закрыть всплывшее (форма входа после лайка гостем, панель поиска, экран
// модуля и т.п.): Escape, затем кнопки закрытия/назад
export async function closeOverlays() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(120)
  for (let i = 0; i < 3; i++) {
    const btn = findButton(/Закрыть|Назад|Отмена|^\s*[×✕]\s*$/i)
    if (!btn || btn.closest('.feedSwiper')) break
    btn.click()
    await sleep(250)
  }
}

export async function openModuleAndBack() {
  const btn = document.querySelector('.feedSlideWrapActive .feedLearnBtn')
  if (!btn || !isVisible(btn)) return 'нет «Изучить фразу»'
  btn.click()
  await sleep(900)
  const back = findButton(/Назад/)
  if (!back) return 'модуль открыт, «Назад» не найдена'
  back.click()
  return 'модуль → назад'
}

export async function searchPanel(rnd) {
  const open = findButton(/Поиск и фильтр/)
  if (!open) return 'нет поиска'
  open.click()
  await sleep(300)
  let chip = ''
  if (rnd() < 0.5) {
    const c = findButton(/Легко|Средне|Сложно/)
    if (c) { c.click(); await sleep(250); c.click(); chip = `, чип «${c.textContent.trim()}» туда-обратно` }
  }
  await closeOverlays()
  return `поиск${chip}`
}

// «Адресная строка свернулась/развернулась»: меняем высоту оболочки на время
export async function fakeAddressBar(rnd) {
  const shell = document.querySelector('.shellV2')
  if (!shell) return 'нет оболочки'
  const cut = 40 + Math.floor(rnd() * 60)
  shell.style.bottom = `${cut}px`
  await sleep(400 + rnd() * 600)
  shell.style.bottom = ''
  return `высота −${cut}px и обратно`
}
