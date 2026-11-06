import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { outcomesOf, outcomeOf, pushRaceMemory, memoryLine, memoryOn, GAME_SOURCE } from './raceMemory.js'
import { scoreRace } from './raceSim.js'
import { initRace } from './raceState.js'

// Запись игры в память слов (raceMemory.js): исход по итогу слов и отправка по одному событию на слово, source 'game'
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const ok = { hit: true, miss: false, ms: 900, life: 4000 }
const pass = (first, extra = null) => ({ score: 0.5, first, extra })
const weak = (text, a, b = null, pct = 80) => ({ text, acc: { pct, level: 3, a, b } })

describe('outcomeOf', () => {
  it('нет результатов — null; только промахи — again; промах и зачёт или нечисто — hard; чисто — good', () => {
    expect(outcomeOf({ hits: 0, misses: 0, unclean: false })).toBe(null)
    expect(outcomeOf({ hits: 0, misses: 2, unclean: false })).toBe('again')
    expect(outcomeOf({ hits: 1, misses: 1, unclean: false })).toBe('hard')
    expect(outcomeOf({ hits: 2, misses: 0, unclean: true })).toBe('hard')
    expect(outcomeOf({ hits: 2, misses: 0, unclean: false })).toBe('good')
  })
})

describe('outcomesOf', () => {
  it('верно и чисто в обоих проходах → good; ключ — wordKey', () => {
    const o = outcomesOf({ weak: [weak('Meet', pass([ok]), pass([ok]), 92)] })
    expect(o).toEqual({ meet: { word: 'meet', outcome: 'good', acc: 92, passes: 2 } })
  })
  it('верно после промаха, поздно, «не то», дополнительный круг → hard', () => {
    const o = outcomesOf({ weak: [
      weak('after', pass([{ ...ok, miss: true }])),
      weak('late', pass([{ ...ok, late: true }])),
      weak('wrong', pass([{ ...ok, wrong: 1 }])),
      weak('extra', pass([{ hit: false, miss: true }], { results: [ok], done: true })),
    ] })
    expect(Object.values(o).map(x => x.outcome)).toEqual(['hard', 'hard', 'hard', 'hard'])
  })
  it('только промахи (молчал, ошибка, поверил ловушке) → again; пропущенная ловушка — чистый зачёт', () => {
    const o = outcomesOf({ weak: [
      weak('silent', pass([undefined])),
      weak('missed', pass([{ hit: false, miss: true }]), pass([{ hit: false, miss: true }])),
      weak('trap', null, pass([{ trap: true, miss: true, believed: true }])),
      weak('skip', null, pass([{ trap: true, hit: true }])),
    ] })
    expect(o.silent.outcome).toBe('again'); expect(o.missed.outcome).toBe('again'); expect(o.trap.outcome).toBe('again')
    expect(o.skip.outcome).toBe('good')
  })
  it('промах «Вершины» (words.miss) портит чистое слово; слова без результатов не трогаем', () => {
    const o = outcomesOf({ weak: [weak('you', pass([ok]))], words: [{ text: 'you', hit: 1, miss: 1 }, { text: 'never', hit: 0, miss: 0 }] })
    expect(o.you.outcome).toBe('hard')
    expect(o.never).toBeUndefined()
    expect(outcomesOf({ words: [{ text: 'top', hit: 0, miss: 1 }] }).top.outcome).toBe('again')
  })
  it('фразы этапа 2 (phraseHits / phraseMisses, необязательные) складываются с пилюлями один раз на слово', () => {
    const o = outcomesOf({ weak: [{ ...weak('nice', pass([ok])), phraseMisses: 1 }], words: [{ text: 'nice', hit: 1, miss: 0, phraseMisses: 1 }, { text: 'meet', hit: 0, miss: 0, phraseHits: 2 }] })
    expect(o.nice).toMatchObject({ outcome: 'hard', passes: 2 })
    expect(o.meet).toMatchObject({ outcome: 'good', passes: 1, acc: null })
    expect(outcomesOf({ words: [{ text: 'x', hit: 0, miss: 0, phraseMisses: 2 }] }).x.outcome).toBe('again')
  })
  it('пустой итог и мусор — пусто, вход не меняется', () => {
    expect(outcomesOf(null)).toEqual({})
    const s = { weak: [{ ...weak('a', pass([ok])), phraseHits: 1 }] }
    const copy = JSON.parse(JSON.stringify(s))
    outcomesOf(s)
    expect(s).toEqual(JSON.parse(JSON.stringify(copy)))
  })
  it('настоящий итог scoreRace: слова проходов получают исходы', () => {
    const race = initRace()
    race.sprint = { ...race.sprint, words: ['nice', 'meet'], results: { 0: ok, 1: { hit: false, miss: true } } }
    const sum = scoreRace({ words: [{ text: 'nice' }, { text: 'meet' }], phrase: 'nice | to meet', chunks: ['nice', 'to meet'] }, race)
    const o = outcomesOf(sum)
    expect(o.nice.outcome).toBe('good'); expect(o.meet.outcome).toBe('again')
  })
})

