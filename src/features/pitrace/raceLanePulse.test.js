import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createLane, stepLane, laneLook, pulseAt, settled, PULSE_MS, PULSE_A, PULSE_DASH, PULSE_MIN_RATIO, RUN_A } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { createConveyorDrive } from '../player/modules/rotate-phone/laneConveyorDrive.js'

// Подчеркнуть ускорение дорожек (CONCEPT_RACE.md, «Скорость дорожек», v3.3.115): блеск — ТОЛЬКО на переходе между первым и вторым кругом этапа (ускорение на 10 %), не на каждые +5 %; слабее прежнего (яркость до 0,7, штрихи ×1,2, мягкая волна).
// Числа «×1,1» сверху убраны совсем (бейджа и onSpeed больше нет). Здесь — модель и привод.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const run = (L, ms, o) => { for (let t = 0; t < ms; t += 16) stepLane(L, 16, o) }
const going = () => { const L = createLane(); run(L, 2400, { armed: true, keep: true, speed: 1 }); return L }

describe('модель дорожки: импульс скорости', () => {
  it('константы: 600 мс, яркость 0,7, штрихи ×1,2; порог — рост не меньше 8 % разом', () => { expect([PULSE_MS, PULSE_A, PULSE_DASH, PULSE_MIN_RATIO]).toEqual([600, 0.7, 1.2, 1.08]) })
  it('огибающая 0 → 1 → 0 за PULSE_MS, вне импульса 0', () => {
    expect(pulseAt(0)).toBe(0); expect(pulseAt(PULSE_MS / 2)).toBeCloseTo(1, 6); expect(pulseAt(PULSE_MS)).toBe(0); expect(pulseAt(PULSE_MS + 50)).toBe(0)
  })
  it('шаг +5 % за пилюлю блеска НЕ даёт, а старт второго круга (×1,1) даёт: в пике яркость 0,7 и штрихи ×1,2, через 600 мс всё возвращается', () => {
    const L = going(); expect(L.phase).toBe('run'); expect(laneLook(L).sy).toBe(1); expect(laneLook(L).a).toBeCloseTo(RUN_A, 3)
    const n0 = L.pn
    stepLane(L, 16, { armed: true, keep: true, speed: 1.05 }); expect(L.pn).toBe(n0) // +5 %: без импульса
    run(L, 800, { armed: true, keep: true, speed: 1.05 })
    stepLane(L, 16, { armed: true, keep: true, speed: 1.05 * 1.1 }); expect(L.pn).toBe(n0 + 1) // второй круг: +10 %
    let peakA = 0, peakSy = 0
    for (let t = 16; t < 700; t += 16) { stepLane(L, 16, { armed: true, keep: true, speed: 1.05 * 1.1 }); const l = laneLook(L); peakA = Math.max(peakA, l.a); peakSy = Math.max(peakSy, l.sy) }
    expect(peakA).toBeGreaterThan(0.65); expect(peakA).toBeLessThanOrEqual(PULSE_A + 1e-9); expect(peakSy).toBeGreaterThan(1.18); expect(peakSy).toBeLessThanOrEqual(PULSE_DASH + 1e-9)
    expect(laneLook(L).sy).toBe(1); expect(laneLook(L).a).toBeCloseTo(RUN_A, 3); expect(L.pt).toBe(PULSE_MS)
  })
  it('несколько шагов +5 % подряд — без импульсов; спад и стоящая дорожка не пульсируют', () => {
    const L = going(), n = L.pn
    ;[1.05, 1.1025, 1.1576, 1.2155].forEach(v => { run(L, 900, { armed: true, keep: true, speed: v }) })
    expect(L.pn).toBe(n)
    stepLane(L, 16, { armed: true, keep: true, speed: 1 }); expect(L.pn).toBe(n) // торможение — не ускорение
    const idle = createLane(); stepLane(idle, 16, { speed: 1.5 }); expect(idle.pn).toBe(0); expect(laneLook(idle).sy).toBe(1)
  })
  it('привод засыпает только когда дорожки стоят и импульсов нет', () => {
    const L = createLane(); expect(settled([L])).toBe(true); L.pt = 100; expect(settled([L])).toBe(false)
  })
})

