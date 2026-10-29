import { describe, it, expect } from 'vitest'
import { measureTake, dictorWordsFromChunks, dictorPlan, PAUSE_MIN_MS } from './mirrorMeasure.js'
import { assignWords, toMs, chunkTokens } from './mirrorAlign.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const w = (word, start, end) => ({ word, conf: 1, start, end })
const measure = student => measureTake({ dictor: DICTOR, student, chunks: CHUNKS })

describe('слова: нормализация и раскладка по кускам', () => {
  it("токены: регистр, апострофы, знаки; сокращения раскрыты («i'm» из Vosk = «i am» из словаря)", () => {
    expect(chunkTokens('I’m')).toEqual(['i', 'am'])
    expect(chunkTokens("I'm,")).toEqual(['i', 'am'])
    expect(chunkTokens('to learn')).toEqual(['to', 'learn'])
    const a = assignWords(toMs([w('i', 0.1, 0.2), w('am', 0.2, 0.4), w('trying', 0.5, 0.9)]), CHUNKS)
    expect(a.present).toEqual([true, true, false])
    expect(a.extra).toEqual([])
  })
  it('слова Vosk: секунды → миллисекунды; без меток времени отбрасываются', () => {
    expect(toMs([w('a', 0.4, 0.7)])).toEqual([{ word: 'a', start: 400, end: 700 }])
    expect(toMs([{ word: 'a', start: 400, end: 700 }], 'ms')).toEqual([{ word: 'a', start: 400, end: 700 }])
    expect(toMs([{ word: 'x' }, null, undefined])).toEqual([])
    expect(toMs(undefined)).toEqual([])
  })
  it('слово относится к куску, в который входит; [unk] — ни найденное, ни лишнее; лишнее отдельно', () => {
    const a = assignWords(toMs([w("i'm", 0.4, 0.7), w('[unk]', 0.8, 0.9), w('uh', 1, 1.1), w('learn', 1.2, 1.7)]), CHUNKS)
    expect(a.byChunk.map(x => x.length)).toEqual([1, 0, 1])
    expect(a.present).toEqual([true, false, true]) // «to learn»: найдена половина токенов — кусок сказан
    expect(a.extra).toEqual(['uh'])
  })
})

