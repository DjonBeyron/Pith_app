import { describe, it, expect } from 'vitest'
import { parseWords, classifyKey, verdictOf, wordLine, confOfKey, heardTokens } from './voskClassify.js'

const keys = { say: 'try', ok: 'trying', bad: ['try', 'tried', 'tries'] }
// Подставной результат Vosk (setWords): [{ word, conf, start, end }]
const W = [{ word: "i'm", conf: 0.91234, start: 0.5, end: 0.8 }, { word: 'try', conf: 1, start: 0.8, end: 1.31 }]

describe('разбор слов Vosk', () => {
  it('слово → уверенность → начало/конец (округление), мусор отбрасывается', () => {
    expect(parseWords(W)).toEqual([["i'm", 0.91, 0.5, 0.8], ['try', 1, 0.8, 1.31]])
    expect(parseWords(undefined)).toEqual([])
    expect(parseWords([null, { conf: 1 }, { word: 'a' }])).toEqual([['a', null, null, null]])
  })
  it('уверенность ключевого слова и строка слова', () => {
    const ws = parseWords(W)
    expect(confOfKey(ws, 'try')).toBe(1)
    expect(confOfKey(ws, 'trying')).toBeNull()
    expect(wordLine(ws[1])).toBe('try → 1.00 → 0.8–1.31 с')
    expect(wordLine(['x', null, null, null])).toBe('x → — → время неизвестно')
  })
  it('токены: регистр и кривые апострофы', () => {
    expect(heardTokens("I’m TRY")).toEqual(["i'm", 'try'])
  })
})

describe('классификация по ключевому слову', () => {
  it('говорил «try» и услышали «try» — как сказано', () => {
    expect(classifyKey({ heard: "i'm try", keys })).toEqual({ out: 'asis', sw: null })
  })
  it('говорил «try», услышали «trying» — подменил', () => {
    expect(classifyKey({ heard: "i'm trying", keys })).toEqual({ out: 'swapped', sw: 'trying' })
  })
  it('услышали другую ошибочную форму (tried) — тоже подмена', () => {
    expect(classifyKey({ heard: 'tried', keys })).toEqual({ out: 'swapped', sw: 'tried' })
  })
  it('[unk] вместо слова — отвергнуто; пусто — empty; чужое слово — other', () => {
    expect(classifyKey({ heard: '[unk]', keys }).out).toBe('rejected')
    expect(classifyKey({ heard: "i'm [unk] to please", keys }).out).toBe('rejected')
    expect(classifyKey({ heard: '', keys }).out).toBe('empty')
    expect(classifyKey({ heard: 'hello', keys }).out).toBe('other')
  })
  it('контроль: говорил «trying» — услышали «try» — ложная тревога (подмена)', () => {
    const k = { say: 'trying', ok: 'trying', bad: ['try', 'tried', 'tries'] }
    expect(classifyKey({ heard: 'trying', keys: k }).out).toBe('asis')
    expect(classifyKey({ heard: 'try', keys: k })).toEqual({ out: 'swapped', sw: 'try' })
  })
})

describe('вывод простыми словами', () => {
  const run = (o) => ({ kind: 'ctx', mode: 'error', heard: 'x', ...o })
  it('ошибка: как сказано / принял за / отвергнуто / пусто', () => {
    expect(verdictOf(run({ out: 'asis' })).text).toContain('✅ как сказано')
    expect(verdictOf(run({ out: 'swapped', sw: 'trying' })).text).toBe('⚠ принял за «trying» (подменил)')
    expect(verdictOf(run({ out: 'rejected' })).text).toContain('отвергнуто')
    expect(verdictOf(run({ out: 'empty' })).text).toContain('пусто')
  })
  it('контроль: принял за ошибочное — ложная тревога', () => {
    expect(verdictOf(run({ mode: 'control', out: 'swapped', sw: 'try' })).text).toContain('ложная тревога')
    expect(verdictOf(run({ mode: 'control', out: 'asis' })).tone).toBe('ok')
  })
  it('ловушка: отвергнуто / пусто — хорошо, принято — ложное принятие', () => {
    expect(verdictOf({ kind: 'trap', out: 'rejected' })).toEqual({ tone: 'ok', text: '✅ отвергнуто ([unk])' })
    expect(verdictOf({ kind: 'silence', out: 'empty' }).tone).toBe('ok')
    expect(verdictOf({ kind: 'trap', out: 'accepted', sw: 'try' })).toEqual({ tone: 'bad', text: '❌ ложно принято за «try»' })
    expect(verdictOf(null).text).toBe('')
  })
})
