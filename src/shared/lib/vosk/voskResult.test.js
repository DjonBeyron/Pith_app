import { describe, it, expect } from 'vitest'
import { cleanPartial, cleanResult, judgeWords, VOSK_MIN_CONF, VOSK_TAIL_MIN_CONF, UNK } from './voskResult.js'
import { VOSK_MIN_CONF as ADAPTER_MIN } from './voskResult.js'
import { tokenize } from '../speech/speechMatch.js'

const w = (word, conf) => ({ word, conf, start: 0, end: 1 })

describe('voskResult: нормализация и порог уверенности', () => {
  it('порог по умолчанию 0.3 (константа)', () => {
    expect(VOSK_MIN_CONF).toBe(0.3)
    expect(ADAPTER_MIN).toBe(0.3)
  })
  it('слова с уверенностью ниже порога — нераспознанные; ровно 0.3 проходит', () => {
    const r = cleanResult({ text: 'i am trying', words: [w('i', 0.99), w('am', 0.29), w('trying', 0.3)] })
    expect(r).toMatchObject({ text: 'i trying', unk: 0, low: 1 })
    expect(cleanResult({ words: [w('try', 0.299)] }).text).toBe('')
    expect(cleanResult({ words: [w('try', 0.5)], minConf: 0.7 }).text).toBe('') // порог можно поднять
  })
  it('[unk] не слово: из текста выпадает и не считается верным', () => {
    expect(cleanResult({ words: [w('i', 1), w(UNK, 1), w('trying', 1)] })).toMatchObject({ text: 'i trying', unk: 1 })
    expect(cleanResult({ words: [w(UNK, 1)] }).text).toBe('')
    expect(cleanPartial("[unk] i'm [unk] try")).toBe("i'm try")
  })
  it("нормализация: нижний регистр, умные апострофы → ', схлопнутые пробелы; «i'm» и «i am» дальше сравнивает speechMatch одинаково", () => {
    expect(cleanPartial('  I’M   Trying ')).toBe("i'm trying")
    expect(cleanResult({ text: "I’m  TRYING" }).text).toBe("i'm trying") // нет пословных меток — берём text
    expect(tokenize(cleanPartial('I’m trying'))).toEqual(tokenize('I am trying'))
  })
  it('средняя уверенность оставшихся слов; нет меток — null; слова без conf не ломают', () => {
    expect(cleanResult({ words: [w('a', 1), w('b', 0.5)] }).confidence).toBe(0.75)
    expect(cleanResult({ text: 'try', words: [] }).confidence).toBeNull()
    expect(cleanResult({ words: [{ word: 'try' }] })).toMatchObject({ text: 'try', confidence: null })
    expect(cleanResult()).toMatchObject({ text: '' })
  })
})

describe('judgeWords: вердикт фильтра по каждому слову (для диагностики)', () => {
  it('принято / [unk] / ниже порога; последнее слово эталона проверяется мягче, но только оно и только если совпадает с эталоном', () => {
    const rows = judgeWords([w('please', 0.2), w('both', 0.2), w(UNK, 1)], { tailWord: 'both' })
    expect(rows.map(r => [r.word, r.drop, r.need])).toEqual([['please', 'low', 0.3], ['both', null, 0.15], [UNK, 'unk', null]])
    expect(judgeWords([w('both', 0.2), w('please', 0.9)], { tailWord: 'both' })[0]).toMatchObject({ drop: 'low', need: 0.3 }) // не последнее настоящее слово
    expect(judgeWords([w('both', 0.1)], { tailWord: 'both' })[0]).toMatchObject({ drop: 'low', need: 0.15 })
    expect(VOSK_TAIL_MIN_CONF).toBe(0.15)
    expect(judgeWords(null)).toEqual([])
  })
  it('cleanResult отдаёт rows; слова без метки уверенности не отбрасываются', () => {
    const r = cleanResult({ words: [w('both', 0.2), { word: 'x' }], tailWord: 'x' })
    expect(r.rows).toHaveLength(2); expect(r.text).toBe('x'); expect(r.low).toBe(1)
  })
})
