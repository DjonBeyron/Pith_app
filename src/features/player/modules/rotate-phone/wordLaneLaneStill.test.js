import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readLaneStill, writeLaneStill, LANE_STILL_KEY } from './wordLaneLaneStill.js'

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }

describe('выключатель «Узор дорожек: стоит» (v3.3.382)', () => {
  it('по умолчанию узор едет; запись «стоит» и возврат', () => {
    const st = memStore()
    expect(readLaneStill(st)).toBe(false)
    writeLaneStill(true, st)
    expect(st.getItem(LANE_STILL_KEY)).toBe('1')
    expect(readLaneStill(st)).toBe(true)
    writeLaneStill(false, st)
    expect(readLaneStill(st)).toBe(false)
    expect(st.getItem(LANE_STILL_KEY)).toBeNull()
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