describe('pushRaceMemory', () => {
  const outcomes = { nice: { word: 'nice', outcome: 'good', acc: 90, passes: 2 }, meet: { word: 'meet', outcome: 'again', acc: 10, passes: 1 } }
  it('одно событие на слово, source game, events { acc, passes }, последовательно; журнал по слову и итог', async () => {
    const order = []
    let active = 0
    const review = vi.fn(async a => { active++; expect(active).toBe(1); order.push(a.word); await Promise.resolve(); active--; return a.word === 'nice' ? { ok: true, prev_step: 2, step: 3, applied: true } : { ok: true, prev_step: 3, step: 2, applied: true } })
    const log = vi.fn()
    const sum = await pushRaceMemory({ outcomes, review, lessonId: 'L1', log })
    expect(order).toEqual(['nice', 'meet'])
    expect(review).toHaveBeenCalledWith({ word: 'nice', outcome: 'good', lessonId: 'L1', source: GAME_SOURCE, events: { acc: 90, passes: 2 } })
    expect(GAME_SOURCE).toBe('game')
    expect(log.mock.calls.map(c => c[0])).toEqual(['[memory] nice → good: step 2→3 (applied)', '[memory] meet → again: step 3→2 (applied)', '[memory] игра: слов 2, записано 2 (шаг сдвинут у 2), нет в памяти 0, сбоев 0'])
    expect(sum).toEqual({ sent: 2, ok: 2, applied: 2, failed: 0, skipped: 0 })
  })
  it('сбой сети и «нет в памяти» не ломают остальные слова', async () => {
    const review = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: false, reason: 'not_found' })
    const log = vi.fn()
    const sum = await pushRaceMemory({ outcomes, review, log })
    expect(review).toHaveBeenCalledTimes(2)
    expect(sum).toMatchObject({ failed: 1, skipped: 1, ok: 0 })
    expect(log.mock.calls[0][0]).toContain('сбой сети (offline)')
    expect(log.mock.calls[1][0]).toBe('[memory] meet → again: не записано (not_found)')
  })
  it('memoryLine: не в срок, null — сбой записи', () => {
    expect(memoryLine('a', 'good', { ok: true, prev_step: 2, step: 2, applied: false })).toBe('[memory] a → good: step 2→2 (не в срок)')
    expect(memoryLine('a', 'good', null)).toBe('[memory] a → good: сбой записи')
  })
  it('memoryOn: гонка из памяти или ноды — пишем; стенд с фикстурой (sim), memoryWrite: false и не гонка — нет', () => {
    expect(memoryOn({ game: 'race', source: 'memory' })).toBe(true)
    expect(memoryOn({ game: 'race', source: 'node' })).toBe(true)
    expect(memoryOn({ game: 'race', source: 'sim' })).toBe(false)
    expect(memoryOn({ game: 'race', source: 'memory', memoryWrite: false })).toBe(false)
    expect(memoryOn({ source: 'memory' })).toBe(false)
    expect(memoryOn(null)).toBe(false)
  })
  it('без Math.random; финал зовёт запись один раз за игру и не на стенде (source sim)', () => {
    expect(read('./raceMemory.js')).not.toContain('Math.random')
    const acts = read('./useRaceActs.js')
    expect(acts).toContain('pushRaceMemory')
    expect(acts).toContain('memoryOn(plan)')
  })
})
