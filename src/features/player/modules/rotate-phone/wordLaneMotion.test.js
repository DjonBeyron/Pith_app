import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRateController, audioPlayingMs, MAX_RATE, JUMP_MS } from './wordLaneClock.js'
import { startFlight, cancelFlights, setFlightRate, FLIGHT_MS, ANIM_MS, flightPosition } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y, SPEED } from './wordLaneTimeline.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = read('../../../../styles/player/modules/word-lane.css')

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
    expect(eng).toContain('startFlight(')
    expect(eng).toContain('Number(c.anims[0].currentTime)')           // время плана = положение анимации
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
    expect(css).not.toMatch(/\.wlPill \{[^}]*\n  transform:/)               // в базе у пилюли transform не задан — он свободен для дрожки
  })
})

describe('подстройка полёта под звук: плавная скорость, без рывков и остановок', () => {
  // Симуляция кадров: время плана идёт со скоростью rate, звук стартует в audioStart (по таймеру); currentTime можно огрубить (step) и зашумить
  const run = ({ audioStart, audioAt = 1300, frames = 900, dt = 16, step = 0, noise = 0, seed = 7 }) => {
    let rnd = seed
    const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647 - 0.5 }
    const ctl = createRateController()
    let plan = 0, rate = 1
    const out = []
    for (let f = 1; f <= frames; f++) {
      const timer = f * dt
      plan += dt * rate                                              // композитор двигает картинку со скоростью rate
      let audioMs = timer >= audioStart ? timer - audioStart + rand() * noise : null
      if (audioMs != null && step) audioMs = Math.floor(audioMs / step) * step
      if (audioMs != null && audioMs <= 0) audioMs = null
      const r = ctl.step({ planMs: plan, audioMs, audioAt, dt })
      if (r.jump) plan += r.jump
      rate = r.rate
      out.push({ plan, rate, audioPlan: audioMs == null ? null : audioAt + timer - audioStart })
    }
    return out
  }

  it('скорость полёта всегда в пределах 1 ± MAX_RATE — при любом опоздании звука, грубом currentTime и шуме пилюля не тормозит и не «втыкается»', () => {
    for (const late of [0, 80, 150, 250]) {
      for (const [step, noise] of [[0, 0], [100, 0], [250, 0], [0, 60], [50, 40]]) {
        for (const r of run({ audioStart: 1300 + late, step, noise })) {
          expect(r.rate).toBeGreaterThanOrEqual(1 - MAX_RATE - 1e-9)
          expect(r.rate).toBeLessThanOrEqual(1 + MAX_RATE + 1e-9)
        }
      }
    }
  })

  it('опоздание звука в пределах JUMP_MS гасится скоростью и сходится к звуку; рывков нет', () => {
    const frames = run({ audioStart: 1300 + 120, frames: 1500 })
    const last = frames.at(-1)
    expect(Math.abs(last.plan - last.audioPlan)).toBeLessThan(25)
  })

  it('на грубом currentTime (шаг 100 мс) картинка держится около звука', () => {
    const f = run({ audioStart: 1300, frames: 1200, step: 100 }).filter(r => r.audioPlan != null).slice(200)
    expect(f.reduce((a, r) => a + Math.abs(r.plan - r.audioPlan), 0) / f.length).toBeLessThan(100)
  })

  it('крупный разрыв (звук перемотан/встал) — один скачок, а не бесконечная погоня', () => {
    const ctl = createRateController()
    const r = ctl.step({ planMs: 1000, audioMs: 1000 + JUMP_MS + 100, audioAt: 0, dt: 16 })
    expect(r.jump).toBeCloseTo(JUMP_MS + 100, 6)
    expect(r.rate).toBe(1)
  })

  it('звука нет — скорость обычная, поправок нет', () => {
    const ctl = createRateController()
    expect(ctl.step({ planMs: 500, audioMs: null, audioAt: 1300, dt: 16 })).toEqual({ rate: 1, jump: 0 })
  })

  it('audioPlayingMs: пауза, конец и «время ещё не пошло» — не звук; идущий файл — его currentTime в мс', () => {
    expect(audioPlayingMs(null)).toBeNull()
    expect(audioPlayingMs({ paused: true, ended: false, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: true, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 0 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 1.25 })).toBe(1250)
  })
})

describe('худ в пилюле реагирует только на голос', () => {
  it('в вёрстке «тень» и метка темпа по умолчанию скрыты, статичных правил показа нет; в движке прозрачность пишется по громкости', () => {
    expect(css).toMatch(/\.wlGhost \{[^}]*opacity: 0;/)
    expect(css).toMatch(/\.wlPace \{[^}]*opacity: 0;/)
    expect(css).not.toMatch(/data-phase='speak'\] \.wlPill:not\(\[data-lock\]\) \.wl(Ghost|Pace)/)   // раньше показывались статично всю фазу
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('const talking = level > VOICE_THRESHOLD')
    expect(eng).toContain("(0.2 + 0.55 * Math.min(1, level)).toFixed(2) : '0'")
    expect(eng).toContain('listening && p.onset != null')              // метка темпа — только после первого звука
  })
})
