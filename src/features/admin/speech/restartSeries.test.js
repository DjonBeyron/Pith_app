import { describe, it, expect } from 'vitest'
import {
  SERIES_KEY, SERIES_SIZE, emptyState, summarizeRun, statsOf, startSeries, cancelSeries, addRun, clearResults, sanitizeState, readState, writeState,
  tableRows, rankStrategies, conclusions, seriesLines, soundCorrelation,
} from './restartSeries.js'

const att = (run, retry, over = {}) => ({ t: run * 10 + retry, run, retry, strategy: 'S1', outcome: 'ok', error: null, msAudio: 800, msResult: 2000, gapMs: 700, last: true, ...over })
const okRun = (n, s = 'S1', over = {}) => [att(n, 0, { strategy: s, ...over })]
const deafRun = (n, s = 'S1') => [att(n, 0, { strategy: s, outcome: 'error', error: 'silence', msAudio: 50, msResult: null, deaf: true, last: true })]
const errRun = (n, s = 'S1') => [att(n, 0, { strategy: s, outcome: 'error', error: 'network', msResult: null })]

function play(state, id, runs) {
  let s = startSeries(state, id, 'en-US')
  for (const r of runs) s = addRun(s, r)
  return s
}

describe('summarizeRun: один заход (нажатие) из записей журнала', () => {
  it('успех: результат с текстом, время до audiostart и result', () => {
    expect(summarizeRun(okRun(1))).toMatchObject({ cls: 'ok', first: 'ok', deafAttempts: 0, audio: 800, result: 2000, recovered: false, attempts: 1 })
  })
  it('глухой запуск без результата → deaf; first=deaf', () => {
    expect(summarizeRun(deafRun(2))).toMatchObject({ cls: 'deaf', first: 'deaf', deafAttempts: 1, audio: 50, result: null })
  })
  it('глухая попытка, а затем успех на авто-повторе (deaf_retry): ok, recovered, result берётся с успешной попытки', () => {
    const r = summarizeRun([att(3, 1, { deaf_retry: true, msAudio: 700, msResult: 1500 }), att(3, 0, { outcome: 'error', error: 'deaf', deaf: true, msAudio: 45, msResult: null, last: false })])
    expect(r).toMatchObject({ cls: 'ok', first: 'deaf', deafAttempts: 1, recovered: true, attempts: 2, audio: 45, result: 1500 })
  })
  it('ошибка без глухоты → error; «Стоп» без текста → first=stopped', () => {
    expect(summarizeRun(errRun(4)).cls).toBe('error')
    expect(summarizeRun([att(5, 0, { outcome: 'stopped', msResult: null })])).toMatchObject({ cls: 'error', first: 'stopped' })
    expect(summarizeRun([att(6, 0, { outcome: 'error', error: 'silence', msResult: null })]).first).toBe('quiet')
  })
})

describe('серия: 6 нажатий, итог по стратегии', () => {
  it('идёт до 6 заходов и закрывается, итог заменяет прежний по этой стратегии', () => {
    let s = startSeries(emptyState(), 'S3', 'en-US')
    for (let i = 1; i < SERIES_SIZE; i++) s = addRun(s, okRun(i, 'S3'))
    expect(s.active.runs).toHaveLength(SERIES_SIZE - 1)
    expect(s.results.S3).toBeUndefined()
    s = addRun(s, deafRun(6, 'S3'))
    expect(s.active).toBeNull()
    expect(statsOf(s.results.S3.runs)).toMatchObject({ n: 6, ok: 5, deafRuns: 1, deaf: 1 })
    const again = play(s, 'S3', Array.from({ length: 6 }, (_, i) => okRun(i + 1, 'S3')))
    expect(statsOf(again.results.S3.runs).ok).toBe(6)
  })
  it('нажатия другой стратегии и вне серии не учитываются; отмена сбрасывает серию', () => {
    expect(addRun(emptyState(), okRun(1))).toEqual(emptyState())
    const s = startSeries(emptyState(), 'S2', 'en-US')
    expect(addRun(s, okRun(1, 'S4'))).toBe(s)
    expect(cancelSeries(addRun(s, okRun(1, 'S2'))).active).toBeNull()
  })
  it('статистика: средние audiostart/result, число глухих запусков и попыток, спасённые', () => {
    const st = statsOf([
      summarizeRun(okRun(1, 'S1', { msAudio: 600, msResult: 1000 })), summarizeRun(okRun(2, 'S1', { msAudio: 1000, msResult: 3000 })), summarizeRun(deafRun(3)),
    ])
    expect(st).toMatchObject({ n: 3, ok: 2, deaf: 1, deafRuns: 1, deafAttempts: 1, audio: 550, result: 2000 })
  })
})

