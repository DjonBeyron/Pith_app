// Рот говорящего кота — БЕЗ React. Драйвер пишет форму рта прямо в DOM
// (атрибут data-mouth на группе кота; CSS показывает нужную визему), поэтому
// на каждый тик дерево React не пересобирается — критично для слабых Android.
// Цикл форм перезапускается на границе каждого слова (onWord) — движение
// совпадает с речью. Таймеры инъектируются для тестов.

import { applyMascotMouth, applyMascotMouthCode } from './sprites/mascot/mascotMouth.js'
import { isCode, foldCode } from './mouthVisemes.js'

export const MOUTH_SHAPES = ['closed', 'half', 'open']
export const MOUTH_CYCLE = ['open', 'half', 'closed', 'half']
export const MOUTH_STEP_MS = 110

// Применить форму рта к элементу (дешёвый setAttribute, без layout). v — форма closed / half / open ИЛИ код Rhubarb (X A–H, «живой Пит v2»,
// mouthVisemes.js): у маскота (data-skin) код пишется в узлы рта как есть, у обычного кота сворачивается в три формы (foldCode).
// data-mouth всегда хранит одну из трёх форм (CSS обычного кота читает её), data-vis — точный код, пока он в работе (для пропуска повторов)
export function setMouth(el, v) {
  if (!el) return
  const code = isCode(v)
  const shape = code ? foldCode(v) : v
  if (code && el.getAttribute('data-skin')) {
    if (el.getAttribute('data-vis') === v) return
    el.setAttribute('data-vis', v)
    el.setAttribute('data-mouth', shape)
    applyMascotMouthCode(el, v)
    return
  }
  const vis = isCode(el.getAttribute('data-vis'))
  if (!vis && el.getAttribute('data-mouth') === shape) return
  if (vis) el.removeAttribute('data-vis')
  el.setAttribute('data-mouth', shape)
  applyMascotMouth(el, shape) // маскот (data-skin): три формы → формы из таблицы пакета
}

export function createMouthDriver(apply, timers = globalThis) {
  let timer = null
  let i = 0
  let active = false

  function tick() {
    i = (i + 1) % MOUTH_CYCLE.length
    apply(MOUTH_CYCLE[i])
  }

  return {
    start() {
      if (active) return
      active = true
      i = 0
      apply(MOUTH_CYCLE[0])
      timer = timers.setInterval(tick, MOUTH_STEP_MS)
    },
    // Граница слова: рот открывается и цикл идёт с начала
    onWord() {
      if (!active) return
      i = 0
      apply(MOUTH_CYCLE[0])
      timers.clearInterval(timer)
      timer = timers.setInterval(tick, MOUTH_STEP_MS)
    },
    stop() {
      if (!active) return
      active = false
      timers.clearInterval(timer)
      timer = null
      apply('closed')
    },
    isActive: () => active,
  }
}
