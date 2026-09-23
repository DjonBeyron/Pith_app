import { describe, it, expect } from 'vitest'
import { FEEL, releaseVelocity, swipeVerdict, ratioFor, targetSlide } from './feedSwipeFeel.js'

// Точки движения пальца: [t, y] → { t, y }
const pts = list => list.map(([t, y]) => ({ t, y }))

describe('скорость в момент отпускания', () => {
  it('палец лёг, замер, потом резко ушёл вверх — считается рывок, а не среднее', () => {
    // 300мс почти стоим, последние 80мс — 60px вверх
    const moves = pts([[0, 600], [150, 598], [300, 596], [340, 570], [380, 536]])
    const v = releaseVelocity(moves, { t: 380, y: 536 })
    const avg = (536 - 600) / 380 // средняя за жест — как было раньше
    expect(Math.abs(v)).toBeGreaterThan(FEEL.FLICK_SPEED) // флик
    expect(Math.abs(avg)).toBeLessThan(0.3) // по старой средней — «мало усилия»
  })

  it('протащил и замер перед отпусканием — скорость ноль, решает путь', () => {
    const moves = pts([[0, 600], [100, 450], [200, 400]])
    expect(releaseVelocity(moves, { t: 450, y: 400 })).toBe(0)
  })

  it('редкие события медленного телефона — отрезок короче 30мс не считает, берёт точку раньше', () => {
    const moves = pts([[0, 600], [160, 480]])
    expect(releaseVelocity(moves, { t: 180, y: 470 })).toBeCloseTo(-130 / 180)
  })

  it('отпускание в той же точке, что последнее движение, — флик не теряется', () => {
    // pointerup приходит через 2мс в той же точке; прошлое движение — за 101мс,
    // вне окна. Раньше скорость выходила 0 (по паре «последнее движение → отпускание»)
    const moves = pts([[0, 600], [101, 540]])
    const v = releaseVelocity(moves, { t: 103, y: 540 })
    expect(v).toBeCloseTo(-60 / 103)
    expect(Math.abs(v)).toBeGreaterThan(FEEL.FLICK_SPEED)
  })

  it('обычная частота событий (~16мс) — скорость по последним 100мс', () => {
    const moves = pts(Array.from({ length: 12 }, (_, i) => [i * 16, 600 - i * 8])) // 0.5px/мс
    const last = moves[moves.length - 1]
    expect(releaseVelocity(moves, { t: last.t + 4, y: last.y })).toBeCloseTo(-0.5, 1)
  })
})

describe('вердикт свайпа', () => {
  it('короткий быстрый флик вверх листает вперёд', () => {
    expect(swipeVerdict(-40, -0.6)).toBe('flip')
  })

  it('неспешное ведение без рывка — решает путь (8% экрана)', () => {
    expect(swipeVerdict(-80, -0.1)).toBeNull()
    expect(ratioFor(null)).toBe(FEEL.DRAG_RATIO)
  })

  it('протащил далеко, но в конце дёрнул обратно — вернуть, как в TikTok', () => {
    expect(swipeVerdict(-300, 0.5)).toBe('stay')
    expect(ratioFor('stay')).toBeGreaterThan(0.9)
  })

  it('дрожание пальца при тапе не листает, даже быстрое', () => {
    expect(swipeVerdict(-10, -2)).toBeNull() // короче FLICK_MIN_PX
    expect(targetSlide(100, -10, swipeVerdict(-10, -2), 812)).toBe(100)
  })

  it('лёгкий короткий смах — уже флик (порог как в TikTok)', () => {
    expect(swipeVerdict(-20, -0.2)).toBe('flip') // 20px со скоростью 200px/с
    expect(swipeVerdict(-20, -0.1)).toBeNull() // совсем вяло — решает путь, 20px мало
  })

  it('флик листает при любом пройденном пути', () => {
    expect(ratioFor('flip')).toBeLessThan(0.05)
  })

  it('итоговый слайд — по полному пути пальца, а не по «съеденному» Swiper', () => {
    const h = 812
    expect(targetSlide(100, -70, null, h)).toBe(101) // 8.6% — вперёд (как в TikTok, без «усилия»)
    expect(targetSlide(100, -50, null, h)).toBe(100) // 6% — на месте
    expect(targetSlide(100, 62, 'flip', h)).toBe(99) // флик вниз — назад
    expect(targetSlide(100, -250, 'stay', h)).toBe(100) // рывок обратно — на месте
  })
})
