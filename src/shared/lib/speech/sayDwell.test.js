import { describe, it, expect, afterEach, vi } from 'vitest'
import { SAY_DWELL_KEY, readSayDwell, writeSayDwell } from './sayDwell.js'
import { matchStrict } from './sayConsensus.js'
import { DWELL_PRESETS } from './flashDwell.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
// «I'm try» стояло 280 мс, потом движок переписал на «I'm trying»
const HIST = [h(300, "I'm"), h(600, "I'm try"), h(880, "I'm trying"), h(1700, "I'm trying", true)]
const strict = () => matchStrict("I'm trying", "I'm trying", "I'm trying", HIST, [], 1, { exactWords: true })

afterEach(() => vi.unstubAllGlobals())

describe('порог мелькания для «Строго»: настройка админа pithy_say_dwell_v1', () => {
  it('нет значения / битое → 500 (как было); пресеты 0/150/300/500', () => {
    expect(SAY_DWELL_KEY).toBe('pithy_say_dwell_v1')
    expect(DWELL_PRESETS).toEqual([0, 150, 300, 500])
    expect(readSayDwell(store())).toBe(500)
    const s = store()
    s.setItem(SAY_DWELL_KEY, 'мусор')
    expect(readSayDwell(s)).toBe(500)
    expect(readSayDwell(undefined)).toBe(500) // нет localStorage (node)
    expect(readSayDwell({ getItem() { throw new Error('закрыто') } })).toBe(500)
  })
  it('запись и чтение; 0 — это значение, а не «нет»; по умолчанию ключ стирается; зажим 0–1200', () => {
    const s = store()
    expect(writeSayDwell(0, s)).toBe(0)
    expect(readSayDwell(s)).toBe(0)
    expect(writeSayDwell(300, s)).toBe(300)
    expect(s.m.get(SAY_DWELL_KEY)).toBe('300')
    expect(writeSayDwell(500, s)).toBe(500)
    expect(s.m.has(SAY_DWELL_KEY)).toBe(false)
    expect(writeSayDwell(99999, s)).toBe(1200)
  })
  it('matchStrict читает порог админа: по умолчанию 500 пропускает «try» 280 мс, порог 150 и 0 — ловят', () => {
    expect(strict().firstSeenBlocked).toEqual([]) // как сейчас
    expect(strict().passed).toBe(true)
    const s = store()
    vi.stubGlobal('localStorage', s)
    writeSayDwell(150, s)
    expect(strict().firstSeenBlocked).toEqual(['trying'])
    expect(strict().passed).toBe(false)
    writeSayDwell(300, s)
    expect(strict().passed).toBe(true) // 280 мс не дольше 300
    writeSayDwell(0, s)
    expect(strict().passed).toBe(false)
  })
  it('явный параметр порога сильнее настройки', () => {
    const s = store()
    vi.stubGlobal('localStorage', s)
    writeSayDwell(0, s)
    expect(matchStrict("I'm trying", "I'm trying", "I'm trying", HIST, [], 1, { exactWords: true }, 500).passed).toBe(true)
  })
})
