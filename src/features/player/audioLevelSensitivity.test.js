import { describe, it, expect, beforeEach } from 'vitest'
import { publishLevel, subscribeAudioLevel, _audioLevelTestHooks } from './audioLevel.js'
import { setEqSensitivity, _resetAudioSettingsForTests } from '../../shared/lib/audioSettings.js'

// Чувствительность эквалайзера (глобальная настройка админа) множит уровень и
// полосы источника ДО порогов MIN_LEVEL / BAND_FLOOR
let queue = []
const hooks = _audioLevelTestHooks({ raf: cb => { queue.push(cb); return queue.length }, caf: () => { queue = [] }, hidden: () => false })
const frame = now => { const cbs = queue; queue = []; cbs.forEach(cb => cb(now)) }

function run(getLevel, getBands = null, frames = 12) {
  let last = { level: 0, active: false, bands: [0, 0, 0, 0] }   // подписчика будят только при свете
  subscribeAudioLevel((l, a, n, b) => { last = { level: l, active: a, bands: Array.from(b) } })
  publishLevel('s', { playing: true, getLevel, getBands, profile: 'ui-all' })
  for (let i = 0; i < frames; i++) frame(i * 40)
  return last
}

beforeEach(() => { hooks.reset(); queue = []; _resetAudioSettingsForTests() })

describe('eqSensitivity в audioLevel', () => {
  it('1.0 — без изменений: уровень 0.5 → ≈ 0.5', () => {
    expect(run(() => 0.5).level).toBeGreaterThan(0.45)
  })

  it('больше 1: тихий звук (0.08) проходит порог MIN_LEVEL и светит; при 1.0 — молчит', () => {
    expect(run(() => 0.08).active).toBe(false)
    hooks.reset(); queue = []
    setEqSensitivity(2)
    const r = run(() => 0.08)
    expect(r.active).toBe(true)
    expect(r.bands.some(b => b > 0.1)).toBe(true)
  })

  it('меньше 1: звук 0.3 при 0.3× падает ниже порога — света нет', () => {
    expect(run(() => 0.3).active).toBe(true)
    hooks.reset(); queue = []
    setEqSensitivity(0.3)
    expect(run(() => 0.3).active).toBe(false)
  })

  it('настоящий спектр тоже масштабируется (с зажимом в 0..1)', () => {
    const bands = (n, out) => { out.set([0.2, 0.2, 0.2, 0.2]); return true }
    const base = run(() => 0.5, bands).bands[0]
    hooks.reset(); queue = []
    setEqSensitivity(3)
    const high = run(() => 0.5, bands).bands
    expect(high[0]).toBeGreaterThan(base * 2)
    expect(Math.max(...high)).toBeLessThanOrEqual(1)
    hooks.reset(); queue = []
    setEqSensitivity(0.3)
    expect(run(() => 0.5, bands).bands[0]).toBeLessThan(base)
  })

  it('уровень зажат 0..1 при любой чувствительности', () => {
    setEqSensitivity(3)
    expect(run(() => 1).level).toBeLessThanOrEqual(1)
  })
})
