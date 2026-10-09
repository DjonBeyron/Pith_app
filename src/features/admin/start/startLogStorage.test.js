import { describe, it, expect, beforeEach } from 'vitest'
import { parseStartLogs, readStartLogs, clearStartLogs, START_LOGS_KEY } from './startLogStorage.js'
import { goodRec, badRec } from './startLogFixtures.js'

describe('parseStartLogs', () => {
  it('нормализует поля, отбрасывает мусор, сортирует старые первыми', () => {
    const raw = JSON.stringify([badRec(), null, 5, { id: 'без ev' }, { id: 'a', ev: [] }, goodRec()])
    const list = parseStartLogs(raw)
    expect(list.map(r => r.id)).toEqual(['2026-10-09T10:00:00.000Z', '2026-10-09T10:05:00.000Z', 'a'])
    const a = list.find(r => r.id === 'a')
    expect(a).toMatchObject({ ctx: {}, drop: {}, cut: {}, splash: [] })
  })
  it('битый JSON и не-массив → []', () => {
    expect(parseStartLogs('{не json')).toEqual([])
    expect(parseStartLogs('{"a":1}')).toEqual([])
    expect(parseStartLogs(null)).toEqual([])
  })
})

describe('readStartLogs / clearStartLogs', () => {
  const store = {}
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] } }
    globalThis.window = globalThis
    delete globalThis.__startLog
    delete globalThis.__startLogOff
  })

  it('читает сохранённое', () => {
    store[START_LOGS_KEY] = JSON.stringify([goodRec()])
    expect(readStartLogs()).toHaveLength(1)
  })
  it('если хранилище пустое, но есть живой журнал страницы — показываем его', () => {
    globalThis.__startLog = goodRec()
    expect(readStartLogs().map(r => r.id)).toEqual(['2026-10-09T10:00:00.000Z'])
  })
  it('живой журнал не дублирует уже сохранённый', () => {
    store[START_LOGS_KEY] = JSON.stringify([goodRec()])
    globalThis.__startLog = goodRec()
    expect(readStartLogs()).toHaveLength(1)
  })
  it('очистка стирает ключ, отключает дальнейшую запись скриптом и убирает живой журнал', () => {
    store[START_LOGS_KEY] = JSON.stringify([goodRec()])
    globalThis.__startLog = goodRec()
    clearStartLogs()
    expect(store[START_LOGS_KEY]).toBeUndefined()
    expect(globalThis.__startLogOff).toBe(true)
    expect(readStartLogs()).toEqual([])
  })
  it('localStorage бросает — пустой список', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(readStartLogs()).toEqual([])
    expect(() => clearStartLogs()).not.toThrow()
  })
})
