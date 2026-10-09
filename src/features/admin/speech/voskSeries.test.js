import { describe, it, expect } from 'vitest'
import { emptyState, sanitizeState, readState, writeState, makeRun, addRun, latestRun, pairOf, MAX_RUNS, VOSK_SERIES_KEY } from './voskSeries.js'
import { kindSummary, stepMarks, summaryLines, timingStats, condRows } from './voskSummary.js'
import { buildSeriesReport, runLine, VOSK_SERIES_MAX } from './voskSeriesReport.js'
import { ctxSpec, pairSpec, PAIR_PRESETS } from './voskGrammar.js'
import { trapSpec, silenceSpec } from './voskTraps.js'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
// Подставной результат Vosk: слова с conf и временем
const stats = (words, extra = {}) => ({ firstPartialMs: 1640, resultMs: 2684, readyMs: 380, micMs: 300, audioStartMs: 120, stopBy: 'auto', words, ...extra })
const w = (word, conf, start, end) => ({ word, conf, start, end })

describe('прогон', () => {
  it('сказал «try» (ошибка) — услышали «try»: как сказано, уверенность и тайминги', () => {
    const r = makeRun(ctxSpec(0, 'error', 'phrases'), 'try', stats([w('try', 1, 0.75, 1.53)]), { style: 'phrases', cond: 'whisper' }, 1000)
    expect(r).toMatchObject({ kind: 'ctx', mode: 'error', step: 0, out: 'asis', sw: null, kc: 1, cond: 'whisper', style: 'phrases', heard: 'try', said: 'try' })
    expect(r.tm).toEqual({ fp: 1640, res: 2684, tap: 380, mic: 300, end: 2684 - 120 - 1530, by: 'auto' })
  })
  it('сказал «I\'m try» — услышали «I\'m trying»: принял за trying, уверенность подменённого слова', () => {
    const r = makeRun(ctxSpec(1, 'error', 'words'), "i'm trying", stats([w("i'm", 0.9, 0.2, 0.5), w('trying', 0.71, 0.5, 1.2)]), { style: 'words' })
    expect(r).toMatchObject({ out: 'swapped', sw: 'trying', kc: 0.71, style: 'words' })
  })
  it('ловушка: «tried» → [unk]; тишина → пусто; принудительное «try» — ложное принятие с conf', () => {
    expect(makeRun(trapSpec('tried'), '[unk]', stats([w('[unk]', 0.5, 0, 1)])).out).toBe('rejected')
    expect(makeRun(silenceSpec(), '', {}).out).toBe('empty')
    const bad = makeRun(trapSpec('train'), 'try', stats([w('try', 0.62, 0, 1)]))
    expect(bad).toMatchObject({ out: 'accepted', sw: 'try', kc: 0.62 })
  })
  it('пара go/goes: ключ goes; контроль «He goes…» → «He go…» — ложная тревога', () => {
    const p = PAIR_PRESETS[0]
    expect(makeRun(pairSpec(p, 'error', 'phrases'), 'he go to school', stats([w('go', 0.8, 0.5, 0.9)])).out).toBe('asis')
    const c = makeRun(pairSpec(p, 'control', 'phrases'), 'he go to school', stats([w('go', 0.8, 0.5, 0.9)]))
    expect(c).toMatchObject({ mode: 'control', out: 'swapped', sw: 'go' })
  })
  it('нет слов от движка — уверенности нет, ничего не падает', () => {
    const r = makeRun(ctxSpec(0, 'error', 'phrases'), 'try', {})
    expect(r.ws).toEqual([])
    expect(r.kc).toBeNull()
    expect(r.tm.end).toBeNull()
  })
})

