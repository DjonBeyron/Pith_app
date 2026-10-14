// Рот говорящего кота — БЕЗ React. Драйвер пишет форму рта прямо в DOM
// (атрибут data-mouth на группе кота; CSS показывает нужную визему), поэтому
// на каждый тик дерево React не пересобирается — критично для слабых Android.
// Цикл форм перезапускается на границе каждого слова (onWord) — движение
// совпадает с речью. Таймеры инъектируются для тестов.

export const MOUTH_SHAPES = ['closed', 'half', 'open']
export const MOUTH_CYCLE = ['open', 'half', 'closed', 'half']
export const MOUTH_STEP_MS = 110

// Применить форму рта к элементу (дешёвый setAttribute, без layout)
export function setMouth(el, shape) {
  if (!el || el.getAttribute('data-mouth') === shape) return
  el.setAttribute('data-mouth', shape)
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
