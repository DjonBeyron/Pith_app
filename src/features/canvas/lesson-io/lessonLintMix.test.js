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
    expect(checkMix(even).join()).not.toMatch(/R-voice-share/)
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
    const tb = (ref, c) => ({ ref, type: 'table', data: { chatCaption: c }, triggers: [{ if: 'table_correct', then: null }] })
    expect(checkMix([tb('a', 'x'), tb('b', 'x')]).join()).toMatch(/R-table-title/)
    expect(checkMix([tb('a', 'x'), tb('b', 'y')])).toEqual([])
  })
  it('R-ksta: нет «кста» в длинном уроке — замечание; в голосовом не считается', () => {
    const many = Array.from({ length: 15 }, (_, i) => T('t' + i, 'реплика номер ' + i))
    expect(checkMix(many).join()).toMatch(/R-ksta/)
    expect(checkMix([...many, A('a')].map(n => (n.ref === 'a' ? { ...n, data: { text: 'кста тут' } } : n))).join()).toMatch(/R-ksta/)
    expect(checkMix([...many, T('k', 'мы кста идём')]).join()).not.toMatch(/R-ksta/)
  })
  it('R-voice-smiley: смайлики и скобки в голосовом', () => {
    const A2 = text => ({ ref: 'a', type: 'audio', data: { text }, triggers: [] })
    expect(checkMix([A2('привет 😄')]).join()).toMatch(/R-voice-smiley/)
    expect(checkMix([A2('привет))')]).join()).toMatch(/R-voice-smiley/)
    expect(checkMix([A2('Привет, как дела?')])).toEqual([])
  })
  it('R-hint-uzhe: «, уже» в подсказке ветки ошибки', () => {
    expect(checkMix([W('q', 'h'), T('h', 'близко) нужен мостик, уже to')]).join()).toMatch(/R-hint-uzhe/)
  })
  it('R-table-trigger: авто-таблица с таймером вместо table_correct', () => {
    const tb = (mode, ifKey) => ({ ref: 't', type: 'table', data: { mode }, triggers: [{ if: ifKey, then: 'z' }] })
    expect(checkMix([tb('dictator', 'timer')]).join()).toMatch(/R-table-trigger/)
    expect(checkMix([tb('dictator', 'table_correct')]).join()).not.toMatch(/R-table-trigger/)
    expect(checkMix([tb('demo', 'timer')]).join()).not.toMatch(/R-table-trigger/)
  })
  it('R-lowercase: все реплики с большой — замечание; около 40% с маленькой — нет', () => {
    const caps = Array.from({ length: 12 }, (_, i) => T('t' + i, 'Реплика ' + i))
    expect(checkMix(caps).join()).toMatch(/R-lowercase/)
    const mixed = Array.from({ length: 12 }, (_, i) => T('t' + i, (i % 5 < 2 ? 'реплика ' : 'Реплика ') + i))
    expect(checkMix(mixed).join()).not.toMatch(/R-lowercase/)
  })
  it('R-voice-smiley: озвучка авто-таблицы тоже без смайликов', () => {
    expect(checkMix([{ ref: 't', type: 'table', data: { mode: 'dictator', script: 'Помнишь про to))' }, triggers: [{ if: 'table_correct', then: null }] }]).join()).toMatch(/R-voice-smiley/)
  })
  it('R-start-menu: в уроке от 30 нод без меню пути в начале — замечание', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ref: 'n' + i, seq: i + 1, type: 'text', data: { content: 'реплика ' + i }, triggers: [] }))
    expect(checkMix(many).join()).toMatch(/R-start-menu/)
    const menu = { ref: 'm', seq: 3, type: 'word_choice', data: { options: [] }, triggers: [{ if: 'variant', then: 'a' }, { if: 'variant', then: 'b' }] }
    expect(checkMix([...many.slice(0, 2), menu, ...many.slice(3)]).join()).not.toMatch(/R-start-menu/)
  })
  it('R-teacher-name: слово «учитель» в реплике', () => {
    expect(checkMix([T('a', 'учитель закрепил сообщение')]).join()).toMatch(/R-teacher-name/)
    expect(checkMix([T('a', 'Пит закрепил сообщение')]).join()).not.toMatch(/R-teacher-name/)
  })
  it('R-underline-many: два подчёркивания в одном сообщении', () => {
    const u = (a, b) => ({ mode: 'underline', start: a, end: b, color: '#ffffff' })
    expect(checkMix([{ ref: 'a', type: 'text', data: { content: 'один и два', highlights: [u(0, 4), u(6, 9)] }, triggers: [] }]).join()).toMatch(/R-underline-many/)
    expect(checkMix([{ ref: 'a', type: 'text', data: { content: 'один и два', highlights: [u(0, 4)] }, triggers: [] }]).join()).not.toMatch(/R-underline-many/)
  })
})
