import { describe, it, expect } from 'vitest'
import { alignTokens, alignGrammar, alignSeq, matchTokens, heardWords, wordKeys, numberWords, textLang, fold, UNK } from './voskAlignText.js'

// Разметка рта своего файла: текст реплики под Vosk и сопоставление его итога со словами текста.
const hw = (list, t0 = 0.2, len = 0.3) => list.map((word, i) => ({ word, start: +(t0 + i * len).toFixed(2), end: +(t0 + i * len + len - 0.05).toFixed(2), conf: 1 }))

describe('текст реплики → слова, как их пишет Vosk', () => {
  it('русский: строчные, без знаков, знаки остаются в слове текста; тире отдельным словом не идёт', () => {
    const t = alignTokens('Отлично! Теперь — твоя очередь, повторяй…')
    expect(t.map(x => x.w)).toEqual(['Отлично!', 'Теперь', 'твоя', 'очередь,', 'повторяй…'])
    expect(t.map(x => x.keys)).toEqual([['отлично'], ['теперь'], ['твоя'], ['очередь'], ['повторяй']])
  })
  it('дефис делит слово на два ключа, «ё» остаётся в ключе, а сравнение — с «ё» ≡ «е»', () => {
    expect(wordKeys('Кто-то,')).toEqual(['кто', 'то'])
    expect(wordKeys('Ещё')).toEqual(['ещё']); expect(fold('Ещё')).toBe('еще')
    expect(alignSeq(['ещё', 'раз'], ['еще', 'раз'])).toEqual([0, 1])
  })
  it('английский: апостроф внутри слова остаётся (it’s → it\'s), кавычки по краям убираются', () => {
    expect(alignTokens("Great job! Now it’s your turn, 'repeat'").map(x => x.keys)).toEqual([['great'], ['job'], ['now'], ["it's"], ['your'], ['turn'], ['repeat']])
  })
  it('числа — словами на языке реплики (0…99); большие числа модель не найдёт — ключей нет', () => {
    expect(numberWords('5')).toEqual(['пять']); expect(numberWords('21')).toEqual(['двадцать', 'один']); expect(numberWords('40')).toEqual(['сорок'])
    expect(numberWords('17', 'en')).toEqual(['seventeen']); expect(numberWords('42', 'en')).toEqual(['forty', 'two']); expect(numberWords('1234')).toEqual([])
    expect(alignTokens('Осталось 3 слова').map(x => x.keys)).toEqual([['осталось'], ['три'], ['слова']])
    expect(alignTokens('Счёт 2024').at(-1)).toEqual({ w: '2024', keys: [] })
  })
  it('язык — по большинству слов; слова чужого письма остаются словами текста, но без ключей (будут достроены)', () => {
    expect(textLang('Ничего, попробуем ещё раз')).toBe('ru'); expect(textLang('Nice work, Пит')).toBe('en'); expect(textLang('123 !')).toBe('ru')
    const t = alignTokens('Скажи hello ещё раз')
    expect(t.map(x => x.keys)).toEqual([['скажи'], [], ['ещё'], ['раз']])
  })
  it('словарь распознавателя: фраза целиком, запись без «ё» и [unk]; слов нет — null', () => {
    expect(JSON.parse(alignGrammar(alignTokens('Ещё раз!')))).toEqual(['ещё раз', 'еще раз', UNK])
    expect(JSON.parse(alignGrammar(alignTokens('Теперь ты')))).toEqual(['теперь ты', UNK])
    expect(alignGrammar(alignTokens('… 2024 !'))).toBeNull()
  })
})

describe('выравнивание итога Vosk со словами текста', () => {
  it('полное совпадение: каждое слово получает времена Vosk', () => {
    const t = alignTokens('Теперь твоя очередь'), r = matchTokens(t, hw(['теперь', 'твоя', 'очередь']))
    expect(r.found).toBe(3); expect(r.extra).toBe(0)
    expect(r.times).toEqual([{ t: 0.2, e: 0.45 }, { t: 0.5, e: 0.75 }, { t: 0.8, e: 1.05 }])
  })
  it('пропуски: ненайденные слова — null, остальные на своих местах', () => {
    const r = matchTokens(alignTokens('Ничего, попробуем ещё раз'), hw(['ничего', 'раз']))
    expect(r.times.map(Boolean)).toEqual([true, false, false, true]); expect(r.found).toBe(2)
  })
  it('лишние слова Vosk и [unk] пропускаются и считаются', () => {
    const r = matchTokens(alignTokens('твоя очередь'), [...hw(['твоя', 'ну', UNK, 'очередь']), { word: 'мусор' }])
    expect(r.found).toBe(2); expect(r.extra).toBe(1); expect(r.heard).toBe(3)
    expect(r.times[1]).toEqual({ t: 1.1, e: 1.35 })
  })
  it('повторяющиеся слова берутся по порядку', () => {
    const r = matchTokens(alignTokens('да да нет да'), hw(['да', 'да', 'нет', 'да']))
    expect(r.times.map(x => x.t)).toEqual([0.2, 0.5, 0.8, 1.1])
    const part = matchTokens(alignTokens('да нет да'), hw(['нет', 'да'])) // первое «да» не услышано: второе не должно занять его место
    expect(part.times.map(Boolean)).toEqual([false, true, true])
  })
  it('перепутанный порядок: берётся наибольшая цепочка по порядку, остальное — не найдено', () => {
    const r = matchTokens(alignTokens('один два три четыре'), hw(['три', 'четыре', 'один', 'два']))
    expect(r.found).toBe(2); expect(r.extra).toBe(2)
    const ts = r.times.filter(Boolean).map(x => x.t); expect(ts).toEqual([...ts].sort((a, b) => a - b))
  })
  it('пустой итог и слово вне словаря модели', () => {
    expect(matchTokens(alignTokens('Теперь ты'), []).times).toEqual([null, null]); expect(matchTokens(alignTokens('Теперь ты'), null).found).toBe(0)
    const r = matchTokens(alignTokens('Скажи hello громко'), hw(['скажи', 'громко'])) // hello русская модель не знает
    expect(r.times.map(Boolean)).toEqual([true, false, true])
  })
  it('слово из двух ключей («кто-то»): начало первого, конец последнего; найден один ключ — слово найдено', () => {
    expect(matchTokens(alignTokens('Кто-то готов'), hw(['кто', 'то', 'готов'])).times[0]).toEqual({ t: 0.2, e: 0.75 })
    expect(matchTokens(alignTokens('Кто-то готов'), hw(['кто', 'готов'])).found).toBe(2)
  })
  it('слова итога без времён или с нулевой длиной не берутся; порядок — по времени', () => {
    expect(heardWords([{ word: 'б', start: 1, end: 1.2 }, { word: 'а', start: 0.1, end: 0.4 }, { word: 'в', start: 2, end: 2 }, { word: 'г', start: NaN, end: 3 }]).map(w => w.word)).toEqual(['а', 'б'])
  })
})
