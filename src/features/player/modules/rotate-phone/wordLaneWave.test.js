import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { flightFrames, startFlight, FLIGHT_MS, ANIM_MS } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y, LANE_EDGES, PILL_W } from './wordLaneTimeline.js'
import { tiltDeg, flightPose, flightPhase, sine, wavePosition, waveRotate, TILT_MAX_DEG, FLIGHT_WAVE_PX, FLIGHT_WAVES } from './wordLaneWave.js'

// Волна пути пилюль (wordLaneWave.js): полёт вниз идёт по растянутой синусоиде, пилюля наклонена по касательной вокруг своего центра — всё в тех же кадрах WAAPI, что и положение
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const H = 812
const PATH_PX = ((EXIT_Y - ENTER_Y) / 100) * H
const xOf = f => Number(f.translate.match(/\+ (-?[\d.]+)px/)[1])
const yOf = f => Number(f.translate.match(/calc\((-?[\d.]+)dvh/)[1])
const degOf = f => parseFloat(f.rotate)
const fly = lane => flightFrames(lane, H).slice(0, -1)                     // точки пути без «стоит за краем»

describe('полёт вниз — синусоида по x', () => {
  it('параметры: размах 10 px (в зазор дорожки с запасом на дрожь промаха), 0,8 периода на весь путь, фаза по дорожкам разная', () => {
    expect([FLIGHT_WAVE_PX, FLIGHT_WAVES]).toEqual([10, 0.8])
    const gapPx = ((LANE_EDGES[0] - PILL_W) / 2 / 100) * 375                   // зазор между пилюлей и разделителем дорожки на iPhone 12 mini, ≈ 21 px
    expect(FLIGHT_WAVE_PX + 6).toBeLessThan(gapPx)                             // волна + дрожь промаха ±6 px не выходят за дорожку
    expect(new Set([0, 1, 2].map(flightPhase)).size).toBe(3)
    const x0 = [0, 1, 2].map(l => xOf(fly(l)[12]))
    expect(new Set(x0.map(x => x.toFixed(1))).size).toBe(3)                    // посреди пути три пилюли стоят в разных местах волны
  })
  it('кадры: y линейно по ходу, x — синусоида ровно FLIGHT_WAVES периода по доле пути, размах не больше FLIGHT_WAVE_PX', () => {
    for (const lane of [0, 1, 2]) {
      const f = fly(lane)
      expect(f).toHaveLength(25)
      f.forEach((x, i) => {
        const u = i / 24
        expect(yOf(x)).toBeCloseTo(ENTER_Y + (EXIT_Y - ENTER_Y) * u, 2)
        expect(xOf(x)).toBeCloseTo(sine(FLIGHT_WAVE_PX, FLIGHT_WAVES, flightPhase(lane), u).x, 1)
        expect(Math.abs(xOf(x))).toBeLessThanOrEqual(FLIGHT_WAVE_PX + 1e-6)
      })
      expect(f[0].offset).toBe(0)
      expect(f.at(-1).offset).toBeCloseTo(FLIGHT_MS / ANIM_MS, 10)
    }
  })
  it('волна растянутая: на видимых 100 % высоты не больше одного периода, а между соседними пересечениями нуля — не короче половины экрана', () => {
    const f = fly(0).filter(x => Math.abs(xOf(x)) > 0.05)                         // точки точно на нуле (после округления до сотых) не считаем
    const crossings = f.slice(1).map((x, i) => [xOf(f[i]), xOf(x), yOf(x)]).filter(([a, b]) => Math.sign(a) !== Math.sign(b))
    const visible = crossings.filter(([, , y]) => y > 0 && y < 100)
    expect(visible.length).toBeLessThanOrEqual(2)
    const ys = crossings.map(c => c[2])
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(50)  // полупериод — больше половины экрана
  })
})

describe('наклон пилюли — по касательной к пути вокруг центра', () => {
  it('tiltDeg: -atan(dx/dy) в градусах, знак по часовой для dx < 0 при ходе вниз, потолок TILT_MAX_DEG, нулевой ход — 0', () => {
    expect(tiltDeg(0, 100)).toBeCloseTo(0, 10)
    expect(tiltDeg(10, 100)).toBeCloseTo(-(Math.atan(0.1) * 180) / Math.PI, 8)  // уходит вправо вниз: низ пилюли вправо — против часовой (−)
    expect(tiltDeg(-10, 100)).toBeGreaterThan(0)
    expect(tiltDeg(10, -100)).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 8)   // вверх с тем же dx: верх вправо — по часовой (+)
    expect(tiltDeg(1000, 1)).toBe(-TILT_MAX_DEG)
    expect(tiltDeg(5, 0)).toBe(0)
  })
  it('угол кадра = -atan(dx/dy) по соседним кадрам (px/px) и меняется плавно; максимум — несколько градусов', () => {
    for (const lane of [0, 1, 2]) {
      const f = fly(lane)
      let max = 0
      for (let i = 1; i < f.length - 1; i++) {
        const dx = xOf(f[i + 1]) - xOf(f[i - 1])
        const dy = ((yOf(f[i + 1]) - yOf(f[i - 1])) / 100) * H
        const num = (-Math.atan(dx / dy) * 180) / Math.PI
        expect(degOf(f[i])).toBeCloseTo(num, 1)                                   // разностная производная ≈ аналитическая (шаг 24 точки)
        max = Math.max(max, Math.abs(degOf(f[i])))
      }
      expect(max).toBeGreaterThan(2)
      expect(max).toBeLessThan(3.2)                                               // ≈ atan(10·2π·0,8 / 1072) ≈ 2,7°
      for (let i = 1; i < f.length; i++) expect(Math.abs(degOf(f[i]) - degOf(f[i - 1]))).toBeLessThan(0.6)
    }
  })
  it('flightPose: x и угол те же, что в кадрах; в крайних точках ноль наклона там, где волна на пике', () => {
    const p = flightPose(1, 8 / 24, H)
    const f = fly(1)[8]
    expect(Number(p.x.toFixed(2))).toBeCloseTo(xOf(f), 1)
    expect(Number(p.deg.toFixed(3))).toBeCloseTo(degOf(f), 0)
    expect(flightPose(0, 5, H)).toEqual(flightPose(0, 1, H))                       // за концом пути — зажато
    expect(flightPose(0, -1, H)).toEqual(flightPose(0, 0, H))
    expect(Math.abs(flightPose(0, 0.3125 + 0.0, H).deg)).toBeLessThan(0.01)       // дорожка 0 (фаза 0): пик волны на 0,3125 пути — касательная вертикальна
  })
  it('якорь по центру: поворот — отдельное свойство rotate вокруг центра (translate ведёт центр, rotate после него в цепочке), а не transform', () => {
    expect(waveRotate(1.23456)).toBe('1.235deg')
    expect(wavePosition(10, 3)).toBe('calc(-50% + 3.00px) calc(10.000dvh - 50%)')
    const f = fly(2)
    expect(f.every(x => Object.keys(x).sort().join() === 'offset,rotate,translate')).toBe(true) // одни кадры на положение и наклон: никаких transform / scale
    const css = read('../../../../styles/player/modules/word-lane-pill.css')
    expect(css).not.toMatch(/\.wlPill \{[^}]*\n {2}(transform|rotate):/)          // база пилюли rotate / transform не задаёт: они свободны для анимации и дрожки промаха
    expect(css).not.toMatch(/\.wlPill \{[^}]*transform-origin/)                   // origin по умолчанию — центр
  })
})

