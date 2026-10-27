import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createAligner, audioPlayingMs, NUDGE_RATE, MIN_ERR_MS, JUMP_MS, SETTLE_MS } from './wordLaneClock.js'
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
    expect(css).not.toMatch(/\.wlPill \{[^}]*\n {2}transform:/)               // в базе у пилюли transform не задан — он свободен для дрожки
  })
})

describe('выравнивание по звуку: редкие разовые действия, а не поправка каждый кадр', () => {
  // Симуляция: картинка (plan) идёт со скоростью rate, звук — со скоростью 1 от audioStart (по таймеру); действия применяем как движок: skip — звук вперёд, nudge — скорость на hold мс, jump — сдвиг
  const run = ({ audioStart, audioAt = 1300, frames = 900, dt = 16, step = 0, noise = 0, seed = 7, skipMax = 1e9 }) => {
    let rnd = seed
    const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647 - 0.5 }
    const al = createAligner()
    let plan = 0, rate = 1, nudgeUntil = 0, audioShift = 0
    const actions = [], rates = new Set(), out = []
    for (let f = 1; f <= frames; f++) {
      const timer = f * dt
      if (rate !== 1 && timer >= nudgeUntil) rate = 1
      plan += dt * rate
      let audioMs = timer >= audioStart ? timer - audioStart + audioShift + rand() * noise : null
      if (audioMs != null && step) audioMs = Math.floor(audioMs / step) * step
      if (audioMs != null && audioMs <= 0) audioMs = null
      const act = al.step({ planMs: plan, audioMs, audioAt, now: timer, dt })
      if (act) {
        actions.push(act)
        if (act.type === 'skip') audioShift += Math.min(act.ms, skipMax)
        else if (act.type === 'jump') plan += act.ms
        else { rate = act.rate; nudgeUntil = timer + act.hold }
      }
      rates.add(rate)
      out.push({ plan, audioPlan: audioMs == null ? null : audioAt + timer - audioStart + audioShift })
    }
    return { out, actions, rates }
  }
  const finalErr = r => { const l = r.out.at(-1); return Math.abs(l.plan - l.audioPlan) }

  it('звук вовремя — никаких действий: скорость пилюль ровно 1 всю фазу', () => {
    const r = run({ audioStart: 1300, step: 20, noise: 20 })
    expect(r.actions).toEqual([])
    expect([...r.rates]).toEqual([1])
  })

  it('звук опоздал (декодирование): сначала перемотка файла вперёд на опоздание — картинка при этом идёт ровно, подкрутки не нужны', () => {
    const r = run({ audioStart: 1300 + 120 })
    expect(r.actions[0].type).toBe('skip')
    expect(r.actions[0].ms).toBeGreaterThan(100)
    expect(r.actions.length).toBeLessThanOrEqual(2)
    expect([...r.rates]).toEqual([1])
    expect(finalErr(r)).toBeLessThan(MIN_ERR_MS + 5)
  })

  it('опоздание больше тишины перед словом (skipMax): остаток гасит ОДНА подкрутка скорости ±NUDGE_RATE, дальше снова ровно 1', () => {
    const r = run({ audioStart: 1300 + 200, skipMax: 60, frames: 1500 })
    const nudges = r.actions.filter(a => a.type === 'nudge')
    expect(r.actions[0].type).toBe('skip')
    expect(nudges.length).toBeGreaterThanOrEqual(1)
    expect(nudges.length).toBeLessThanOrEqual(2)
    for (const n of nudges) { expect(Math.abs(n.rate - 1)).toBeCloseTo(NUDGE_RATE, 9); expect(n.hold).toBeCloseTo(Math.abs(n.ms) / NUDGE_RATE, 6) }
    expect([...r.rates].every(x => Math.abs(x - 1) <= NUDGE_RATE + 1e-9)).toBe(true)
    expect(finalErr(r)).toBeLessThan(MIN_ERR_MS + 10)
  })

  it('за всю фазу действий единицы, а не десятки: обновлений скорости композитору не больше четырёх', () => {
    for (const [late, step, noise] of [[0, 0, 0], [80, 20, 0], [250, 20, 40], [400, 0, 60]]) {
      const r = run({ audioStart: 1300 + late, step, noise, skipMax: 100, frames: 1200 })
      expect(r.actions.length).toBeLessThanOrEqual(4)
    }
  })

  it('крупный разрыв (звук встал/перемотан) — один скачок; звука нет — тишина', () => {
    const al = createAligner()
    expect(al.step({ planMs: 1400, audioMs: 100, audioAt: 1300, now: 0, dt: 16 })).toBeNull()                      // совпало — ничего
    const a = al.step({ planMs: 1500, audioMs: 100 + JUMP_MS + 300, audioAt: 1300, now: SETTLE_MS + 20, dt: 200 })    // звук внезапно далеко впереди
    expect(a).toMatchObject({ type: 'jump' })
    expect(a.ms).toBeGreaterThan(JUMP_MS)
    expect(createAligner().step({ planMs: 500, audioMs: null, audioAt: 1300, now: 0 })).toBeNull()
  })

  it('audioPlayingMs: пауза, конец и «время ещё не пошло» — не звук; идущий файл — его currentTime в мс', () => {
    expect(audioPlayingMs(null)).toBeNull()
    expect(audioPlayingMs({ paused: true, ended: false, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: true, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 0 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 1.25 })).toBe(1250)
  })
})

describe('подлагивание в начале: прогрев слоёв, статичный кот, счётчик плавности', () => {
  it('в фазе lanes пилюли стоят посреди экрана почти прозрачными — слои растеризуются до выезда первой пилюли', () => {
    expect(css).toMatch(/\.wl\[data-phase='lanes'\] \.wlPill \{[^}]*translate: -50% calc\(50dvh - 50%\);[^}]*opacity: 0\.01/)
  })
  it('кот без идл-анимаций SVG (scn--live) — они идут в основном потоке', () => {
    expect(read('./WordLaneCat.jsx')).toContain('className="scn wlCat"')
    expect(read('./WordLaneCat.jsx')).not.toMatch(/className="[^"]*scn--live/)
  })
  it('по флагу отладки показывается счётчик плавности (к/с, самый долгий кадр, подвисания с фазой)', () => {
    expect(read('./WordLaneGame.jsx')).toContain('{debug && <WordLanePerf />}')
    const perf = read('./WordLanePerf.jsx')
    expect(perf).toContain('dt > 33.5')
    expect(perf).toContain("dataset.phase")
  })
  it('движок не обновляет скорость полёта каждый кадр: только по действию выравнивателя', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain("act?.type === 'nudge'")
    expect(eng).not.toContain('createRateController')
  })
})

describe('худ в пилюле реагирует только на голос', () => {
  it('в вёрстке «тень» и метка темпа по умолчанию скрыты, статичных правил показа нет; в движке прозрачность пишется по громкости', () => {
    expect(css).toMatch(/\.wlGhost \{[^}]*opacity: 0;/)
    expect(css).toMatch(/\.wlPace \{[^}]*opacity: 0;/)
    expect(css).not.toMatch(/data-phase='speak'\] \.wlPill:not\(\[data-lock\]\) \.wl(Ghost|Pace)/)   // раньше показывались статично всю фазу
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('const talking = level > 0')                          // level — уже после ворот голоса
    expect(eng).toContain("(0.2 + 0.55 * Math.min(1, level)).toFixed(2) : '0'")
    expect(eng).toContain('listening && p.onset != null')              // метка темпа — только после первого звука
  })
})
