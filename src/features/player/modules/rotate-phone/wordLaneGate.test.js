import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitWarmGate, warmProgress, warmLabel, gateSize, GATE_MIN, GATE_MAX_MS } from './wordLaneGate.js'
import { settle, clearSettled } from './wordLaneSettled.js'

// Ворота запуска игры: пускают, когда готовы первые N файлов (реплики первых секунд + куски первой ступени, минимум 5) или все; потолок 8 с с тапа; прогресс «Готовлю звук… 7/15»
const items = n => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, url: `https://r2/${i}.mp3` }))
const done = (list, from, to, result = 'ok') => list.slice(from, to).forEach(i => settle(i.url, result))
let logs
beforeEach(() => { clearSettled(); logs = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); clearSettled() })
const gate = (list, opts = {}, deps = {}) => waitWarmGate({ items: list, ...opts }, { log: m => logs.push(m), ...deps })

describe('сколько файлов нужно к старту', () => {
  it('нужное первым стадиям, но не меньше GATE_MIN (5) и не больше всего набора', () => {
    expect(GATE_MIN).toBe(5)
    expect(gateSize(2, 15)).toBe(5)
    expect(gateSize(8, 15)).toBe(8)
    expect(gateSize(3, 4)).toBe(4) // набор короче минимума — весь набор
    expect(gateSize(40, 15)).toBe(15)
    expect(gateSize(0, 0)).toBe(0)
  })
})

describe('прогресс и подпись кнопки', () => {
  it('«Готовлю звук… 7/15»: считает обработанные файлы набора; fail тоже обработан; одинаковые ссылки — один файл', () => {
    const list = [...items(15), { key: 'dup', url: 'https://r2/0.mp3' }]
    done(list, 0, 6)
    settle(list[6].url, 'fail')
    const p = warmProgress(list, 3)
    expect(p).toMatchObject({ done: 7, ok: 6, total: 15, firstN: 5, open: true, all: false })
    expect(warmLabel(p)).toBe('Готовлю звук… 7/15')
    expect(warmLabel({ done: 0, total: 0 })).toBe('Готовлю звук…') // список файлов ещё неизвестен
  })
  it('ворота закрыты, пока не готовы именно ПЕРВЫЕ N по порядку (готовые из хвоста не в счёт)', () => {
    const list = items(15)
    done(list, 5, 15) // хвост готов, начало — нет
    expect(warmProgress(list, 3).open).toBe(false)
    done(list, 0, 4)
    expect(warmProgress(list, 3).open).toBe(false) // не хватает пятого
    done(list, 4, 5)
    expect(warmProgress(list, 3).open).toBe(true)
  })
})

describe('waitWarmGate', () => {
  it('открывается по ПЕРВЫМ N: остальное докачивается фоном; журнал «[warm] готово N/M за X мс, ворота открыты по: первые N»', async () => {
    const list = items(15)
    let result = null
    gate(list, { firstCount: 2 }).then(r => { result = r })
    done(list, 0, 4); await vi.advanceTimersByTimeAsync(100)
    expect(result).toBeNull()
    done(list, 4, 5); await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({ by: 'first', firstN: 5, total: 15 })
    expect(logs).toEqual([expect.stringMatching(/^\[warm\] готово 5\/15 за \d+ мс, ворота открыты по: первые 5$/)])
  })

  it('открывается по ВСЕМ, если к тапу готово всё (сразу, без ожидания)', async () => {
    const list = items(8)
    done(list, 0, 8)
    const r = await gate(list, { firstCount: 3 })
    expect(r).toMatchObject({ by: 'all', done: 8, total: 8, missing: [] })
    expect(logs[0]).toMatch(/готово 8\/8 .*по: все$/)
  })

  it('набор короче минимума: ждём весь набор', async () => {
    const list = items(3)
    let result = null
    gate(list, { firstCount: 1 }).then(r => { result = r })
    done(list, 0, 2); await vi.advanceTimersByTimeAsync(50)
    expect(result).toBeNull()
    done(list, 2, 3); await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({ by: 'all', firstN: 3 })
  })

  it('таймаут GATE_MAX_MS с тапа: стартуем с тем, что есть, в журнале — что именно не готово', async () => {
    const list = items(15)
    done(list, 0, 3)
    let result = null
    gate(list, { firstCount: 2 }).then(r => { result = r })
    await vi.advanceTimersByTimeAsync(GATE_MAX_MS - 10)
    expect(result).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(result).toMatchObject({ by: 'timeout', done: 3, total: 15, ms: GATE_MAX_MS })
    expect(result.missing).toHaveLength(12)
    expect(result.missing.slice(0, 2)).toEqual(['k3', 'k4'])
    expect(logs[0]).toMatch(/готово 3\/15 за 8000 мс, ворота открыты по: таймаут; не готово: k3, k4, k5/)
  })

  it('потолок считается с тапа: сколько уже прошло (sinceTapMs) вычитается', async () => {
    const list = items(10)
    let result = null
    gate(list, { firstCount: 2, sinceTapMs: 1500 }).then(r => { result = r })
    await vi.advanceTimersByTimeAsync(GATE_MAX_MS - 1500 - 10)
    expect(result).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(result).toMatchObject({ by: 'timeout' })
  })

  it('не вышло скачать/декодировать (fail) — файл обработан: ворота не ждут то, что не придёт; в журнале «не вышло»', async () => {
    const list = items(6)
    done(list, 0, 4); settle(list[4].url, 'fail')
    const r = await gate(list, { firstCount: 1 })
    expect(r).toMatchObject({ by: 'first', ok: 4, failed: ['k4'] })
    expect(logs[0]).toContain('не вышло: k4')
  })

  it('пустой набор — открыто сразу; после открытия поздние события ворота не трогают (один результат, один журнал)', async () => {
    expect(await gate([], {})).toMatchObject({ by: 'all', total: 0 })
    const list = items(5)
    const p = gate(list, { firstCount: 1 })
    done(list, 0, 5)
    await p
    settle(list[0].url, 'fail'); await vi.advanceTimersByTimeAsync(GATE_MAX_MS + 10)
    expect(logs).toHaveLength(2)
  })
})
