import { describe, it, expect } from 'vitest'
import { swapFace, BLINK_CLOSE_MS } from './miaFaceSwap.js'

const head = (withEyes = true) => { const eyes = { style: {}, getBoundingClientRect: () => ({}) }; return { style: { display: '' }, eyes, querySelector: sel => (withEyes && sel === '.cat-eyes' ? eyes : null) } }

describe('смена лица Мии через моргание', () => {
  it('старые глаза смыкаются, на сомкнутых головы подменяются, новые раскрываются; наложения нет', () => {
    const a = head(), b = head(); b.style.display = 'none'
    const timers = []; let done = 0
    swapFace(a, b, { later: (fn, ms) => timers.push({ fn, ms }), done: () => done++ })
    expect(a.eyes.style.transform).toBe('scaleY(0.06)'); expect(a.style.display).toBe(''); expect(b.style.display).toBe('none'); expect(done).toBe(0)
    expect(timers).toHaveLength(1); expect(timers[0].ms).toBeGreaterThanOrEqual(BLINK_CLOSE_MS)
    timers[0].fn()
    expect(a.style.display).toBe('none'); expect(b.style.display).toBe(''); expect(done).toBe(1)
    expect(a.eyes.style.transform).toBe(''); expect(b.eyes.style.transform).toBe(''); expect(b.eyes.style.transition).toContain('ease-out')
  })
  it('без глаз в голове — жёсткая смена сразу (запасной путь)', () => {
    const a = head(false), b = head(false); b.style.display = 'none'; let done = 0
    swapFace(a, b, { later: () => { throw new Error('таймер не нужен') }, done: () => done++ })
    expect(a.style.display).toBe('none'); expect(b.style.display).toBe(''); expect(done).toBe(1)
  })
})
