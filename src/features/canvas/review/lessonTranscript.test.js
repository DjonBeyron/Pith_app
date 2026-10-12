import { describe, it, expect } from 'vitest'
import { buildTranscript, findStart, answerText, warningsByRef, optChoice } from './lessonTranscript.js'

const t = (ref, then) => ({ ref, seq: 1, type: 'text', data: { content: ref }, triggers: then ? [{ if: 'timer', then }] : [] })
const q = (ref, right, wrong) => ({ ref, seq: 2, type: 'type_word', data: { word: 'tries' }, triggers: [{ if: 'type_correct', then: right }, { if: 'type_wrong', then: wrong }] })
const lesson = [t('a', 'q'), q('q', 'z', 'h'), t('h', 'z'), t('z')]

describe('лента урока', () => {
  it('старт — нода без входящих; по умолчанию идём по верной ветке', () => {
    expect(findStart(lesson).ref).toBe('a')
    expect(buildTranscript(lesson).map(i => `${i.kind}:${i.ref}`)).toEqual(['node:a', 'node:q', 'student:q', 'node:z'])
  })
  it('переключили «неверно» — в ленте ответ-ошибка и ветка подсказки, потом возврат в основной поток', () => {
    const items = buildTranscript(lesson, { q: 'wrong' })
    expect(items.map(i => `${i.kind}:${i.ref}`)).toEqual(['node:a', 'node:q', 'student:q', 'node:h', 'node:z'])
    expect(items.find(i => i.kind === 'student').ok).toBe(false)
    expect(items.find(i => i.ref === 'h').wrongBranch).toBe(true)
    expect(items.find(i => i.ref === 'z').wrongBranch).toBe(false)
  })
  it('петля в графе не зацикливает ленту', () => {
    expect(buildTranscript([t('a', 'b'), t('b', 'a')]).length).toBe(2)
  })
  it('ответ задания словами; замечания раскладываются по нодам', () => {
    expect(answerText(lesson[1])).toBe('tries')
    const m = warningsByRef(['[R-tautology] q (type_word): …', 'Недостижимо: z'], lesson)
    expect([...m.keys()].sort()).toEqual(['q', 'z'])
  })
})

describe('конец ветки ошибки', () => {
  it('подсказка ведёт мимо реакции верной ветки сразу дальше: красным только сама подсказка', () => {
    const l = [t('a', 'q'), q('q', 'r', 'h'), t('r', 'z'), t('h', 'z'), t('z', 'y'), t('y')]
    const items = buildTranscript(l, { q: 'wrong' })
    expect(items.filter(i => i.kind === 'node' && i.wrongBranch).map(i => i.ref)).toEqual(['h'])
  })
})

describe('выбор конкретного варианта в «Выбери слово»', () => {
  const wc = { ref: 'w', seq: 2, type: 'word_choice', data: { options: [{ id: 'o1', text: 'tries', isCorrect: true }, { id: 'o2', text: 'try', isCorrect: false }, { id: 'o3', text: 'tried', isCorrect: false }] },
    triggers: [{ if: 'word_correct', then: 'z' }, { if: 'word_wrong', then: 'h' }, { if: 'o3', then: 'v' }] }
  const lesson2 = [t('a', 'w'), wc, t('h', 'z'), t('v', 'z'), t('z')]
  it('верный вариант — основная ветка; неверный без особого перехода — общая ветка ошибки', () => {
    expect(buildTranscript(lesson2, { w: optChoice('o1') }).map(i => i.ref)).toEqual(['a', 'w', 'w', 'z'])
    const wrong = buildTranscript(lesson2, { w: optChoice('o2') })
    expect(wrong.map(i => i.ref)).toEqual(['a', 'w', 'w', 'h', 'z'])
    expect(wrong.find(i => i.kind === 'student').pickedText).toBe('try')
  })
  it('у варианта есть особый переход — идём по нему', () => {
    expect(buildTranscript(lesson2, { w: optChoice('o3') }).map(i => i.ref)).toEqual(['a', 'w', 'w', 'v', 'z'])
  })
})
