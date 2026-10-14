import { visemeAt } from './mouthRhythm.js'

// Рот в такт файлу озвучки: опрос audio.currentTime → визема (mouthRhythm.js)
// → apply(shape) (в useSceneDirectorV2 это setMouth на DOM-группе кота — без
// React). Опрос идёт ТОЛЬКО пока создатель зовёт start()…stop() (реплика
// звучит): rAF на обычных устройствах; на слабых (pollMs > 0) — редкий
// setTimeout ~35 мс вместо каждого кадра; при скрытой вкладке — редкий
// опрос раз в 250 мс (rAF там не тикает, а рот надо закрыть).
// Устойчивость к рассинхрону: пауза/seek/буферизация (readyState < 2 или
// currentTime не растёт дольше STALL_MS) → рот закрыт; как только время пошло
// — визема снова по currentTime, без накопленного дрейфа.
// Таймеры/rAF/часы инъектируются для тестов.

export const STALL_MS = 260
export const HIDDEN_POLL_MS = 250
export const WEAK_POLL_MS = 35

export function createMouthSync(audio, timings, apply, {
  raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame, timers = globalThis,
  now = () => (globalThis.performance?.now?.() ?? Date.now()), pollMs = 0,
  isHidden = () => (typeof document !== 'undefined' && document.hidden),
} = {}) {
  let active = false
  let frame = 0
  let timer = null
  let hint = 0
  let lastT = -1
  let lastMove = 0
  let current = timings

  // Стоит ли звук (пауза / перемотка / нет данных / время не идёт)
  function stalled(t, wall) {
    if (audio.paused || audio.seeking || (audio.readyState != null && audio.readyState < 2)) return true
    if (t !== lastT) { lastT = t; lastMove = wall; return false }
    return wall - lastMove > STALL_MS
  }

  function tick() {
    if (!active) return
    const t = audio.currentTime
    if (stalled(t, now())) apply('closed')
    else {
      // Подсказка индекса слова — только вперёд; seek назад сбрасывает её
      const shape = visemeAt(current, t, hint)
      apply(shape)
      if (current?.length) hint = Math.max(0, indexHint(current, t, hint))
    }
    schedule()
  }

  function schedule() {
    const hidden = isHidden()
    if (hidden || pollMs > 0) timer = timers.setTimeout(tick, hidden ? HIDDEN_POLL_MS : pollMs)
    else frame = raf(tick)
  }

  function clear() {
    if (frame) { caf(frame); frame = 0 }
    if (timer) { timers.clearTimeout(timer); timer = null }
  }

  return {
    start() {
      if (active) return
      active = true
      hint = 0; lastT = -1; lastMove = now()
      tick()
    },
    // Тайминги могут уточниться после старта (loadedmetadata → длительность файла)
    setTimings(t) { current = t; hint = 0 },
    stop() {
      if (!active) return
      active = false
      clear()
      apply('closed')
    },
    isActive: () => active,
  }
}

// Индекс последнего слова, начавшегося не позже t (чтобы следующий опрос не
// шёл с нуля); при t раньше подсказки — 0
function indexHint(timings, t, from) {
  if (timings[from] && timings[from].start > t) return 0
  let i = from
  while (i + 1 < timings.length && timings[i + 1].start <= t) i++
  return i
}
