import { describe, it, expect } from 'vitest'
import { RUN_KEY, LINES_MAX, loadRun, saveRun, clearRun } from './gameVolumeRunStore.js'

const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const base = { idx: 3, orig: { hold: 'none', sess: 'auto', nudge: 'off' }, results: [{ item: { n: 1 }, answers: { loud: 'тихо' }, ok: true }], lines: ['a', 'b'] }

describe('сохранение прогона громкости', () => {
  it('сохраняет номер захода, ответы, настройки «до» и журнал; читает обратно', () => {
    const s = memStore()
    expect(saveRun(base, s)).toBe(true)
    expect(loadRun(s)).toEqual({ v: 1, idx: 3, orig: base.orig, done: false, results: [{ n: 1, answers: { loud: 'тихо' }, ok: true }], lines: ['a', 'b'] })
    saveRun({ ...base, done: true }, s); expect(loadRun(s).done).toBe(true)
  })
  it('журнал обрезается до LINES_MAX последних строк', () => {
    const s = memStore()
    saveRun({ ...base, lines: Array.from({ length: LINES_MAX + 5 }, (_, i) => `l${i}`) }, s)
    const l = loadRun(s).lines
    expect(l).toHaveLength(LINES_MAX); expect(l.at(-1)).toBe(`l${LINES_MAX + 4}`)
  })
  it('мусор, чужая версия, пустое хранилище, исключения — null/false, без падения', () => {
    const s = memStore()
    expect(loadRun(s)).toBeNull()
    s.setItem(RUN_KEY, '{oops'); expect(loadRun(s)).toBeNull()
    s.setItem(RUN_KEY, JSON.stringify({ v: 2, idx: 1, orig: {}, results: [], lines: [] })); expect(loadRun(s)).toBeNull()
    expect(saveRun(base, { setItem() { throw new Error('quota') } })).toBe(false)
    expect(loadRun({ getItem() { throw new Error('x') } })).toBeNull()
  })
  it('clearRun удаляет запись', () => {
    const s = memStore(); saveRun(base, s); clearRun(s)
    expect(loadRun(s)).toBeNull()
    expect(() => clearRun({ removeItem() { throw new Error('x') } })).not.toThrow()
  })
})
