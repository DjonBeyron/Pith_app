import { describe, it, expect } from 'vitest'
import { checkMix } from './lessonLintMix.js'

const T = (ref, content, triggers = []) => ({ ref, type: 'text', data: { content }, triggers })
const A = (ref, triggers = []) => ({ ref, type: 'audio', data: { text: 'x' }, triggers })
const S = ref => ({ ref, type: 'sticker', data: { imagePrompt: 'x' }, triggers: [] })
const W = (ref, to) => ({ ref, type: 'word_choice', data: { options: [] }, triggers: [{ if: 'word_wrong', then: to }] })

describe('lessonLintMix', () => {
  it('R-voice-share: мало голоса — замечание, поровну — нет', () => {
    const few = [...Array.from({ length: 14 }, (_, i) => T('t' + i, 'реплика ' + i + ' про что-то')), A('a1')]
    expect(checkMix(few).join()).toMatch(/R-voice-share/)
    const even = [...Array.from({ length: 7 }, (_, i) => T('t' + i, 'реплика ' + i + ' про что-то')), ...Array.from({ length: 7 }, (_, i) => A('a' + i))]
    expect(checkMix(even)).toEqual([])
  })
  it('R-wrong-audio: голос в ветке ошибки', () => {
    expect(checkMix([W('q', 'a'), A('a')]).join()).toMatch(/R-wrong-audio/)
    expect(checkMix([W('q', 't'), T('t', 'не совсем) подсказка')])).toEqual([])
  })
  it('R-emoji-share: только текстовые смайлики — замечание, микс — нет', () => {
    expect(checkMix(['1', '2', '3', '4', '5'].map(i => T('e' + i, '😋'))).join()).toMatch(/R-emoji-share/)
    expect(checkMix([T('e1', '😋'), T('e2', '🥱'), S('s1'), S('s2'), S('s3')])).toEqual([])
  })
  it('R-repeat: одинаковая реплика дословно', () => {
    expect(checkMix([T('a', 'а ну-ка на слух 👂'), T('b', 'а ну-ка на слух 👂')]).join()).toMatch(/R-repeat/)
  })
  it('R-table-title: одинаковые chatCaption', () => {
    const tb = (ref, c) => ({ ref, type: 'table', data: { chatCaption: c }, triggers: [] })
    expect(checkMix([tb('a', 'x'), tb('b', 'x')]).join()).toMatch(/R-table-title/)
    expect(checkMix([tb('a', 'x'), tb('b', 'y')])).toEqual([])
  })
})