describe('привод: --run-dash, волна и сообщение наверх', () => {
  const mkRoot = () => {
    const cols = [0, 1, 2].map(() => { const st = {}; return { style: { setProperty: (k, v) => { st[k] = v } }, st } })
    const lanesEl = { dataset: {} }
    return { cols, lanesEl, querySelectorAll: sel => (sel === '.wlLanes i' ? cols : []), querySelector: sel => (sel === '.wlLanes' ? lanesEl : null) }
  }
  const mk = (extra = {}) => {
    const root = mkRoot(); let t = 0
    const d = createConveyorDrive({ root, now: () => t, raf: () => 1, caf: () => {}, observe: () => () => {}, ...extra })
    return { root, d, step: ms => { for (let k = 0; k < ms; k += 16) { t += 16; d.frame(t) } } }
  }
  it('импульс второго круга: длина штрихов растёт до 2,64 dvh (2,2 × 1,2) и возвращается; волна переключает data-wave a ↔ b', () => {
    const { root, d, step } = mk()
    d.setArmed('222'); step(2400)
    expect(root.cols[0].st['--run-dash']).toBe('2.20dvh'); expect(root.lanesEl.dataset.wave).toBeUndefined()
    d.setSpeedHint(1.05, 'k1'); step(32); expect(root.lanesEl.dataset.wave).toBeUndefined() // +5 %: волны нет
    d.setSpeedHint(1.155, 'k2'); step(32)
    expect(root.lanesEl.dataset.wave).toBe('a')
    let peak = 0; for (let i = 0; i < 40; i++) { step(16); peak = Math.max(peak, parseFloat(root.cols[0].st['--run-dash'])) }
    expect(peak).toBeGreaterThan(2.55); expect(peak).toBeLessThanOrEqual(2.64 + 1e-9)
    step(800); expect(root.cols[0].st['--run-dash']).toBe('2.20dvh')
    d.setSpeedHint(1.155 * 1.1, 'k3'); step(32); expect(root.lanesEl.dataset.wave).toBe('b') // следующий импульс — другая анимация, перезапуск волны
  })
  it('слабое устройство / reduced-motion (still): яркость пульсирует, а штрихи и волна — нет', () => {
    const { root, d, step } = mk({ still: true })
    d.setArmed('222'); step(2400); d.setSpeedHint(1.2, 'k2'); step(160)
    expect(root.cols[0].st['--run-dash']).toBeUndefined(); expect(root.lanesEl.dataset.wave).toBeUndefined()
    expect(parseFloat(root.cols[0].st['--run-a'])).toBeGreaterThan(0.6)
  })
})

describe('подключение: бейджа скорости больше нет', () => {
  it('файлы бейджа удалены, игра и привод не знают onSpeed; волна и стиль импульса остались, без filter', () => {
    const g = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(g).not.toContain('RaceSpeedBadge'); expect(g).not.toContain('onSpeed')
    expect(read('../player/modules/rotate-phone/useLaneConveyor.js')).not.toContain('onSpeed')
    expect(read('../player/modules/rotate-phone/laneConveyorDrive.js')).not.toContain('onSpeed')
    for (const f of ['./RaceSpeedBadge.jsx', './raceSpeedBadge.js', '../../styles/player/modules/race-speed.css']) expect(() => read(f)).toThrow()
    const wave = read('../../styles/player/modules/race-lane-pulse.css')
    expect(wave).toContain(".wlLanes[data-wave='a']::after"); expect(wave).toContain('@keyframes wlSpeedWaveA'); expect(wave).not.toMatch(/\bfilter:/); expect(wave).toContain('rgba(255, 255, 255, 0.07)')
    const spr = read('../../styles/player/modules/race-sprint.css')
    expect(spr).toContain("@import './race-lane-pulse.css'"); expect(spr).not.toContain('race-speed')
    expect(read('../../styles/player/modules/word-lane-lane-run.css')).toContain('var(--run-dash, 2.2dvh)')
  })
})
