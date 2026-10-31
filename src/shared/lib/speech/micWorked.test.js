import { describe, it, expect, afterEach } from 'vitest'
import { micWorked, MIC_GRANTED_KEY, DENIED_KEY } from './micWorked.js'
import { createSayPermission } from './sayPermission.js'

// Флаг «микрофон работал» из игры (gameMic.js → micWorked) виден «Скажи фразу» (sayPermission), хотя игра не тянет за собой проверку нативного SpeechRecognition
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m } }
afterEach(() => { micWorked.reset(); delete globalThis.localStorage; delete globalThis.sessionStorage })

describe('micWorked', () => {
  it('markOk: в запуске микрофон работал + флаг в localStorage; markDenied: флаг снят, отказ в sessionStorage; reset сбрасывает запуск', () => {
    const local = store(); const session = store()
    globalThis.localStorage = local; globalThis.sessionStorage = session
    micWorked.markOk()
    expect(micWorked.isOk()).toBe(true)
    expect(local.m.get(MIC_GRANTED_KEY)).toBe('1')
    micWorked.markDenied()
    expect(micWorked.isOk()).toBe(false)
    expect(local.m.has(MIC_GRANTED_KEY)).toBe(false)
    expect(session.m.get(DENIED_KEY)).toBe('1')
    micWorked.markOk(); micWorked.reset()
    expect(micWorked.isOk()).toBe(false)
  })

  it('sayPermission с shared видит «микрофон работал», выставленный игрой; без shared (тесты) — только своё; resetHints сбрасывает и общее', () => {
    const own = createSayPermission({ local: store(), session: store(), shared: micWorked })
    const alone = createSayPermission({ local: store(), session: store() })
    expect(own.isMicOk()).toBe(false)
    micWorked.markOk()
    expect(own.isMicOk()).toBe(true)
    expect(own.access().sessionOk).toBe(true)
    expect(alone.isMicOk()).toBe(false)
    own.resetHints()
    expect(own.isMicOk()).toBe(false)
  })
})
