import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startFlight, cancelFlights, setFlightRate, FLIGHT_MS, ANIM_MS, flightPosition } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y, SPEED } from './wordLaneTimeline.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const readLane = () => read('../../../../styles/player/modules/word-lane.css') + read('../../../../styles/player/modules/word-lane-pill.css') // раскладка и пилюли: одна вёрстка игры в двух файлах
const css = readLane()

describe('ход пилюль — на композиторе (WAAPI), а не по кадрам из JS', () => {
  const fakeEl = () => { const calls = []; return { calls, animate(frames, opts) { const a = { frames, opts, currentTime: null, cancelled: false, rate: 1, cancel() { this.cancelled = true }, updatePlaybackRate(r) { this.rate = r } }; calls.push(a); return a } } }

  it('один линейный полёт от ENTER_Y до EXIT_Y: длительность по скорости конвейера, easing linear, fill both', () => {
    const el = fakeEl()
    const a = startFlight(el, -300)
    expect(FLIGHT_MS).toBeCloseTo(((EXIT_Y - ENTER_Y) / SPEED) * 1000, 6)
    expect(a.opts).toMatchObject({ duration: ANIM_MS, easing: 'linear', fill: 'both' })
    expect(ANIM_MS).toBeGreaterThan(FLIGHT_MS + 60000)               // не «finished» посреди игры: currentTime анимации — часы фазы
    expect(a.frames).toHaveLength(3)
    expect(a.frames[0].translate).toBe(flightPosition(ENTER_Y))
    expect(a.frames[1]).toMatchObject({ translate: flightPosition(EXIT_Y), offset: FLIGHT_MS / ANIM_MS })   // долетела до EXIT_Y ровно за FLIGHT_MS
    expect(a.frames[2].translate).toBe(flightPosition(EXIT_Y))      // и дальше стоит за краем
    expect(a.currentTime).toBe(-300)                                 // ещё не выкатилась: ждёт за краем
    expect(flightPosition(10)).toBe('-50% calc(10.000dvh - 50%)')
  })

  it('отмена и смена скорости: пустяковые поправки композитору не шлём', () => {
    const a = [startFlight(fakeEl()), startFlight(fakeEl())]
    expect(setFlightRate(a, 1.001, 1)).toBe(1)
    expect(a[0].rate).toBe(1)
    expect(setFlightRate(a, 1.04, 1)).toBe(1.04)
    expect(a.map(x => x.rate)).toEqual([1.04, 1.04])
    cancelFlights(a)
    expect(a).toEqual([null, null])
  })

  it('движок пишет в DOM только заливку, худ и класс-атрибуты: положение пилюли JS не трогает (никаких --y в кадре)', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).not.toContain("setProperty('--y'")
    expect(read('./wordLanePool.js')).toContain('startFlight(el, atMs)')            // полёт запускает пул, движок только выдаёт пилюли
  })
})

describe('щелчок не сдвигает пилюлю', () => {
  it('положение — свойство translate, хлопок — scale, дрожь — transform: они в разных слотах цепочки и друг другу не мешают', () => {
    expect(read('./wordLaneMotion.js')).toContain('{ translate: flightPosition(ENTER_Y) }')
    const snap = read('./wordLaneSnap.js')
    expect(snap).toContain('{ scale: 1.12, offset: 0.38 }')
    expect(snap).not.toMatch(/animate\(\[[^\]]*translate:/)                // у промаха теперь transform
    expect(snap).toContain("transform: 'translateX(-6px)'")
    expect(css).toMatch(/\.wlPill \{[^}]*translate: -50% calc\(var\(--y\) \* 1dvh - 50%\)/)
    expect(css).not.toMatch(/\.wlPill \{[^}]*\n {2}transform:/)               // в базе у пилюли transform не задан — он свободен для дрожки
  })
})

describe('подлагивание в начале: прогрев слоёв, статичный кот, счётчик плавности', () => {
  it('в фазе lanes пилюли стоят посреди экрана почти прозрачными — слои растеризуются до выезда первой пилюли', () => {
    expect(css).toMatch(/\.wl\[data-phase='lanes'\] \.wlPill \{[^}]*translate: -50% calc\(50dvh - 50%\);[^}]*opacity: 0\.01/)
  })
  it('кот без идл-анимаций SVG (scn--live) — они идут в основном потоке; «живой Пит v2» (scn--v2) включён, на слабом устройстве добавляется scn--lite', () => {
    expect(read('./WordLaneCat.jsx')).toContain("className={`scn scn--v2 wlCat${lite ? ' scn--lite' : ''}`}")
    expect(read('./WordLaneCat.jsx')).not.toMatch(/className="[^"]*scn--live/)
  })
  it('по флагу отладки показывается счётчик плавности (к/с, самый долгий кадр, подвисания с фазой)', () => {
    expect(read('./WordLaneGame.jsx')).toContain('{debug && <WordLanePerf />}')
    const perf = read('./WordLanePerf.jsx')
    expect(perf).toContain('dt > 33.5')
    expect(perf).toContain("dataset.phase")
  })
  it('скорость полёта не трогается: ни выравнивателя, ни обновлений скорости — картинка идёт строго по таймеру, звук включается по плану', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).not.toContain('updatePlaybackRate')
    expect(eng).not.toContain('createAligner')
  })
})

describe('«тень» слова внутри пилюли — только после неверно сказанного', () => {
  it('в вёрстке тень скрыта по умолчанию; движок показывает её лишь на время GHOST_MS после события miss', () => {
    expect(css).toMatch(/\.wlGhost \{[^}]*opacity: 0;/)
    expect(css).not.toMatch(/data-phase='speak'\] \.wlPill:not\(\[data-lock\]\) \.wl(Ghost|Pace)/)
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain("ghostUntil.set(e.rep.idx, performance.now() + GHOST_MS)")
    expect(eng).toContain("now2 < (ghostUntil.get(p.rep) ?? 0)")
    expect(eng).not.toContain('pillFill(t - rep.onset')                     // метки темпа больше нет
  })
  it('заливка — только на речь, подтверждённую распознаванием, по очереди кусков', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('const confirmed = Date.now() - (sig.heardAt ?? 0) < CONFIRM_MS')
    expect(eng).toContain('tail: sig.tail ?? null')
  })
})
