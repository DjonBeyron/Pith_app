import { describe, it, expect } from 'vitest'
import { karaokePlan, karaokeFrame, heardWords, chase, startTime, splitWords, GROW_MS, SHRINK_MS, MIN_HOP_MS, SPEAK_REACH, CATCH_UP } from './readKaraoke.js'

// Читка-караоке: план отрезков, кадр (заливка и курсор), слова игрока
const chunks = ["I'm", 'trying', 'to learn']
const metro = [{ chunk: 0, at: 1000, ms: 400 }, { chunk: 1, at: 1800, ms: 500 }, { chunk: 2, at: 2500, ms: 700 }] // между кусками паузы 400, 300, 300 мс
const plan = karaokePlan(metro, chunks)

describe('план: слова с временами и отрезки', () => {
  it('слова по кускам в порядке фразы; длина куска делится между словами по числу букв', () => {
    expect(plan.words.map(w => [w.text, w.chunk, w.w])).toEqual([["I'm", 0, 0], ['trying', 1, 0], ['to', 2, 0], ['learn', 2, 1]])
    expect(plan.words.map(w => [w.from, w.to])).toEqual([[1000, 1400], [1800, 2300], [2500, 2700], [2700, 3200]]) // «to» 2 буквы, «learn» 5: 700 мс → 200 и 500
    expect(plan.end).toBe(3200)
    expect(plan.words.map(w => w.tokens)).toEqual([2, 1, 1, 1]) // «I'm» = «i am»
  })
  it('отрезки: слово → пауза до следующего слова; внутри куска пауз нет', () => {
    expect(plan.segs.map(s => [s.kind, s.word, s.from, s.to])).toEqual([
      ['word', 0, 1000, 1400], ['gap', 0, 1400, 1800], ['word', 1, 1800, 2300], ['gap', 1, 2300, 2500], ['word', 2, 2500, 2700], ['word', 3, 2700, 3200],
    ])
  })
  it('нет тайминга — плана нет; пустой кусок и текст разбиваются без пустых слов', () => {
    expect(karaokePlan([], chunks)).toEqual({ words: [], segs: [], end: 0 })
    expect(karaokePlan(undefined, chunks).words).toEqual([])
    expect(karaokePlan([{ chunk: 0, at: 0, ms: 100 }], ['']).words).toEqual([])
    expect(splitWords('  to   learn ')).toEqual(['to', 'learn'])
  })
})

describe('кадр: заливка слов', () => {
  it('слово заливается равномерно за свои from..to, после — полностью, до — пусто', () => {
    expect(karaokeFrame(plan, 0).fills).toEqual([0, 0, 0, 0])
    expect(karaokeFrame(plan, 1200).fills).toEqual([0.5, 0, 0, 0])
    expect(karaokeFrame(plan, 2000).fills).toEqual([1, 0.4, 0, 0])
    expect(karaokeFrame(plan, 9999).fills).toEqual([1, 1, 1, 1])
    expect(karaokeFrame(karaokePlan([], chunks), 5)).toEqual({ fills: [], cursor: null })
  })
  it('заливка не убывает со временем', () => {
    let prev = [0, 0, 0, 0]
    for (let t = 0; t <= 3500; t += 25) { const f = karaokeFrame(plan, t).fills; f.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i])); prev = f }
  })
})