describe('таблица, лучшая стратегия и выводы', () => {
  // S1 как у пользователя: 3 из 6, три глухих; S3 — 6 из 6
  const build = () => {
    let s = emptyState()
    s = play(s, 'S1', [okRun(1), deafRun(2), okRun(3), deafRun(4), okRun(5), deafRun(6)])
    s = play(s, 'S3', Array.from({ length: 6 }, (_, i) => okRun(i + 1, 'S3', { msResult: 2500 })))
    return s
  }
  it('строки S1…S7, нет данных → stats null; идущая серия помечена partial', () => {
    const rows = tableRows(startSeries(build(), 'S2', 'en-US'))
    expect(rows.map(r => r.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'])
    expect(rows[0].stats).toMatchObject({ ok: 3, deafRuns: 3 })
    expect(rows[1]).toMatchObject({ partial: true, stats: { n: 0 } })
    expect(rows[3].stats).toBeNull()
  })
  it('лучшая — по успешным, потом по глухим, потом по скорости; выводы называют S3 и сравнивают с S1', () => {
    expect(rankStrategies(build()).map(r => r.id)).toEqual(['S3', 'S1'])
    const c = conclusions(build())
    expect(c[0]).toBe('Лучшая: S3 — 6 из 6 успешных, глухих запусков 0, до result ≈ 2.5 с.')
    expect(c[1]).toBe('S1 (как сейчас): 3 из 6, глухих 3 — проблема воспроизводится. S3 лучше на 3 успешных.')
    expect(c.at(-1)).toBe('Серии нет для: S2, S4, S5, S6, S7.')
  })
  it('S1 без глухих — проблема не воспроизвелась; пусто — подсказка', () => {
    const s = play(emptyState(), 'S1', Array.from({ length: 6 }, (_, i) => okRun(i + 1)))
    expect(conclusions(s).join(' ')).toContain('проблема не воспроизвелась')
    expect(conclusions(emptyState())[0]).toContain('Данных нет')
  })
  it('равенство стратегий не выдумывает победителя', () => {
    let s = play(emptyState(), 'S1', Array.from({ length: 6 }, (_, i) => okRun(i + 1)))
    s = play(s, 'S2', Array.from({ length: 6 }, (_, i) => okRun(i + 1, 'S2')))
    expect(conclusions(s)[0]).toContain('S1 = S2')
  })
  it('«Скопировать итог»: строка на стратегию, заходы по порядку, спасённые звёздочкой, выводы', () => {
    const rescued = [att(2, 1, { deaf_retry: true }), att(2, 0, { outcome: 'error', error: 'deaf', deaf: true, msAudio: 40, msResult: null, last: false })]
    const s = play(emptyState(), 'S5', [okRun(1, 'S5'), rescued.map(e => ({ ...e, strategy: 'S5' }))])
    const t = seriesLines(s, 'en-US')
    expect(t[0]).toBe('СЕРИЯ СТРАТЕГИЙ ПЕРЕЗАПУСКА (по 6 нажатий) · en-US')
    expect(t.find(l => l.startsWith('S5 (идёт)'))).toContain('2/2 ок | глухих 1 (попыток 1)')
    expect(t.find(l => l.startsWith('S5'))).toContain('ок ок*')
    expect(t.find(l => l.startsWith('S1'))).toBe('S1 | нет данных')
    expect(t.join('\n').length).toBeLessThan(1500)
  })
})

describe('хранение', () => {
  it('запись/чтение, мусор и битый JSON → пусто', () => {
    const m = new Map()
    const store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
    const s = play(emptyState(), 'S4', [okRun(1, 'S4')])
    writeState(s, store)
    expect(readState(store)).toEqual(s)
    m.set(SERIES_KEY, '{bad')
    expect(readState(store)).toEqual(emptyState())
    expect(sanitizeState({ results: { S9: { runs: [] }, S2: { runs: [{ cls: 'zzz' }, { cls: 'ok' }] } }, active: { strategy: 'zz', runs: [] } }))
      .toEqual({ active: null, results: { S2: { at: null, lang: '', runs: [{ cls: 'ok' }] } } })
    expect(clearResults(s).results).toEqual({})
  })
})

describe('звуки до записи в итоге серии', () => {
  const snd = (n, s, audioBefore, over = {}) => okRun(n, s, { audioBefore, ...over })
  const deafSnd = (n, s, audioBefore) => deafRun(n, s).map(a => ({ ...a, audioBefore }))

  it('корреляция: глухие заходы после звука и после тишины считаются отдельно; нет данных о звуках → null', () => {
    const runs = [snd(1, 'S6', ''), snd(2, 'S6', 'audio-play'), deafSnd(3, 'S6', 'unlock-wav'), deafSnd(4, 'S6', 'audio-play×2'), snd(5, 'S6', '')].map(summarizeRun)
    expect(soundCorrelation(runs)).toEqual({ sound: { n: 3, deaf: 2 }, quiet: { n: 2, deaf: 0 } })
    expect(soundCorrelation([summarizeRun(okRun(1))])).toBe(null)
  })

  it('«Скопировать итог»: по стратегии — звуки каждого захода и корреляция; в выводах — общая строка про гипотезу аудиосессии', () => {
    const runs = [snd(1, 'S1', ''), deafSnd(2, 'S1', 'audio-play'), snd(3, 'S1', ''), deafSnd(4, 'S1', 'unlock-wav'), snd(5, 'S1', ''), snd(6, 'S1', 'audio-play')]
    const st = play(emptyState(), 'S1', runs)
    const text = seriesLines(st, 'en-US').join('\n')
    expect(text).toContain('звуки до записи: 1) нет; 2) audio-play; 3) нет; 4) unlock-wav; 5) нет; 6) audio-play | глухо после звука: 2 из 3; после тишины: 0 из 3')
    expect(conclusions(st).find(c => c.startsWith('Звуки до записи'))).toContain('гипотеза аудиосессии подтверждается')
  })

  it('без данных о звуках (старые записи) строк про звуки нет', () => {
    const st = play(emptyState(), 'S1', Array.from({ length: 6 }, (_, i) => okRun(i + 1)))
    expect(seriesLines(st).join('\n')).not.toContain('звуки до записи')
    expect(conclusions(st).some(c => c.startsWith('Звуки до записи'))).toBe(false)
  })
})
