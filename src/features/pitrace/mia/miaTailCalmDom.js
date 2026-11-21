import { calmSteps, wakeSteps, instantSteps, pulseSteps, REST_FRAME } from './miaTailCalm.js'

// Показ хвоста Мии по расписанию (mia/miaTailCalm.js): на время остановки/разгона анимацию CSS заменяет класс tail-js — кадр держит класс `on`
// (race-mia.css). После разгона класс снимается, CSS продолжает цикл с кадра --tail-from. root — .wlMiaCat; later(fn, ms) — таймер владельца (возвращает отмену).
const nodes = root => root.querySelectorAll('.cat-tail .mt, .cat-tail .mk')

/** Номер видимого сейчас кадра хвоста (по цвету-прозрачности) или REST_FRAME */
export function currentFrame(root) {
  for (const n of root.querySelectorAll('.cat-tail .mt')) if (getComputedStyle(n).opacity === '1') return +n.dataset.s
  return REST_FRAME
}

export function showFrame(root, f) { for (const n of nodes(root)) n.classList.toggle('on', +n.dataset.s === f) }

function play(root, steps, later, done) {
  let cancelled = false, cancel = () => {}
  const go = i => {
    if (cancelled || i >= steps.length) return done?.()
    showFrame(root, steps[i].f)
    if (steps[i].ms > 0) cancel = later(() => go(i + 1), steps[i].ms)
    else done?.()
  }
  go(0)
  return () => { cancelled = true; cancel() }
}

/** Хвост затихает. mode 'slow' (по умолчанию) — по порядку кадров с замедлением до кадра 1; 'instant' — обычная скорость, три прохода и мгновенный стоп на кадре 1. → отмена */
export function calmTail(root, later, mode = 'slow') {
  const cur = currentFrame(root) // читаем ДО класса tail-js: он гасит CSS-анимацию, и видимого кадра уже нет
  root.classList.add('tail-js'); showFrame(root, cur)
  return play(root, mode === 'instant' ? instantSteps(cur) : calmSteps(cur), later)
}

/** Хвост снова дёргает: 'slow' — из покоя разгоняется по порядку, затем цикл CSS с нужного кадра; 'instant' — сразу обычный цикл. → отмена */
export function wakeTail(root, later, mode = 'slow') {
  const resume = next => { root.style.setProperty('--tail-from', String(next)); root.classList.remove('tail-js') }
  if (mode === 'instant') { resume(REST_FRAME + 1); return () => {} } // сразу обычная скорость с кадра 2
  const { steps, next } = wakeSteps()
  return play(root, steps, later, () => resume(next))
}

/** Хвост «дышит»: замедляется и ускоряется по кругу, потом обычный цикл. → отмена */
export function pulseTail(root, later) {
  const cur = currentFrame(root); root.classList.add('tail-js'); showFrame(root, cur)
  const { steps, next } = pulseSteps(cur)
  return play(root, steps, later, () => { root.style.setProperty('--tail-from', String(next)); root.classList.remove('tail-js') })
}