describe('кадр: курсор', () => {
  const at = t => karaokeFrame(plan, t).cursor
  it('до появления «|» курсора нет; перед первым словом «|» вырастает из нуля до полной высоты и стоит у начала слова', () => {
    expect(at(0)).toBeNull(); expect(at(1000 - GROW_MS - 1)).toBeNull()
    expect(at(1000 - GROW_MS / 2)).toMatchObject({ word: 0, f: 0, bar: 0.5, dot: 0 })
    expect(at(1000)).toMatchObject({ word: 0, f: 0, bar: 1, dot: 0 })
  })
  it('пока слово звучит, «|» идёт по нему слева направо (доля f), полной высоты', () => {
    expect(at(1200)).toMatchObject({ word: 0, f: 0.5, next: null, bar: 1, dot: 0 })
    expect(at(2050)).toMatchObject({ word: 1, f: 0.5, bar: 1 })
  })
  it('после слова «|» сжимается в кружок, кружок плывёт к следующему слову ровно пока длится пауза, у слова снова растёт в «|»', () => {
    // пауза 1400..1800 (400 мс): сжатие 120 мс, рост 120 мс (30 % паузы — короче, чем SHRINK_MS), движение — остальное
    expect(at(1400 + 60)).toMatchObject({ word: 0, f: 1, next: null, bar: 0.5, dot: 0.5 })
    const mid = at(1600)
    expect(mid).toMatchObject({ word: 0, f: 1, next: 1, bar: 0, dot: 1 }); expect(mid.q).toBeGreaterThan(0.3); expect(mid.q).toBeLessThan(0.7)
    expect(at(1800 - 60)).toMatchObject({ word: 1, f: 0, next: null, bar: 0.5, dot: 0.5 })
    expect(at(1800)).toMatchObject({ word: 1, f: 0, bar: 1, dot: 0 })
  })
  it('движение кружка плавное: доля пути q от 0 до 1 не убывает на всей паузе', () => {
    let prev = 0
    for (let t = 1400; t < 1800; t += 5) { const c = at(t); const q = c.next != null ? c.q : c.word === 1 ? 1 : 0; expect(q).toBeGreaterThanOrEqual(prev); prev = q }
    expect(prev).toBe(1)
  })
  it('длинная пауза: сжатие и рост по SHRINK_MS / GROW_MS, остальное — движение', () => {
    const p = karaokePlan([{ chunk: 0, at: 0, ms: 200 }, { chunk: 1, at: 2200, ms: 200 }], ['a', 'b']) // пауза 2000 мс
    const c = t => karaokeFrame(p, t).cursor
    expect(c(200 + SHRINK_MS)).toMatchObject({ word: 0, next: 1, bar: 0, dot: 1, q: 0 })
    expect(c(2200 - GROW_MS)).toMatchObject({ word: 1, f: 0, bar: 0, dot: 1 })
  })
  it('короткая пауза диктора (80 мс): прыжок не короче MIN_HOP_MS — окно заходит в концовку слова и в начало следующего, «|» всё равно сжимается в кружок и вырастает', () => {
    const p = karaokePlan([{ chunk: 0, at: 0, ms: 200 }, { chunk: 1, at: 280, ms: 200 }], ['a', 'b']) // пауза 200..280
    const c = t => karaokeFrame(p, t).cursor
    expect(p.segs.find(x => x.kind === 'gap')).toMatchObject({ h0: 120, h1: 360 }); expect(p.segs.find(x => x.kind === 'gap').h1 - 120).toBe(MIN_HOP_MS)
    expect(c(119)).toMatchObject({ word: 0, bar: 1, dot: 0 })                             // слово ещё звучит, «|» полный
    expect(c(120 + 36)).toMatchObject({ word: 0, bar: 0.5, dot: 0.5 }); expect(karaokeFrame(p, 156).fills[0]).toBeCloseTo(0.78, 2) // слово почти залито
    expect(c(240)).toMatchObject({ word: 0, next: 1, bar: 0, dot: 1 })                    // кружок в пути
    expect(c(360)).toMatchObject({ word: 1, bar: 1, dot: 0 }); expect(c(359).f).toBeCloseTo(0.4, 1); expect(c(360).f).toBeCloseTo(0.4, 5); expect(p.words[1].rest).toBe(360) // у слова «|» вырос и стоит там, где голос
    expect(p.words[0].rest).toBe(0)
  })
  it('в конце «|» уходит в ноль, вся фраза остаётся залитой', () => {
    expect(at(3200)).toMatchObject({ word: 3, f: 1, bar: 1, dot: 0 })
    expect(at(3200 + SHRINK_MS / 2)).toMatchObject({ word: 3, bar: 0.5, dot: 0 })
    expect(at(3200 + SHRINK_MS)).toBeNull()
    expect(karaokeFrame(plan, 9999).fills).toEqual([1, 1, 1, 1])
  })
  it('высота «|» и кружок не бывают вместе полными; значения в 0..1', () => {
    for (let t = 0; t <= 3600; t += 10) {
      const c = at(t)
      if (!c) continue
      for (const k of ['bar', 'dot', 'f', 'q']) { expect(c[k]).toBeGreaterThanOrEqual(0); expect(c[k]).toBeLessThanOrEqual(1) }
      expect(c.bar + c.dot).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('игрок: сколько слов сказано и куда идёт курсор', () => {
  it('heardWords: слова по токенам недосказанной цели («I\'m» — два токена); готовая цель — все слова', () => {
    expect([0, 1, 2, 3, 4, 5].map(tokens => heardWords(plan, { tokens }))).toEqual([0, 0, 1, 2, 3, 4])
    expect(heardWords(plan, { done: true })).toBe(4); expect(heardWords(plan)).toBe(0)
  })
  it('курсор ждёт у начала следующего слова; речи нет — стоит, слово не заливается', () => {
    let tv = startTime(plan)
    expect(tv).toBe(1000)
    tv = chase(plan, tv, 500, { heard: 0, speaking: false })
    expect(tv).toBe(1000)
    expect(karaokeFrame(plan, tv).cursor).toMatchObject({ word: 0, f: 0, bar: 1 }); expect(karaokeFrame(plan, tv).fills[0]).toBe(0)
  })
  it('слышна речь — курсор входит в слово, но не дальше SPEAK_REACH доли (дальше пускает только распознанное слово)', () => {
    let tv = startTime(plan)
    for (let i = 0; i < 100; i++) tv = chase(plan, tv, 50, { heard: 0, speaking: true })
    expect(tv).toBeCloseTo(1000 + SPEAK_REACH * 400, 5)
    expect(karaokeFrame(plan, tv).fills[0]).toBeCloseTo(SPEAK_REACH, 5)
  })
  it('слово распознано — курсор догоняет его конец быстрее времени, потом идёт к следующему слову и ждёт там', () => {
    let tv = 1000 + SPEAK_REACH * 400
    const one = chase(plan, tv, 50, { heard: 1, speaking: false })
    expect(one - tv).toBeCloseTo(50 * CATCH_UP, 5)
    for (let i = 0; i < 200; i++) tv = chase(plan, tv, 50, { heard: 1, speaking: false })
    expect(tv).toBe(1800) // у начала слова «trying»
    expect(karaokeFrame(plan, tv).fills.slice(0, 2)).toEqual([1, 0])
  })
  it('вся фраза сказана — курсор доходит до конца и уходит; время не идёт назад даже если слушатель «передумал»', () => {
    let tv = 1000
    for (let i = 0; i < 400; i++) tv = chase(plan, tv, 50, { heard: 4, speaking: false })
    expect(tv).toBe(plan.end + SHRINK_MS)
    const back = chase(plan, 2000, 50, { heard: 0, speaking: false })
    expect(back).toBeGreaterThanOrEqual(2000)
  })
  it('нет плана — время стоит', () => {
    expect(chase(karaokePlan([], chunks), 5, 100, { heard: 0 })).toBe(5)
  })
})