describe('состояние', () => {
  it('прогоны копятся, но не больше MAX_RUNS', () => {
    let s = emptyState()
    for (let i = 0; i < MAX_RUNS + 20; i++) s = addRun(s, makeRun(trapSpec('hello'), '[unk]', {}, {}, i))
    expect(s.runs).toHaveLength(MAX_RUNS)
    expect(s.runs[0].t).toBe(20)
  })
  it('сохранение и чтение; мусор → значения по умолчанию', () => {
    const store = mem()
    let s = { ...emptyState(), style: 'words', cond: 'noise', autoStop: 1000, session: true }
    s = addRun(s, makeRun(ctxSpec(0, 'error', 'words'), 'try', {}))
    writeState(s, store)
    expect(JSON.parse(store.getItem(VOSK_SERIES_KEY)).style).toBe('words')
    expect(readState(store)).toMatchObject({ style: 'words', cond: 'noise', autoStop: 1000, session: true })
    expect(readState(store).runs).toHaveLength(1)
    expect(readState(mem({ [VOSK_SERIES_KEY]: '{bad' }))).toEqual(emptyState())
    const bad = sanitizeState({ style: 'x', cond: 'y', autoStop: 'z', tab: 'q', step: 9, pair: 'nope', runs: [1, null, { kind: 'ctx' }], pairs: { goes: { ok: '', bad: 'x' } }, trapWords: ['try', 'Hello', 5] })
    expect(bad).toMatchObject({ style: 'phrases', cond: 'normal', autoStop: 800, tab: 'ctx', step: 0, pair: 'goes', runs: [], pairs: {}, trapWords: ['hello'] })
  })
  it('правки пары поверх пресета', () => {
    const s = { ...emptyState(), pairs: { goes: { ok: 'She goes home', bad: 'She go home' } } }
    expect(pairOf(s, 'goes')).toMatchObject({ ok: 'She goes home', label: 'go / goes' })
    expect(pairOf(s, 'has').ok).toBe('She has a cat')
  })
  it('последний прогон по фильтру', () => {
    let s = emptyState()
    s = addRun(s, makeRun(ctxSpec(1, 'error', 'phrases'), "i'm trying", {}, { style: 'phrases' }, 1))
    s = addRun(s, makeRun(ctxSpec(1, 'error', 'phrases'), "i'm try", {}, { style: 'phrases' }, 2))
    expect(latestRun(s.runs, { kind: 'ctx', step: 1, mode: 'error', style: 'phrases' }).t).toBe(2)
    expect(latestRun(s.runs, { kind: 'ctx', step: 1, mode: 'control', style: 'phrases' })).toBeNull()
  })
})

// 4 шага × 2 режима × 2 стиля, условия, ловушки, пары, тайминги
function fixture() {
  let s = emptyState()
  const add = (spec, text, ws, ctx, tm) => { s = addRun(s, makeRun(spec, text, stats(ws, tm), ctx, s.runs.length + 1)) }
  const P = { style: 'phrases', cond: 'normal' }
  // «Фразы целиком»: ошибки — 3 из 4 пойманы (шаг 3 подменён); контроль — 1 ложная тревога
  ;['try', "i'm try", "i'm trying to please", "i'm try to please both"].forEach((t, i) => add(ctxSpec(i, 'error', 'phrases'), t, [w(t.includes('trying') ? 'trying' : 'try', 0.8 + i / 20, 0.5, 1.2)], P, { firstPartialMs: 1000 + i * 100, resultMs: 2000 + i * 500 }))
  ;['trying', "i'm trying", "i'm try to please", "i'm trying to please both"].forEach((t, i) => add(ctxSpec(i, 'control', 'phrases'), t, [w(t.includes('try ') ? 'try' : 'trying', 0.9, 0.5, 1.2)], { ...P, cond: i < 2 ? 'whisper' : 'normal' }, {}))
  // «По словам»: все ошибки подменены
  ;[0, 1].forEach(i => add(ctxSpec(i, 'error', 'words'), 'trying', [w('trying', 0.6, 0.5, 1.1)], { style: 'words', cond: 'fast' }, {}))
  // ловушки: 2 ок, 1 ложное принятие; тишина ок
  add(trapSpec('tried'), '[unk]', [w('[unk]', 0.4, 0, 1)], P)
  add(trapSpec('hello'), '[unk]', [], P)
  add(trapSpec('train'), 'try', [w('try', 0.5, 0, 1)], P)
  add(silenceSpec(), '', [], P)
  // пара
  add(pairSpec(PAIR_PRESETS[0], 'error', 'phrases'), 'he go to school', [w('go', 0.7, 0.4, 0.8)], { style: 'phrases', cond: 'quiet' })
  add(pairSpec(PAIR_PRESETS[0], 'control', 'phrases'), 'he goes to school', [w('goes', 0.95, 0.4, 0.8)], { style: 'phrases', cond: 'quiet' })
  return s
}

