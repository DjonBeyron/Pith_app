import { describe, it, expect } from 'vitest'
import { LOG_KEY, LOG_KEEP, readLog, appendLog, clearLog, dialogGuess, dialogCount } from './speechLog.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('x') } })

describe('speechLog: хранилище', () => {
  it('пусто и битый JSON → []', () => {
    expect(readLog(memStore())).toEqual([])
    expect(readLog(memStore({ [LOG_KEY]: '{oops' }))).toEqual([])
    expect(readLog(broken())).toEqual([])
  })
  it('новые сверху, хранится не больше LOG_KEEP', () => {
    const s = memStore()
    for (let i = 0; i < LOG_KEEP + 5; i++) appendLog({ t: i }, s)
    const log = readLog(s)
    expect(log.length).toBe(LOG_KEEP)
    expect(log[0].t).toBe(LOG_KEEP + 4)
  })
  it('не падает без localStorage; очистка', () => {
    expect(appendLog({ t: 1 }, broken())).toEqual([{ t: 1 }])
    const s = memStore()
    appendLog({ t: 1 }, s)
    expect(clearLog(s)).toEqual([])
    expect(readLog(s)).toEqual([])
  })
})

describe('dialogGuess', () => {
  it('prompt + звук пошёл → диалог был', () => {
    expect(dialogGuess({ permBefore: 'prompt', msStart: 50, msAudio: 3000 })).toBe('yes')
  })
  it('granted → диалога не было', () => {
    expect(dialogGuess({ permBefore: 'granted', msStart: 50, msAudio: 300 })).toBe('no')
  })
  it('без permissions API: долгий audiostart → возможно, быстрый → неизвестно', () => {
    expect(dialogGuess({ permBefore: 'unavailable', msStart: 50, msAudio: 4000 })).toBe('maybe')
    expect(dialogGuess({ permBefore: 'unavailable', msStart: 50, msAudio: 300 })).toBe('unknown')
  })
  it('звука не было → неизвестно', () => {
    expect(dialogGuess({ permBefore: 'prompt', msStart: 50 })).toBe('unknown')
  })
})

describe('dialogCount', () => {
  it('считает только записи сеанса', () => {
    const log = [{ t: 10, dialog: 'yes' }, { t: 9, dialog: 'maybe' }, { t: 1, dialog: 'yes' }, { t: 11, dialog: 'no' }]
    expect(dialogCount(log, 5)).toEqual([1, 1])
  })
})