describe('measureTake', () => {
  it('чистый дубль: темп 1, ничего не потеряно, порядок верный, пауз нет', () => {
    const m = measure(STUDENT_CLEAN)
    expect(m).toMatchObject({ missing: [], extra: [], orderOk: true, order: null, pauses: [], clean: true })
    expect(m.tempo).toBe(1)
    expect(m.loud).toBe(0.9)
    expect(m.gaps.map(g => g.before)).toEqual(['trying', 'to learn'])
  })
  it('слова Vosk в секундах приводятся к мс: тот же дубль в мс даёт тот же результат', () => {
    const ms = { ...STUDENT_CLEAN, unit: 'ms', words: STUDENT_CLEAN.words.map(x => ({ ...x, start: x.start * 1000, end: x.end * 1000 })) }
    expect(measure(ms)).toEqual(measure(STUDENT_CLEAN))
  })
  it('пропуск куска: missing, тем не менее остальное измеряется', () => {
    const m = measure(STUDENT_MISSING)
    expect(m.missing).toEqual(['trying'])
    expect(m.clean).toBe(false)
    expect(m.orderOk).toBe(true)
    expect(m.gaps.map(g => g.before)).toEqual([]) // соседних сказанных кусков нет — пауза не определена
  })
  it('нет ни одного слова — потеряны все куски, темп не определён', () => {
    const m = measure({ words: [], durationMs: 1000, rms: 0.05 })
    expect(m.missing).toEqual(CHUNKS)
    expect(m.tempo).toBeNull()
    expect(m.clean).toBe(false)
  })
  it('лишнее слово не из фразы', () => {
    const m = measure({ ...STUDENT_CLEAN, words: [...STUDENT_CLEAN.words, w('okay', 2.1, 2.4)] })
    expect(m.extra).toEqual(['okay'])
    expect(m.clean).toBe(false)
  })
  it('порядок: «to learn» раньше «trying» — orderOk false и кто раньше', () => {
    const m = measure({ words: [w("i'm", 0.4, 0.7), w('to', 0.8, 0.92), w('learn', 0.92, 1.42), w('trying', 1.5, 2.0)], durationMs: 2300, rms: 0.09 })
    expect(m.orderOk).toBe(false)
    expect(m.order).toEqual({ early: 'to learn', late: 'trying' })
    expect(m.missing).toEqual([])
    expect(m.clean).toBe(false)
  })
  it('темп: скорость речи без пауз и не по длине файла', () => {
    // 0,97 с речи против 1,44 с у диктора = ×0,67 («быстрее на треть»); durationMs на результат не влияет
    const fast = { words: [w("i'm", 0.1, 0.32), w('trying', 0.35, 0.75), w('to', 0.8, 0.87), w('learn', 0.87, 1.15)], durationMs: 9000, rms: 0.1 }
    expect(measure(fast).tempo).toBe(0.67)
    expect(measure({ ...fast, durationMs: 1200 }).tempo).toBe(0.67)
    const slow = { words: [w("i'm", 0, 0.5), w('trying', 0.6, 1.4), w('to', 1.5, 1.7), w('learn', 1.7, 2.4)], durationMs: 3000, rms: 0.1 }
    expect(measure(slow).tempo).toBe(1.53)
  })
  it('долгая пауза темп не портит: речь та же, а паузу считает отдельная мера', () => {
    expect(measure(STUDENT_PAUSE).tempo).toBe(1)
  })
  it('паузы: длиннее диктора на ≥ 400 мс — в pauses с обеими длинами; короче — нет', () => {
    const m = measure(STUDENT_PAUSE)
    expect(m.pauses).toEqual([{ before: 'to learn', studentMs: 1100, dictorMs: 80 }])
    expect(m.clean).toBe(false)
    const near = measure({ words: [w("i'm", 0.4, 0.7), w('trying', 0.78, 1.3), w('to', 1.38 + (PAUSE_MIN_MS - 10) / 1000, 1.5 + (PAUSE_MIN_MS - 10) / 1000), w('learn', 1.5 + (PAUSE_MIN_MS - 10) / 1000, 2.0 + (PAUSE_MIN_MS - 10) / 1000)], durationMs: 2600, rms: 0.09 })
    expect(near.pauses).toEqual([])
  })
  it('громкость: отношение RMS человека к диктору; без RMS диктора — null', () => {
    expect(measure({ ...STUDENT_CLEAN, rms: 0.05 }).loud).toBe(0.5)
    expect(measureTake({ dictor: { ...DICTOR, rms: undefined }, student: STUDENT_CLEAN, chunks: CHUNKS }).loud).toBeNull()
    expect(measureTake({ dictor: { ...DICTOR, rms: undefined }, student: STUDENT_CLEAN, chunks: CHUNKS }).clean).toBe(true)
    expect(measure({ ...STUDENT_CLEAN, rms: 0.05 }).clean).toBe(false)
  })
})

describe('dictorWordsFromChunks: диктор из кусков библиотеки', () => {
  it('куски идут один за другим через зазор; слова куска делят его длину по буквам; первое слово — с нуля', () => {
    const words = dictorWordsFromChunks(CHUNKS, [{ ms: 300, lead: 20 }, { ms: 500, lead: 0 }, { ms: 600, lead: 40 }], 80)
    expect(words.map(x => x.word)).toEqual(["I'm", 'trying', 'to', 'learn'])
    expect(words[0]).toEqual({ word: "I'm", start: 0, end: 300 })
    expect(words[1]).toEqual({ word: 'trying', start: 380, end: 880 })
    expect(words[2].start).toBe(960)
    expect(words[2].end).toBe(words[3].start)
    expect(words[3].end).toBe(1560) // конец куска не сдвигается от округления
    expect(words[2].end - words[2].start).toBeLessThan(words[3].end - words[3].start) // «to» короче «learn»
  })
  it('нет длины куска (голос системы) — оценка по буквам; пустая фраза — пусто', () => {
    const words = dictorWordsFromChunks(['hello'], [null])
    expect(words).toHaveLength(1)
    expect(words[0].end).toBeGreaterThan(300)
    expect(dictorWordsFromChunks([], [])).toEqual([])
  })
  it('dictorPlan: когда включать файлы — голос куска начинается вовремя (файл раньше на lead); leadMs — тишина до первого голоса', () => {
    const p = dictorPlan(CHUNKS, [{ ms: 300, lead: 20 }, { ms: 500, lead: 60 }, { ms: 600, lead: 0 }], 80)
    expect(p.leadMs).toBe(20)
    expect(p.durationMs).toBe(1560)
    expect(p.plays.map(x => x.at)).toEqual([0, 380 + 20 - 60, 960 + 20])
    expect(p.plays.map(x => x.chunk)).toEqual(CHUNKS)
  })
})
