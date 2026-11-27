import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMiaProbe, profileLine, PROBE_AFTER_MS } from './miaProbe.js'
import { bufferProfile } from '../../player/modules/rotate-phone/wordLaneBuffers.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')
// буфер: sr 1000 Гц (1 отсчёт = 1 мс); сегменты [мс, амплитуда]
const buf = segs => { const a = []; for (const [ms, amp] of segs) for (let i = 0; i < ms; i++) a.push(amp * (i % 2 ? 1 : -1)); return { sampleRate: 1000, getChannelData: () => Float32Array.from(a) } }

describe('профиль начала озвучки Мии (журнал «файл или игра»)', () => {
  it('файл «всплеск — тишина — слово» виден в профиле: первый звук с 0, тишина с 200 мс на 400 мс', () => {
    const p = bufferProfile(buf([[200, 0.2], [400, 0], [800, 0.3]]), { winMs: 100, maxMs: 2000 })
    expect(p.first).toBe(0); expect(p.quiet).toEqual({ from: 200, ms: 400 }); expect(p.db.length).toBe(14); expect(p.db[0]).toBeGreaterThan(-20); expect(p.db[3]).toBe(-99)
  })
  it('файл без паузы в начале: тишины внутри нет; пустой буфер — null', () => {
    const p = bufferProfile(buf([[2000, 0.1]])); expect(p.quiet).toBeNull(); expect(p.first).toBe(0)
    expect(bufferProfile(null)).toBeNull(); expect(bufferProfile({ sampleRate: 0, getChannelData: () => new Float32Array(0) })).toBeNull()
  })
  it('строка профиля: id, длина буфера, offset 0, окна, тишина; без буфера — пометка про <audio>', () => {
    const l = profileLine({ id: 'boss_mia_yellow', ms: 4859, profile: bufferProfile(buf([[200, 0.2], [400, 0], [1400, 0.3]])) })
    expect(l).toContain('boss_mia_yellow'); expect(l).toContain('буфер 4859 мс, offset 0'); expect(l).toContain('с 200 мс на 400 мс')
    expect(profileLine({ id: 'x', ms: 1, profile: null })).toContain('буфера нет')
  })
  it('проба: одна строка профиля сразу + одна строка часов через 100 мс; выключена — тихо', () => {
    vi.useFakeTimers(); const log = vi.fn(); let c = 10, t = 0
    const probe = createMiaProbe({ enabled: () => true, profileOf: () => bufferProfile(buf([[2000, 0.1]])), ctxTime: () => c, now: () => t, log })
    probe({ id: 'boss_mia_green', key: 'line:boss_mia_green', ms: 4441 }); expect(log).toHaveBeenCalledTimes(1)
    c = 10.1; t = 100; vi.advanceTimersByTime(PROBE_AFTER_MS); expect(log).toHaveBeenCalledTimes(2); expect(log.mock.calls[1][0]).toContain('прошли 100 мс (должны ≈ 100)')
    const off = vi.fn(); createMiaProbe({ enabled: () => false, log: off })({ id: 'a', key: 'b', ms: 1 }); vi.advanceTimersByTime(500); expect(off).not.toHaveBeenCalled(); vi.useRealTimers()
  })
  it('проводка: реплика Мии зовёт пробу в момент старта звука; пробу собирает useExamSpeech', () => {
    expect(rd('./miaSpeech.js')).toContain('probe?.({ id: c.id, key, ms })'); expect(rd('../boss/useExamSpeech.js')).toContain('probe: createMiaProbe(')
  })
})
