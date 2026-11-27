import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readLaneStill, writeLaneStill, LANE_STILL_KEY, LANE_MODE_KEY, readLaneMode, writeLaneMode } from './wordLaneLaneStill.js'

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }

describe('выключатель «Узор дорожек: стоит» (v3.3.382)', () => {
  it('по умолчанию узор едет; запись «стоит» и возврат', () => {
    const st = memStore()
    expect(readLaneStill(st)).toBe(false)
    writeLaneStill(true, st)
    expect(readLaneStill(st)).toBe(true)
    expect(st.getItem(LANE_MODE_KEY)).toBe('still')
    writeLaneStill(false, st)
    expect(readLaneStill(st)).toBe(false)
    expect(st.getItem(LANE_STILL_KEY)).toBeNull(); expect(st.getItem(LANE_MODE_KEY)).toBeNull()
  })
  it('хранилище недоступно — узор едет, запись не падает', () => {
    const broken = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') }, removeItem() { throw new Error('private') } }
    expect(readLaneStill(broken)).toBe(false)
    expect(() => writeLaneStill(true, broken)).not.toThrow()
  })
})

describe('узор дорожек на слабом устройстве — CSS', () => {
  const css = readFileSync(new URL('../../../../styles/player/modules/word-lane-lane-run.css', import.meta.url), 'utf8')
  it('растушёвка верха (маска на .wlLanes) на слабом убрана — движущийся слой не заставляет собирать маску каждый кадр', () => {
    expect(css).toMatch(/\.wl--lite \.wlLanes, \.weak-device \.wlLanes \{ -webkit-mask-image: none; mask-image: none; \}/)
    expect(css).toMatch(/^\.wlLanes \{[^}]*mask-image: linear-gradient/m) // у остальных устройств маска прежняя
  })
  it('сам слой узора на слабом без will-change и без filter / тени', () => {
    expect(css).toMatch(/\.wl--lite \.wlLanes i::before, \.weak-device \.wlLanes i::before \{ will-change: auto; \}/)
    expect(css).not.toMatch(/filter\s*:|box-shadow/)
  })
})

describe('режим узора «Едет / Реже / Стоит» (v3.3.387)', () => {
  it('без выбора: везде «Едет» (v3.3.388)', () => {
    const st = memStore()
    expect(readLaneMode(true, st)).toBe('move') // v3.3.388: на слабом тоже «Едет», «Реже» — только по выбору
    expect(readLaneMode(false, st)).toBe('move')
  })
  it('выбор владельца важнее умолчания (в том числе «Едет» на слабом) и переживает чтение', () => {
    const st = memStore()
    writeLaneMode('move', st); expect(readLaneMode(true, st)).toBe('move')
    writeLaneMode('still', st); expect(readLaneMode(true, st)).toBe('still'); expect(readLaneStill(st)).toBe(true)
    writeLaneMode('steps', st); expect(readLaneMode(false, st)).toBe('steps'); expect(st.getItem(LANE_MODE_KEY)).toBe('steps')
    writeLaneMode('мусор', st); expect(readLaneMode(false, st)).toBe('steps')
  })
  it('старый выбор «Стоит» (v3.3.382) читается как «Стоит» и на слабом', () => {
    const st = memStore(); st.setItem(LANE_STILL_KEY, '1')
    expect(readLaneMode(true, st)).toBe('still')
    writeLaneMode('steps', st); expect(st.getItem(LANE_STILL_KEY)).toBeNull()
  })
})
