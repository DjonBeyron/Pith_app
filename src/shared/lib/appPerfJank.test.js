import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { logJank, JANK_LOG_MS, scanAllowed, SCAN_BLOCK } from './appPerfProbe.js'

describe('журнал фризов (v3.3.278)', () => {
  it('пишет длину кадра и три последние строки журнала без [perf]/[suspects]/mic-hold', () => {
    const lines = [' 100.0 21:00:00.100 [race] a', ' 200.0 21:00:00.200 [perf] fps=60', ' 300.0 21:00:00.300 [mic] b', ' 400.0 21:00:00.400 [note] mic-hold {}', ' 500.0 21:00:00.500 [cat] c', ' 600.0 21:00:00.600 [speech] d']
    const log = vi.fn(); logJank(842.4, () => lines, log)
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toBe('[jank] кадр 842 мс; перед ним: [mic] b ‖ [cat] c ‖ [speech] d')
    expect(JANK_LOG_MS).toBe(300)
  })
  it('пустой журнал и сбой чтения не ломают игру', () => {
    const log = vi.fn(); logJank(400, () => [], log); expect(log.mock.calls[0][0]).toContain('—')
    expect(() => logJank(400, () => { throw new Error('x') }, log)).not.toThrow()
  })
})

describe('периодический скан DOM не идёт под игрой (журнал 2026-11-25: кадр ≈ 100 мс раз в 10 с)', () => {
  const doc = (open, hidden = false) => ({ hidden, querySelector: sel => (sel.split(', ').some(x => open.includes(x)) ? {} : null) })
  it('урок или игра открыты — скана нет; свёрнуто — нет; обычный экран — есть', () => {
    expect(SCAN_BLOCK.split(', ')).toEqual(['.lessonPlayer', '.wl'])
    expect(scanAllowed(doc([]))).toBe(true)
    expect(scanAllowed(doc(['.wl']))).toBe(false)
    expect(scanAllowed(doc(['.lessonPlayer']))).toBe(false)
    expect(scanAllowed(doc([], true))).toBe(false)
  })
  it('таймер датчика спрашивает scanAllowed; корень игры — .wl', () => {
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    expect(read('./appPerfProbe.js')).toContain("if (scanAllowed() && ++seconds % SUSPECTS_EVERY === 0) suspects('tick')")
    expect(read('../../features/player/modules/rotate-phone/WordLaneGame.jsx')).toContain("className={safe0 ? 'wl wl--safe' : 'wl'}")
  })
})
