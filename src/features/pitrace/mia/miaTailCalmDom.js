import { calmSteps, wakeSteps, instantSteps, pulseSteps, REST_FRAME } from './miaTailCalm.js'
import { redLevel } from './miaTailWant.js'

export const STOP_CYCLES = 1 // сколько раз хвост проходит кадр 1 после команды «стоп»: 1 — встаёт на первом же (≤ 0,8 с); 3 — как первый показанный вариант

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
    if (cancelled) return
    if (root.hasAttribute('data-paused')) { cancel = later(() => go(i), 120); return } // пауза игры: хвост стоит на кадре
    if (i >= steps.length) return done?.()
    showFrame(root, steps[i].f)
    if (steps[i].ms > 0) cancel = later(() => go(i + 1), steps[i].ms)
    else done?.()
  }
  go(0)
  return () => { cancelled = true; cancel() }
}

/** Хвост затихает. mode 'slow' (по умолчанию) — по порядку кадров с замедлением до кадра 1; 'instant' — обычная скорость, три прохода и мгновенный стоп на кадре 1. → отмена */
export function calmTail(root, later, mode = 'slow', cycles) {
  const cur = currentFrame(root) // читаем ДО класса tail-js: он гасит CSS-анимацию, и видимого кадра уже нет
  root.classList.add('tail-js'); showFrame(root, cur)
  return play(root, mode === 'instant' ? instantSteps(cur, cycles) : calmSteps(cur), later)
}

/** Хвост снова дёргает: 'slow' — из покоя разгоняется по порядку, затем цикл CSS с нужного кадра; 'instant' — сразу обычный цикл. → отмена */
export function wakeTail(root, later, mode = 'slow') {
  const resume = next => { root.style.setProperty('--tail-from', String(next)); root.classList.remove('tail-js') }
  if (mode === 'instant') { resume(REST_FRAME + 1); return () => {} } // сразу обычная скорость с кадра 2
  const from = currentFrame(root) // читаем до показа: хвост мог не дойти до покоя (затихал, а его снова зовут)
  const { steps, next } = wakeSteps(from)
  return play(root, steps, later, () => resume(next))
}

/** Хвост «дышит»: замедляется и ускоряется по кругу, потом обычный цикл. → отмена */
export function pulseTail(root, later) {
  const cur = currentFrame(root); root.classList.add('tail-js'); showFrame(root, cur)
  const { steps, next } = pulseSteps(cur)
  return play(root, steps, later, () => { root.style.setProperty('--tail-from', String(next)); root.classList.remove('tail-js') })
}

/** Хвост сразу лежит на кадре 1 (без перехода): так он стоит, пока Мия не «нервничает» */
export function restTail(root) { root.classList.add('tail-js'); showFrame(root, REST_FRAME) }

/** Подвести хвост к желаемому состоянию: want — дёргает (разгон), иначе затихает (замедление до кадра 1). ctl = { want, cancel } хранит владелец (ref); при «меньше движения» не трогаем: CSS держит кадр 1 */
export function driveTail(root, ctl, want, later) {
  if (ctl.want === want) return
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
  ctl.want = want; ctl.cancel?.()
  ctl.cancel = want ? wakeTail(root, later, 'instant') : calmTail(root, later, 'instant', STOP_CYCLES) // как вариант A владельца: ни замедления, ни плавного старта — обычная скорость и мгновенный стоп на кадре 1
}

/** Уровень красной зоны на сцене (px от её верха): у финала — по настоящей шкале (.wlBossBox), в допросе шкалы нет — тот же уровень по её размерам (от верха ленты до низа с отступом 40 px) */
export function redLevelOf(stage, s0) {
  const box = stage.querySelector('.wlBossBox'), r = box?.getBoundingClientRect()
  if (r && r.height > 0) return redLevel({ boxTop: r.top - s0.top, boxH: r.height })
  const lanes = stage.querySelector('.wlLanes'), top = lanes ? lanes.getBoundingClientRect().top - s0.top : 80
  return redLevel({ boxTop: top, boxH: s0.height - top - 40 })
}

/** Живые пилюли сцены для wantStep: центр и нижний край — px от верха сцены */
export function pillsOf(stage, s0) {
  return [...stage.querySelectorAll('.wlPill')].map(el => { const r = el.getBoundingClientRect(); return { id: el, h: r.height, bottom: r.bottom - s0.top, locked: el.hasAttribute('data-lock'), failed: el.hasAttribute('data-fail') } }).filter(p => p.h > 0)
}
