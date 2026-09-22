import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Тесты идут в node без DOM: кадры прокачиваем руками, чтобы видеть каждый шаг
const frameQueue = []
globalThis.requestAnimationFrame = cb => { frameQueue.push(cb); return frameQueue.length }
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const batch = frameQueue.splice(0, frameQueue.length)
    batch.forEach(cb => cb(performance.now()))
  }
}

const { createTeleporter } = await import('./feedSnapTeleport.js')

// Слайды виртуализатора сдвинуты transform'ом, поэтому телепорт ищет их по
// getBoundingClientRect. Здесь тот же расклад: контейнер в нуле экрана
function makeEl(starts) {
  const el = {
    scrollTop: 0,
    style: {},
    scrolls: 0,
    starts,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll: () => el.starts.map(s => ({ getBoundingClientRect: () => ({ top: s - el.scrollTop }) })),
    dispatchEvent: e => { if (e.type === 'scroll') el.scrolls++; return true },
  }
  return el
}

describe('телепорт круга ленты', () => {
  // Подменяем только setTimeout (страховка телепорта): requestAnimationFrame
  // остаётся нашим — кадры прокачиваются руками
  beforeEach(() => { frameQueue.length = 0; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => vi.useRealTimers())

  it('будит виртуализатор событием scroll — иначе он не узнаёт о переносе', () => {
    const el = makeEl([0, 812, 1624])
    createTeleporter().teleport(el, 81200, 'init', 812, () => {})
    expect(el.scrollTop).toBe(81200)
    expect(el.style.scrollSnapType).toBe('none')
    // Программная установка scrollTop сама события не порождает — шлём своё
    expect(el.scrolls).toBe(1)
  })

  it('не включает snap, пока слайда на новой позиции нет в DOM', () => {
    const el = makeEl([0, 812, 1624]) // виртуализатор ещё держит начало круга
    createTeleporter().teleport(el, 81200, 'init', 812, () => {})
    runFrames(6)
    // Включить mandatory-снап сейчас = браузер утащит ленту к началу круга
    expect(el.style.scrollSnapType).toBe('none')
    el.starts = [80388, 81200, 82012] // слайды доехали
    runFrames(3)
    expect(el.style.scrollSnapType).toBe('')
    expect(el.scrollTop).toBe(81200)
  })

  it('возвращает ленту, если снап всё-таки увёл её на другой конец круга', () => {
    const el = makeEl([80388, 81200, 82012])
    createTeleporter().teleport(el, 81200, 'init', 812, () => {})
    runFrames(3)
    expect(el.style.scrollSnapType).toBe('')
    el.scrollTop = 1624 // снап прилип к началу круга
    runFrames(2)
    expect(el.scrollTop).toBe(81200)
  })

  it('доснэпливание на пару сотен пикселей не трогает — это норма', () => {
    const el = makeEl([80388, 81200, 82012])
    createTeleporter().teleport(el, 81200, 'init', 812, () => {})
    runFrames(3)
    el.scrollTop = 81400
    runFrames(2)
    expect(el.scrollTop).toBe(81400)
  })
})
