import { describe, it, expect } from 'vitest'
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'
import { createStudentGame } from './wordLaneStudent.js'
import { STANDBY_WORDS } from '../../../pitrace/raceStandby.js'
import { fixtureSource, FIXTURE_IDS } from '../../../rehearsal/rehearsalFixtures.js'

// Разбор русских partial / final для прохода B «назови перевод» («Встряхни память»): цели — переводы слов круга (дежурные слова raceStandby.js и фикстуры),
// строки — как их отдаёт русская модель Vosk со словарём круга (сняты прогоном vosk-model-small-ru-0.22 на синтезированной речи: близкие формы словарь сводит к цели).
const fixtureTrans = FIXTURE_IDS.flatMap(id => fixtureSource(id).words.map(w => w.translation))
const ROUND = [...new Set([...STANDBY_WORDS.map(w => w.translation), ...fixtureTrans, 'добрый день', 'ещё'])]
const idx = t => ROUND.indexOf(t)
const ru = (raw, final = true, targets = ROUND) => analyzeTargets(raw, targets, final, 'ru')

describe('10 слов круга: перевод услышан', () => {
  it('в круге 10 переводов из дежурных слов и фикстур (с многословным и «ё»)', () => {
    expect(ROUND).toEqual(['встретить', 'приятно', 'помнить', 'где', 'откуда', 'пытаюсь', 'учиться', 'я', 'добрый день', 'ещё'])
  })
  it('итог (final) каждого перевода — зачёт своей цели, без промахов', () => {
    for (const t of ROUND) expect(ru(t), t).toMatchObject({ seq: [idx(t)], misses: 0 })
  })
  it('черновик (partial) с переводом — тоже попадание (слушатель русской модели подтверждает его выдержкой)', () => {
    for (const t of ROUND) expect(ru(t, false).seq, t).toEqual([idx(t)])
  })
  it('«ё» ≡ «е» в обе стороны, регистр и знаки не важны', () => {
    expect(ru('еще').seq).toEqual([idx('ещё')]); expect(ru('ЕЩЁ!').seq).toEqual([idx('ещё')])
    expect(analyzeTargets('ещё', ['еще'], true, 'ru').seq).toEqual([0])
  })
  it('многословный перевод: «добрый» — недосказанная цель (хвост, не промах), «добрый день» — зачёт', () => {
    expect(ru('добрый', false)).toMatchObject({ seq: [], misses: 0, tail: { target: idx('добрый день'), tokens: 1 } })
    expect(ru('добрый день').seq).toEqual([idx('добрый день')])
    expect(ru('добрый').misses).toBe(1) // в итоге недосказанное — уже промах
  })
})

describe('близкие формы и продолжение фразы', () => {
  it('словарь сводит близкие формы к цели («встретиться» → «встретить», «приветик» → «привет»): итог — цель', () => {
    expect(ru('встретить').seq).toEqual([0]) // так модель отдала «встретиться», «встречать»
    expect(analyzeTargets('привет', ['привет', 'спасибо'], true, 'ru').seq).toEqual([0]) // «приветик», «здравствуйте» → «привет»
  })
  it('слово после перевода — продолжение фразы («спасибо большое»), не ошибка; слово ДО перевода — промах', () => {
    expect(analyzeTargets('спасибо [unk]', ['спасибо'], true, 'ru')).toMatchObject({ seq: [0], misses: 0 })
    expect(ru('приятно где')).toMatchObject({ seq: [idx('приятно'), idx('где')], misses: 0 })
    expect(ru('[unk] где')).toMatchObject({ seq: [idx('где')], misses: 1 })
  })
  it('чужое слово и [unk] без перевода — промах; хвостовой [unk] в черновике — ещё не промах', () => {
    expect(ru('[unk]')).toMatchObject({ seq: [], misses: 1 })
    expect(ru('[unk]', false)).toMatchObject({ seq: [], misses: 0 })
    expect(ru('кот')).toMatchObject({ seq: [], misses: 1 })
  })
})

describe('переводы с вариантами', () => {
  const T = ['пытаться, стараться', 'встретить (кого-то)', 'бегать / бежать', 'как дела']
  it('любой вариант — зачёт той же цели; пометку в скобках говорить не нужно', () => {
    expect(analyzeTargets('стараться', T, true, 'ru').seq).toEqual([0])
    expect(analyzeTargets('пытаться', T, true, 'ru').seq).toEqual([0])
    expect(analyzeTargets('встретить', T, true, 'ru').seq).toEqual([1])
    expect(analyzeTargets('бежать', T, true, 'ru').seq).toEqual([2])
    expect(analyzeTargets('как', T, false, 'ru').tail).toEqual({ target: 3, tokens: 1 })
  })
  it('словарь Vosk — каждый вариант отдельной записью (раньше «пытаться стараться» одной фразой)', () => {
    const g = JSON.parse(targetGrammar(T, 1, null, 'ru'))
    expect(g).toEqual(['пытаться', 'стараться', 'встретить', 'бегать', 'бежать', 'как дела', '[unk]', '[unk]'])
    expect(g).not.toContain('пытаться стараться'); expect(g.join(' ')).not.toMatch(/кого/)
  })
  it('словарь круга из 10 переводов: кириллица строчными, «ещё» и «еще», не пустой', () => {
    const g = JSON.parse(targetGrammar(ROUND, 2, null, 'ru'))
    expect(g).toContain('добрый день'); expect(g).toContain('ещё'); expect(g).toContain('еще'); expect(g).toContain('где я'); expect(g.at(-1)).toBe('[unk]')
    expect(g.every(p => /^[а-яё [\]unk]+$/.test(p))).toBe(true)
  })
})

describe('движок пилюль: слова русского перевода', () => {
  const step = lang => ({ id: 's', reps: [{ parts: [0] }], lang })
  it('«добрый день» — два слова (раньше английский tokenize давал одно: пилюля «договорена» уже после «добрый»)', () => {
    expect(createStudentGame({ step: step('ru'), chunks: ['добрый день'] }).reps[0].cum).toEqual([0, 2])
    expect(createStudentGame({ step: step('ru'), chunks: ['пытаться, стараться'] }).reps[0].cum).toEqual([0, 1])
    expect(createStudentGame({ step: step(undefined), chunks: ['get up'] }).reps[0].cum).toEqual([0, 2])
  })
})
