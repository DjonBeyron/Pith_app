import { describe, it, expect } from 'vitest'
import { compactGrammar, grammarText, thinTrace, journalAll } from './pillStandCompact.js'
import { targetVerdict } from './pillStandVerdict.js'
import { buildPack, readPackJson } from './pillStandReport.js'
import { bigSession } from './pillStandBigFixture.js'

// Сжатие отчёта (разбор присланного файла: грамматика 585 вариантов в каждом заходе и в журнале, уровень каждые 43 мс, «[stand] …» в журнале «Всё») и «как засчитана цель» в шапке.
describe('сжатие отчёта', () => {
  it('грамматика целиком один раз, дальше — «грамматика #N (… вариантов, та же)»', () => {
    const g = ['a', 'b', '[unk]']
    const { events, grammars } = compactGrammar([{ t: 1, k: 'vosk-start', grammar: g }, { t: 2, k: 'wl', kind: 'grammar', grammar: JSON.stringify(g) }, { t: 3, k: 'vosk-start', grammar: g }, { t: 4, k: 'vosk-start', grammar: ['c'] }])
    expect(grammars.map(x => [x.n, x.size])).toEqual([[1, 3], [2, 1]])
    expect(events.map(e => [e.gref, e.gsame, 'grammar' in e])).toEqual([[1, false, false], [1, true, false], [1, true, false], [2, false, false]])
    expect(grammarText(events[2])).toBe('грамматика #1 (3 варианта, та же)')
    expect(grammarText({ gref: 2, gsize: 585, gsame: true })).toBe('грамматика #2 (585 вариантов, та же)')
  })
  it('уровень: переходы порога + раз в 250 мс в голосе / 1 с в тишине; ровно 0 — отдельно; повторы черновика — счётом', () => {
    const ev = [...Array.from({ length: 50 }, (_, i) => ({ t: i * 43, k: 'level', rms: i < 25 ? 0.2 : 0.001 })), { t: 2200, k: 'level', rms: 0, z: 1 }, { t: 2243, k: 'same' }]
    const { events, dropped } = thinTrace(ev)
    expect(events.filter(e => e.k === 'level').map(e => e.t)).toEqual([0, 258, 516, 774, 1032, 1075, 2107, 2200])
    expect(dropped).toEqual({ level: 43, same: 1, fill: 0 })
  })
  it('журнал «Всё»: без «[stand]» и без строк трассы, «[perf]» прорежен', () => {
    const lines = [{ t: 0, text: '[stand] level {}' }, { t: 1, text: '[gate] открыт' }, { t: 2, text: '[mic] поток открыт' }, { t: 3, text: '[perf] a' }, { t: 1000, text: '[perf] b' }, { t: 6000, text: '[perf] c' }]
    expect(journalAll(lines, new Set(['[gate] открыт'])).map(l => l.text)).toEqual(['[mic] поток открыт', '[perf] a', '[perf] c'])
  })
  it('сессия как присланная (2 цели, 40 с, грамматика 585): файл «Всё» меньше в разы, грамматика в JSON одна, журнал без «[stand]»', () => {
    const { events, journal } = bigSession()
    const p = buildPack({ topics: ['all'], span: { kind: 'session' }, at: 40000, events, journal, meta: {}, now: new Date(2026, 10, 10) })
    const j = readPackJson(p.text)
    expect(p.bytes).toBeLessThan(150 * 1024) // было ≈ 526 КБ (v3.3.179), стало ≈ 100 КБ
    expect(j.grammars).toHaveLength(1); expect(j.grammars[0].size).toBe(585)
    expect(p.text.split('\n---JSON---\n')[0]).toContain('словарь Vosk: грамматика #1 (585 вариантов, та же)')
    expect(j.journal.some(l => l.text.startsWith('[stand]'))).toBe(false)
    expect(j.thinned.level).toBeGreaterThan(700)
  })
})

describe('как засчитана цель', () => {
  const wl = text => ({ t: 1, k: 'wl', kind: 'ear', text })
  it('правило слова: ждали итог → по итогу; черновик дорос → по черновику; итог отверг → не засчитано', () => {
    expect(targetVerdict([wl('черновик «wonderful» на 690 мс голоса (3 слога, ожидаю ≥ 360) — жду итог'), wl('итог «wonderful» conf wonderful 1 — зачёт'), { t: 2, k: 'result', ok: true }]))
      .toMatchObject({ mark: '✓', how: 'по итогу — правило слова: ждали итог (итог «wonderful» conf wonderful 1)' })
    expect(targetVerdict([wl('черновик «hello» на 300 мс голоса (2 слога, ожидаю ≥ 240) — зачёт'), { t: 2, k: 'result', ok: true }]).how).toBe('по черновику — правило слова: «hello» на 300 мс голоса (2 слога, ожидаю ≥ 240)')
    expect(targetVerdict([wl('итог «» — не засчитано (черновик был «wonderful»)')])).toMatchObject({ mark: '—', how: 'не засчитано правилом слова: итог «»' })
    expect(targetVerdict([{ t: 1, k: 'word', text: 'see', draft: true }, { t: 2, k: 'result', ok: true }]).how).toBe('по черновику (правило слова не ждало)')
  })
})
