import { describe, it, expect } from 'vitest'
import { checkAuthorRules, BANNED } from './lessonLintAuthor.js'

const T = (ref, content, seq = 1, triggers = []) => ({ ref, seq, type: 'text', data: { content }, triggers })
const task = (ref, wrongTo, seq) => ({ ref, seq, type: 'word_choice', data: { options: [] }, triggers: [{ if: 'word_correct', then: null }, { if: 'word_wrong', then: wrongTo }] })

describe('проверки из замечаний автора', () => {
  it('запрещённые обороты: «но нет», «ухо востро», и в репликах сцены; «неа)» — нет', () => {
    expect(checkAuthorRules([T('a', 'но нет) час это точка')]).join()).toContain('[R-banned] a')
    expect(checkAuthorRules([T('b', 'Ухо востро 👂')]).join()).toContain('[R-banned] b')
    expect(checkAuthorRules([{ ref: 's', seq: 1, type: 'scene', data: { scene: { timeline: [{ text: 'Послушай-ка, друг' }] } }, triggers: [] }]).join()).toContain('[R-banned] s')
    expect(checkAuthorRules([T('c', 'неа) час это точка')])).toEqual([])
    expect(BANNED).toContain('но нет')
  })
  it('«дай послушать» не больше двух раз за урок', () => {
    const three = [T('a', 'дай послушать)'), T('b', 'ну-ка, дай послушать'), T('c', 'Дай послушать, как вышло')]
    expect(checkAuthorRules(three).join()).toContain('[R-listen-cap]')
    expect(checkAuthorRules(three.slice(0, 2))).toEqual([])
  })
  it('соседние ответы на ошибку с одним вводным — замечание, разные — нет', () => {
    const nodes = [task('q1', 'w1', 1), task('q2', 'w2', 2), T('w1', 'не то) смотри', 10), T('w2', 'не то) ещё смотри', 11)]
    expect(checkAuthorRules(nodes).join()).toContain('[R-opener-adjacent] w1 и w2')
    nodes[3].data.content = 'неа) ещё смотри'
    expect(checkAuthorRules(nodes).filter(w => /adjacent/.test(w))).toEqual([])
  })
  it('фраза со временем без второй цифры в ловушках; с цифрой — чисто', () => {
    const pa = d => ({ ref: 'p', seq: 1, type: 'phrase_assembly', data: { words: ['They', 'meet', 'at', 'four'], distractors: d.map(t => ({ text: t })) }, triggers: [] })
    expect(checkAuthorRules([pa(['in', 'on'])]).join()).toContain('[R-number-trap] p')
    expect(checkAuthorRules([pa(['in', 'five'])])).toEqual([])
  })
  it('«да»/«нет» в озвучке dictator — робот', () => {
    const tb = script => ({ ref: 't', seq: 1, type: 'table', data: { mode: 'dictator', script }, triggers: [] })
    expect(checkAuthorRules([tb('Go home, иди домой, нет, это движение. At home, да, стою в точке')]).join()).toContain('[R-yes-no-script] t')
    expect(checkAuthorRules([tb('Go home, иди домой, это движение')])).toEqual([])
  })
  it('R-first-person: Пит о себе в третьем лице', () => {
    const photo = { ref: 'p', type: 'photo', data: { caption: 'Пит в кровати, одеяло до носа' }, triggers: [] }
    const ok = { ref: 't', type: 'text', data: { content: 'Я валяюсь в кровати, Кейт мне написала' }, triggers: [] }
    expect(checkAuthorRules([photo]).join()).toContain('[R-first-person] p')
    expect(checkAuthorRules([ok]).filter(w => /first-person/.test(w))).toEqual([])
  })
})
