import { describe, it, expect } from 'vitest'
import { runHeard, runVerdict, runTime, runLine, strategyLine } from './restartCards.js'
import { emptyState, startSeries, addRun, tableRows, summarizeRun } from './restartSeries.js'

const run = (over = {}) => ({ cls: 'ok', heard: 'hello', recovered: false, result: 1400, err: null, ...over })

describe('строка попытки «Попытка N из 6»', () => {
  it('успех: «Услышали: «hello»» и «✅ слышит», время до ответа', () => {
    expect(runLine(run(), 2, 6)).toBe('Попытка 3 из 6 — Услышали: «hello»')
    expect(runVerdict(run())).toEqual({ tone: 'ok', text: '✅ слышит' })
    expect(runTime(run())).toBe('ответ через 1.4 с')
    expect(runTime(run({ result: null }))).toBe('')
  })
  it('глухо: «Ничего не услышал — микрофон глухой» и «❌ глухо»', () => {
    expect(runHeard(run({ cls: 'deaf', heard: null }))).toBe('Ничего не услышал — микрофон глухой')
    expect(runVerdict(run({ cls: 'deaf' })).text).toBe('❌ глухо')
  })
  it('ошибка: «⚠ ошибка: причина» понятными словами; спасённый авто-повтором помечен', () => {
    expect(runVerdict(run({ cls: 'error', err: 'not-allowed' })).text).toBe('⚠ ошибка: нет доступа к микрофону')
    expect(runVerdict(run({ cls: 'error', err: 'weird' })).text).toBe('⚠ ошибка: weird')
    expect(runVerdict(run({ cls: 'error' })).text).toBe('⚠ ошибка')
    expect(runVerdict(run({ recovered: true })).text).toContain('авто-повтор')
  })
  it('что услышали берётся из записи журнала (tx.top1.text), причина ошибки — из первой попытки', () => {
    const att = { t: 1, run: 1, retry: 0, strategy: 'S1', outcome: 'ok', error: null, msAudio: 800, msResult: 2000, last: true, tx: { top1: { text: 'hello there' } } }
    expect(summarizeRun([att])).toMatchObject({ heard: 'hello there', err: null })
    expect(summarizeRun([{ ...att, outcome: 'error', error: 'network', tx: null }])).toMatchObject({ heard: null, err: 'network' })
  })
})

describe('strategyLine: сводка по стратегии', () => {
  it('«S1 — слышал 4 из 6, глухих 2»; нет серии — «ещё не проверяли»; ошибки и «идёт серия»', () => {
    let s = startSeries(emptyState(), 'S1', 'en-US')
    const att = (n, over) => [{ t: n, run: n, retry: 0, strategy: 'S1', outcome: 'ok', error: null, msAudio: 800, msResult: 2000, last: true, ...over }]
    const deaf = n => att(n, { outcome: 'error', error: 'silence', deaf: true, msAudio: 50, msResult: null })
    for (const n of [1, 2]) s = addRun(s, att(n))
    s = addRun(s, deaf(3))
    expect(strategyLine(tableRows(s)[0])).toBe('S1 — идёт серия, пока слышал 2 из 3, глухих 1')
    for (const n of [4, 5]) s = addRun(s, att(n))
    s = addRun(s, deaf(6))
    expect(strategyLine(tableRows(s)[0])).toBe('S1 — слышал 4 из 6, глухих 2')
    expect(strategyLine(tableRows(s)[4])).toBe('S5 — ещё не проверяли')
    expect(strategyLine({ id: 'S2', partial: false, stats: { ok: 3, n: 6, deafRuns: 0, err: 1 } })).toBe('S2 — слышал 3 из 6, глухих 0, ошибок 1')
  })
})
