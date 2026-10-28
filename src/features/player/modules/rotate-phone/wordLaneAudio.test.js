import { describe, it, expect } from 'vitest'
import { utterances, phraseScript, clipsFromTimings, clipsFromFills, clipsFor, playSpan, estChunkMs, LEAD_IN_S, TAIL_S } from './wordLaneAudio.js'

const chunks = ["I'm", 'trying', 'to learn']
// Слова файла по порядку (как ступени наращивания): I'm | trying | I'm trying | to learn | I'm trying to learn (каждое слово — 0,4 с с шагом 0,5 с)
const wordsOf = cs => utterances(cs.length).flatMap(p => p.flatMap(i => cs[i].split(/\s+/)))
const timingsOf = cs => wordsOf(cs).map((w, i) => ({ w, t: +(0.3 + i * 0.5).toFixed(2), e: +(0.3 + i * 0.5 + 0.4).toFixed(2) }))

describe('что записать', () => {
  it('высказывания: три куска — 0, 1, 0+1, 2, 0+1+2 (порядок ступеней); два — 0, 1, 0+1; одно слово — три записи', () => {
    expect(utterances(3)).toEqual([[0], [1], [0, 1], [2], [0, 1, 2]])
    expect(utterances(2)).toEqual([[0], [1], [0, 1]])
    expect(utterances(1)).toEqual([[0], [0], [0]])
  })
  it('текст для ElevenLabs — высказывания через точку', () => {
    expect(phraseScript(chunks)).toBe("I'm. trying. I'm trying. to learn. I'm trying to learn.")
    expect(phraseScript(['try'])).toBe('try. try. try.')
  })
})

describe('клипы по таймингам слов', () => {
  it('каждому куску каждого высказывания — свой клип; куски из нескольких слов занимают от первого слова до последнего', () => {
    const c = clipsFromTimings(timingsOf(chunks), chunks, 10)
    expect(c).toHaveLength(5)
    expect(c[0]).toEqual([{ start: 0.3, end: 0.7 }])                          // «I'm»
    expect(c[3]).toEqual([{ start: 2.3, end: 3.2 }])                          // «to learn» = два слова одним куском: от «to» до конца «learn»
    expect(c[2]).toHaveLength(2)                                              // «I'm trying»: два куска
    expect(c[2][0].end).toBeLessThanOrEqual(c[2][1].start)
    expect(c[4]).toHaveLength(3)
    for (const row of c) for (const k of row) { expect(k.end).toBeGreaterThan(k.start) }
  })
  it('слов меньше, чем в самой фразе, — null (играем по оценке длительности)', () => {
    expect(clipsFromTimings(timingsOf(chunks).slice(0, 3), chunks)).toBeNull()
    expect(clipsFromTimings(null, chunks)).toBeNull()
  })
  it('нет конца слова (e) — берётся начало следующего слова; конец не дальше длины файла', () => {
    const t = timingsOf(['a', 'b']).map(({ w, t: s }) => ({ w, t: s }))
    const c = clipsFromTimings(t, ['a', 'b'], 1.0)
    expect(c[0][0].end).toBeCloseTo(0.8, 6)
    expect(c.flat().every(k => k.end <= 1.0 || k.end === 0.8 || k.start >= 1.0)).toBe(true)
  })
  it('старый таймлайн fills (три клипа слова): высказывание r — клип r', () => {
    const f = [{ start: 0.3, end: 0.8 }, { start: 1.6, end: 2.1 }, { start: 3.1, end: 3.6 }]
    const c = clipsFromFills(f)
    expect(c).toHaveLength(3)
    expect(clipsFor(c, 1, [0], 1)).toEqual([f[1]])
    expect(clipsFromFills(null)).toBeNull()
  })
})

describe('клип для повтора ступени', () => {
  it('фраза: ступень берёт высказывание с теми же кусками; без записи — null', () => {
    const c = clipsFromTimings(timingsOf(chunks), chunks, 10)
    expect(clipsFor(c, 3, [0, 1], 2)).toBe(c[2])
    expect(clipsFor(c, 3, [2], 0)).toBe(c[3])
    expect(clipsFor(c, 3, [1, 2], 0)).toBeNull()
    expect(clipsFor(null, 3, [0], 0)).toBeNull()
  })
  it('отрезок воспроизведения: запас перед первым словом и после последнего', () => {
    const span = playSpan([{ start: 0.3, end: 0.7 }, { start: 0.8, end: 1.3 }])
    expect(span.start).toBeCloseTo(0.3 - LEAD_IN_S, 9)
    expect(span.end).toBeCloseTo(1.3 + TAIL_S, 9)
    expect(playSpan([{ start: 0.01, end: 0.4 }]).start).toBe(0)
  })
  it('оценка длины куска без записи — по числу слов, не короче порога', () => {
    expect(estChunkMs('try')).toBeGreaterThanOrEqual(320)
    expect(estChunkMs('to learn english')).toBeGreaterThan(estChunkMs('to learn'))
  })
})

describe('озвучена только фраза целиком (одна запись «I\'m trying to learn.»)', () => {
  const phrase = ["I'm", 'trying', 'to learn']
  const t = ['I’m', 'trying', 'to', 'learn'].map((w, i) => ({ w, t: +(0.2 + i * 0.5).toFixed(2), e: +(0.2 + i * 0.5 + 0.4).toFixed(2) }))
  const c = clipsFromTimings(t, phrase, 5)
  it('клипы находятся: куски режутся из одной записи; сочетания — подряд идущие куски той же записи', () => {
    expect(c).toHaveLength(5)
    expect(c[0]).toEqual([{ start: 0.2, end: 0.6 }])                       // «I'm»
    expect(c[1]).toEqual([{ start: 0.7, end: 1.1 }])                       // «trying»
    expect(c[2]).toEqual([{ start: 0.2, end: 0.6 }, { start: 0.7, end: 1.1 }]) // «I'm trying» — те же клипы подряд
    expect(c[3]).toEqual([{ start: 1.2, end: 2.1 }])                       // «to learn»
    expect(c[4]).toHaveLength(3)
    expect(playSpan(c[2]).start).toBeCloseTo(0.2 - LEAD_IN_S, 9)           // отрезок воспроизведения для «I'm trying»
    expect(playSpan(c[2]).end).toBeCloseTo(1.1 + TAIL_S, 9)
  })
  it('слов меньше, чем в самой фразе, — по-прежнему null (запись не подходит)', () => {
    expect(clipsFromTimings(t.slice(0, 3), phrase, 5)).toBeNull()
  })
  it('запись со всеми высказываниями рецепта по-прежнему разбирается по высказываниям (приоритет у неё)', () => {
    const words = utterances(3).flatMap(p => p.flatMap(i => phrase[i].split(' ')))
    const full = clipsFromTimings(words.map((w, i) => ({ w, t: i * 0.5, e: i * 0.5 + 0.4 })), phrase, 20)
    expect(full[2][0].start).toBeCloseTo(1.0, 6)                           // «I'm» второго высказывания — своё слово записи, а не из первого
  })
})