describe('кадры и запуск', () => {
  it('кадры кэшируются по дорожке и высоте экрана; другая высота — другие углы (px), но тот же x', () => {
    expect(flightFrames(1, H)).toBe(flightFrames(1, H))
    const tall = flightFrames(1, 1600)
    expect(tall).not.toBe(flightFrames(1, H))
    expect(xOf(tall[10])).toBe(xOf(flightFrames(1, H)[10]))
    expect(Math.abs(degOf(tall[10]))).toBeLessThan(Math.abs(degOf(flightFrames(1, H)[10])) + 1e-9)
  })
  it('startFlight передаёт дорожку в кадры', () => {
    const calls = []
    const el = { animate: (frames, o) => { calls.push({ frames, o }); return { currentTime: 0 } } }
    startFlight(el, 0, 2)
    startFlight(el, 0, 0)
    expect(calls[0].frames).toBe(flightFrames(2))
    expect(calls[1].frames).toBe(flightFrames(0))
    expect(calls[0].frames[10].translate).not.toBe(calls[1].frames[10].translate)
  })
  it('безопасный режим: те же кадры (пул пишет их до проверки wl--safe), will-change в нём не ставится', () => {
    const pool = read('./wordLanePool.js')
    expect(pool).toContain('startFlight(el, atMs, lane)')
    expect(pool).toMatch(/if \(!safe\(\)\) \{ el\.style\.willChange = WILL_PILL/)
  })
})
