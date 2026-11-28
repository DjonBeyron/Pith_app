import { describe, it, expect, vi } from 'vitest'
import { pseudoMover, MOVE_SPAN } from './laneConveyorMover.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// Подставная колонка: animate запоминает кадры и параметры, анимация — простой объект
const fakeCol = ({ pseudo = '::before' } = {}) => {
  const col = { calls: [], style: { setProperty: vi.fn() } }
  col.animate = (frames, opts) => { const a = { frames, opts, currentTime: null, paused: false, cancelled: false, effect: { pseudoElement: pseudo }, pause() { a.paused = true }, cancel() { a.cancelled = true } }; col.calls.push(a); return a }
  return col
}

describe('«двигатель» узора дорожки: сдвиг слоя без пересчёта стилей колонки', () => {
  it('стоящая анимация псевдоэлемента ::before: 1 мс = 1 px, линейно — «время» анимации и есть сдвиг в px', () => {
    const col = fakeCol(), m = pseudoMover(col), a = col.calls[0]
    expect(a.opts).toEqual({ pseudoElement: '::before', duration: MOVE_SPAN, easing: 'linear', fill: 'both' })
    expect(a.frames).toEqual([{ transform: 'translate3d(0, 0px, 0)' }, { transform: `translate3d(0, ${MOVE_SPAN}px, 0)` }])
    expect(a.paused).toBe(true); expect(a.currentTime).toBe(0)
    m.set(123.5); expect(a.currentTime).toBe(123.5)
    m.stop(); expect(a.cancelled).toBe(true)
  })

  it('браузер не понял pseudoElement (анимация встала бы на саму колонку) или не умеет animate — null: привод пишет --run-y, как раньше', () => {
    const col = fakeCol({ pseudo: null })
    expect(pseudoMover(col)).toBeNull(); expect(col.calls[0].cancelled).toBe(true)
    expect(pseudoMover({})).toBeNull(); expect(pseudoMover(null)).toBeNull()
    expect(pseudoMover({ animate() { throw new Error('нет') } })).toBeNull()
  })

  // Привод на подставном поле: три колонки, игра «Гонка» (data-race), признак обратного конвейера data-up — на корне игры
  const field = ({ up = false } = {}) => {
    const cols = [0, 1, 2].map(() => ({ style: { setProperty: vi.fn() } }))
    const game = { attrs: new Set(up ? ['data-up'] : []), hasAttribute: a => game.attrs.has(a) }
    const root = { querySelectorAll: sel => (sel === '.wlLanes i' ? cols : []), querySelector: () => null, closest: sel => (sel === '.wl' || sel === '[data-race]' ? game : null), addEventListener() {}, removeEventListener() {} }
    return { cols, game, root }
  }
  const drive = (f, extra = {}) => {
    const moves = f.cols.map(() => []), stops = []
    let upFn = null
    const d = createConveyorDrive({ root: f.root, now: () => 0, log: () => {}, raf: () => 1, caf: () => {}, observe: () => () => {}, view: () => ({ h: 800, dpr: 2 }), onResize: () => () => {},
      mover: col => ({ set: v => moves[f.cols.indexOf(col)].push(v), stop: () => stops.push(f.cols.indexOf(col)) }), watchUp: (_el, fn) => { upFn = fn; return () => { upFn = null } }, ...extra })
    return { d, moves, stops, flipUp: () => upFn?.() }
  }
  const writes = (col, name) => col.style.setProperty.mock.calls.filter(c => c[0] === name)

  it('привод с «двигателем» не пишет --run-y в стиль колонки: сдвиг идёт в анимацию, и только когда сменился', () => {
    const f = field(), { d, moves } = drive(f)
    d.setArmed('111h')
    let t = 0
    for (let k = 0; k < 120; k++) d.frame(t += 16) // зажигание и разгон: узор поехал
    expect(f.cols.every(c => writes(c, '--run-y').length === 0)).toBe(true)
    expect(moves.every(m => m.length > 10)).toBe(true)
    expect(moves[0].every((v, i, a) => i === 0 || v !== a[i - 1])).toBe(true) // одинаковое значение подряд не пишется
    expect(moves[0].every(v => Math.abs(v * 2 - Math.round(v * 2)) < 1e-6)).toBe(true) // сдвиг кратен пикселю устройства (dpr 2 → шаг 0,5 px), как и был
    expect(writes(f.cols[0], '--run-px').length).toBe(1) // период по-прежнему в переменной (пишется один раз)
  })

  it('без «двигателя» (старый браузер) и на слабом устройстве — всё по-старому: --run-y в стиле колонки', () => {
    const f = field(), { d } = drive(f, { mover: () => null })
    d.setArmed('111h')
    let t = 0
    for (let k = 0; k < 120; k++) d.frame(t += 16)
    expect(writes(f.cols[0], '--run-y').length).toBeGreaterThan(10)
    const weak = field(), w = drive(weak, { still: true })
    expect(w.moves.every(m => m.length === 0)).toBe(true) // узор стоит: анимация не создаётся вовсе
    expect(writes(weak.cols[0], '--run-y').length).toBe(1)
  })

  it('обратный конвейер (data-up): сдвиг «период − y», как в CSS; смена признака при стоящих дорожках перерисовывает сдвиг', () => {
    const f = field(), { d, moves, flipUp } = drive(f)
    expect(moves[0].at(-1)).toBe(0) // покой: y = 0
    f.game.attrs.add('data-up'); flipUp()
    const P = moves[0].at(-1)
    expect(P).toBeGreaterThan(300) // период узора гонки 51,6 % высоты экрана (800 px) — слой сдвинут на него целиком, как при calc(период − 0)
    expect(Math.abs(P * 2 / 12 - Math.round(P * 2 / 12))).toBeLessThan(1e-6) // период кратен 12 пикселям устройства
    f.game.attrs.delete('data-up'); flipUp()
    expect(moves[0].at(-1)).toBe(0)
    d.dispose()
  })

  it('разворот на ходу и на стоящих дорожках не перекидывает узор: фаза сохраняется, дальше узор едет в обратную сторону (журнал iPhone 2026-11-28)', () => {
    const f = field(), { d, moves, flipUp } = drive(f)
    d.setArmed('111h')
    let t = 0
    for (let k = 0; k < 120; k++) d.frame(t += 16)
    const n = moves[0].length, at = moves[0].at(-1)
    expect(at).toBeGreaterThan(0)
    f.game.attrs.add('data-up'); flipUp()
    expect(moves[0].length).toBe(n) // в момент разворота положение узора то же — ни одной записи, скачка нет
    for (let k = 0; k < 20; k++) d.frame(t += 16)
    const P = (() => { const g = field({ up: true }), r = drive(g); return r.moves[0].at(-1) })() // период: у покоя в обратном конвейере сдвиг = P
    const next = moves[0].at(-1), back = ((at - next) % P + P) % P, fwd = ((next - at) % P + P) % P
    expect(back).toBeGreaterThan(0); expect(back).toBeLessThan(fwd) // сдвинулись назад (в обратную сторону), а не вперёд
    f.game.attrs.delete('data-up'); flipUp() // и обратно: снова без скачка
    expect(moves[0].at(-1)).toBe(next)
    d.dispose()
  })

  it('dispose снимает анимации «двигателя»', () => {
    const f = field(), { d, stops } = drive(f)
    d.dispose()
    expect(stops.sort()).toEqual([0, 1, 2])
  })
})