describe('сводки', () => {
  const s = fixture()
  it('A: поймано ошибок X из N, ложных тревог Y из M — раздельно по стилям', () => {
    expect(kindSummary(s.runs, 'ctx', 'phrases')).toEqual({ nErr: 4, caught: 3, swapped: 1, nCtl: 4, falseAlarms: 1, okCtl: 3 })
    expect(kindSummary(s.runs, 'ctx', 'words')).toEqual({ nErr: 2, caught: 0, swapped: 2, nCtl: 0, falseAlarms: 0, okCtl: 0 })
    expect(stepMarks(s.runs, 'phrases', 'error')).toBe('1✅ 2✅ 3⚠ 4✅')
    expect(stepMarks(s.runs, 'words', 'control')).toBe('1– 2– 3– 4–')
  })
  it('D: условие → понято X из N (ошибки/контроль)', () => {
    const rows = condRows(s.runs)
    expect(rows.find(r => r.id === 'whisper')).toMatchObject({ n: 2, ok: 2, ctl: { n: 2, ok: 2 }, err: { n: 0, ok: 0 } })
    expect(rows.find(r => r.id === 'fast')).toMatchObject({ n: 2, ok: 0 })
    expect(rows.find(r => r.id === 'quiet')).toMatchObject({ n: 2, ok: 2, err: { n: 1, ok: 1 }, ctl: { n: 1, ok: 1 } })
    expect(rows.find(r => r.id === 'noise')).toBeUndefined()
  })
  it('F: медиана и максимум задержек', () => {
    const t = timingStats(s.runs)
    expect(t.res.max).toBe(3500)
    expect(t.fp.n).toBeGreaterThan(0)
    expect(t.res.med).toBeGreaterThan(0)
  })
  it('строки сводки: A, B, C, D, F', () => {
    const text = summaryLines(s).map(l => l.text).join('\n')
    expect(text).toContain('A. Контекст · Фразы целиком: поймано ошибок 3 из 4 (подменил 1) · ложных тревог 1 из 4')
    expect(text).toContain('A. Контекст · По словам: поймано ошибок 0 из 2')
    expect(text).toContain('B. Ловушки: ложных принятий 1 из 4 (тишина: 0 из 1)')
    expect(text).toContain('C. Пары · Фразы целиком: поймано ошибок 1 из 1')
    expect(text).toContain('шёпот — понято 2 из 2')
    expect(text).toContain('F. Задержки')
    expect(summaryLines(emptyState())).toEqual([])
  })
})

describe('«Скопировать итог Vosk-серии»', () => {
  it('содержит сводки, таблицу порогов и прогоны; не длиннее 6000', () => {
    const text = buildSeriesReport(fixture(), { model: 'vosk-model-small-en-us-0.15.tar.gz', modelMs: 911 })
    expect(text.length).toBeLessThanOrEqual(VOSK_SERIES_MAX)
    expect(text).toContain('vosk-model-small-en-us-0.15.tar.gz, в память 911 мс')
    expect(text).toContain('ПОРОГ УВЕРЕННОСТИ СЛОВА')
    expect(text).toContain('B. Ловушки: ложных принятий 1 из 4')
    expect(text).toContain('сказал «train» → «try»')
    expect(text).toContain('❌ ложно принято за «try»')
    expect(text).toContain('ПРОГОНЫ (все ')
  })
  it('много прогонов: старые отбрасываются, потолок соблюдён, сводка на месте', () => {
    let s = fixture()
    for (let i = 0; i < 140; i++) s = addRun(s, makeRun(ctxSpec(3, 'error', 'phrases'), "i'm trying to please both and a very long unusual tail of words to make the line longer", stats([w('trying', 0.77, 0.5, 1.2)]), { style: 'phrases', cond: 'noise' }, 9000 + i))
    const text = buildSeriesReport(s, {})
    expect(text.length).toBeLessThanOrEqual(VOSK_SERIES_MAX)
    expect(text).toContain('ПРОГОНЫ (последние ')
    expect(text).toContain('A. Контекст')
    expect(text).toContain('ПОРОГ УВЕРЕННОСТИ СЛОВА')
  })
  it('пустая серия — честно «результатов пока нет»', () => {
    expect(buildSeriesReport(emptyState())).toContain('результатов пока нет')
  })
  it('строка прогона: что сказал → что услышал, вывод, тайминги', () => {
    const r = makeRun(ctxSpec(1, 'error', 'phrases'), "i'm trying", stats([w('trying', 0.93, 0.5, 1.2)]), { style: 'phrases', cond: 'quiet' }, 1)
    const line = runLine(r, 3)
    expect(line).toContain("3. A Шаг 2 · ошибка · тихо/далеко · Фразы целиком: сказал «I'm try» → «i'm trying» (0.93) ⚠ принял за «trying» (подменил)")
    expect(line).toContain('partial 1.6 с, итог 2.7 с')
    expect(line).toContain('(авто-стоп)')
  })
})
