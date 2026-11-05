import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createLane, stepLane, laneLook, pulseAt, settled, PULSE_MS, PULSE_A, PULSE_DASH, PULSE_MIN_UP, RUN_A } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { createConveyorDrive } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { speedLabel, badgeShown, BADGE_MS } from './raceSpeedBadge.js'

// Подчёркнуть ускорение дорожек (CONCEPT_RACE.md, «Скорость дорожек»): на втором круге и при каждом +5 % пунктир на 600 мс ярче (--run-a до 0,9) и длиннее штрихами (×1,4), по дорожкам пробегает «волна скорости» сверху вниз;
// бейдж «×1,1 … ×1,5» у верха сцены на 1 с. Здесь — модель, привод и бейдж.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const run = (L, ms, o) => { for (let t = 0; t < ms; t += 16) stepLane(L, 16, o) }
const going = () => { const L = createLane(); run(L, 2400, { armed: true, keep: true, speed: 1 }); return L }

describe('модель дорожки: импульс скорости', () => {
  it('константы: 600 мс, яркость 0,9, штрихи ×1,4; порог — рост не меньше 4 %', () => { expect([PULSE_MS, PULSE_A, PULSE_DASH, PULSE_MIN_UP]).toEqual([600, 0.9, 1.4, 0.04]) })
  it('огибающая 0 → 1 → 0 за PULSE_MS, вне импульса 0', () => {
    expect(pulseAt(0)).toBe(0); expect(pulseAt(PULSE_MS / 2)).toBeCloseTo(1, 6); expect(pulseAt(PULSE_MS)).toBe(0); expect(pulseAt(PULSE_MS + 50)).toBe(0)
  })
  it('рост скорости на 5 % у едущей дорожки запускает импульс: в пике яркость 0,9 и штрихи ×1,4, через 600 мс всё возвращается', () => {
    const L = going(); expect(L.phase).toBe('run'); expect(laneLook(L).sy).toBe(1); expect(laneLook(L).a).toBeCloseTo(RUN_A, 3)
    const n0 = L.pn
    stepLane(L, 16, { armed: true, keep: true, speed: 1.05 }); expect(L.pn).toBe(n0 + 1)
    let peakA = 0, peakSy = 0
    for (let t = 16; t < 700; t += 16) { stepLane(L, 16, { armed: true, keep: true, speed: 1.05 }); const l = laneLook(L); peakA = Math.max(peakA, l.a); peakSy = Math.max(peakSy, l.sy) }
    expect(peakA).toBeGreaterThan(0.85); expect(peakA).toBeLessThanOrEqual(PULSE_A + 1e-9); expect(peakSy).toBeGreaterThan(1.38); expect(peakSy).toBeLessThanOrEqual(PULSE_DASH + 1e-9)
    expect(laneLook(L).sy).toBe(1); expect(laneLook(L).a).toBeCloseTo(RUN_A, 3); expect(L.pt).toBe(PULSE_MS)
  })
  it('второй импульс на следующем +5 %; тот же множитель, спад или рост меньше порога — без импульса; стоящая дорожка не пульсирует', () => {
    const L = going()
    stepLane(L, 16, { armed: true, keep: true, speed: 1.05 }); run(L, 800, { armed: true, keep: true, speed: 1.05 }); const n = L.pn
    run(L, 400, { armed: true, keep: true, speed: 1.05 }); expect(L.pn).toBe(n)
    stepLane(L, 16, { armed: true, keep: true, speed: 1.1 }); expect(L.pn).toBe(n + 1)
    stepLane(L, 16, { armed: true, keep: true, speed: 1.12 }); expect(L.pn).toBe(n + 1) // +2 % — ниже порога
    stepLane(L, 16, { armed: true, keep: true, speed: 1 }); expect(L.pn).toBe(n + 1) // торможение — не ускорение
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
  it('импульс: длина штрихов растёт до 3,08 dvh (2,2 × 1,4) и возвращается; волна переключает data-wave a ↔ b', () => {
    const { root, d, step } = mk()
    d.setArmed('222'); step(2400)
    expect(root.cols[0].st['--run-dash']).toBe('2.20dvh'); expect(root.lanesEl.dataset.wave).toBeUndefined()
    d.setSpeedHint(1.05, 'k2'); step(32)
    expect(root.lanesEl.dataset.wave).toBe('a')
    let peak = 0; for (let i = 0; i < 40; i++) { step(16); peak = Math.max(peak, parseFloat(root.cols[0].st['--run-dash'])) }
    expect(peak).toBeGreaterThan(3.0); expect(peak).toBeLessThanOrEqual(3.08 + 1e-9)
    step(800); expect(root.cols[0].st['--run-dash']).toBe('2.20dvh')
    d.setSpeedHint(1.1, 'k3'); step(32); expect(root.lanesEl.dataset.wave).toBe('b') // следующий импульс — другая анимация, перезапуск волны
  })
  it('слабое устройство / reduced-motion (still): яркость пульсирует, а штрихи и волна — нет', () => {
    const { root, d, step } = mk({ still: true })
    d.setArmed('222'); step(2400); d.setSpeedHint(1.05, 'k2'); step(160)
    expect(root.cols[0].st['--run-dash']).toBeUndefined(); expect(root.lanesEl.dataset.wave).toBeUndefined()
    expect(parseFloat(root.cols[0].st['--run-a'])).toBeGreaterThan(0.6)
  })
  it('onSpeed сообщает новый множитель (рост пилюль и подсказка стадии), обычная скорость 1 — тоже, но бейдж её не показывает', () => {
    const onSpeed = vi.fn(), { d, step } = mk({ onSpeed })
    d.setArmed('111'); step(100); d.setSpeedHint(1.05, 'a'); expect(onSpeed).toHaveBeenLastCalledWith(1.05)
    d.setSpeedHint(1.2, 'b'); expect(onSpeed).toHaveBeenLastCalledWith(1.2); d.setSpeedHint(null, 'c'); expect(onSpeed).toHaveBeenLastCalledWith(1)
    d.setSpeedHint(1.2, 'b'); const n = onSpeed.mock.calls.length; d.setSpeedHint(1.2, 'b'); expect(onSpeed.mock.calls.length).toBe(n) // тот же множитель — тишина
  })
})

describe('бейдж скорости', () => {
  it('подпись «×1,1» с запятой и без лишних нулей; 1 — не показывать; 1 с', () => {
    expect([1.1, 1.05, 1.25, 1.5, 1.2].map(speedLabel)).toEqual(['×1,1', '×1,05', '×1,25', '×1,5', '×1,2'])
    expect(badgeShown(1)).toBe(false); expect(badgeShown(1.05)).toBe(true); expect(badgeShown(NaN)).toBe(false); expect(BADGE_MS).toBe(1000)
  })
  it('подключён: игра ставит бейдж только у гонки, привод шлёт множитель; CSS — стиль плашки, только opacity / transform, без filter', () => {
    const g = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(g).toContain("{cfg.plan?.game === 'race' && <RaceSpeedBadge apiRef={speedBadge} />}"); expect(g).toContain("onSpeed={cfg.plan?.game === 'race' ? onSpeed : undefined}")
    expect(read('../player/modules/rotate-phone/useLaneConveyor.js')).toContain('onSpeed: v => speedCb.current?.(v)')
    const css = read('../../styles/player/modules/race-speed.css')
    expect(css).toContain('.raceSpeed[data-on]'); expect(css).toContain('border: 2px solid var(--wl-accent)'); expect(css).not.toMatch(/\bfilter:/); expect(css).not.toMatch(/\b(top|left): [^;]*transition/)
    const wave = read('../../styles/player/modules/race-lane-pulse.css')
    expect(wave).toContain(".wlLanes[data-wave='a']::after"); expect(wave).toContain('@keyframes wlSpeedWaveA'); expect(wave).not.toMatch(/\bfilter:/)
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-lane-pulse.css'"); expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-speed.css'")
    expect(read('../../styles/player/modules/word-lane-lane-run.css')).toContain('var(--run-dash, 2.2dvh)')
  })
})
