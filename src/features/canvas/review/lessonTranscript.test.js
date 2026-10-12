import { describe, it, expect } from 'vitest'
import { buildTranscript, findStart, answerText, warningsByRef } from './lessonTranscript.js'

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
