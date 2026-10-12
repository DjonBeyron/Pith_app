import { describe, it, expect } from 'vitest'
import { checkStyle } from './lessonLintStyle.js'

const t = (ref, content, extra = {}) => ({ ref, type: 'text', data: { content, ...extra }, triggers: [] })
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i))

describe('живой стиль реплик', () => {
  it('тире в реплике — замечание; в списке с переносами и пины — нет', () => {
    expect(checkStyle([t('a', 'Главное — без окончания')]).join()).toContain('[R-dash] a')
    expect(checkStyle([t('a', 'once — один раз\ntwice — дважды')])).toEqual([])
    expect(checkStyle([{ ref: 'p', type: 'pin_message', data: { content: 'tried — прошедшее' }, triggers: [] }])).toEqual([])
  })
  it('точки: больше 10% реплик с точкой — одно замечание', () => {
    const msgs = many(10, i => t('n' + i, i < 3 ? 'Ты уже говоришь.' : 'ты уже говоришь)'))
    expect(checkStyle(msgs).join()).toContain('[R-period]')
    expect(checkStyle(many(10, i => t('n' + i, i < 1 ? 'Ты уже говоришь.' : 'ты уже говоришь)'))).filter(w => /R-period/.test(w))).toEqual([])
  })
  it('смайлы: слишком много эмодзи — замечание, ~40/60 — нет', () => {
    const emojiHeavy = many(10, i => t('n' + i, i < 8 ? 'ага 😄' : 'ага)'))
    expect(checkStyle(emojiHeavy).join()).toContain('[R-smiley]')
    const balanced = many(10, i => t('n' + i, i < 4 ? 'ага 😄' : 'ага)'))
    expect(checkStyle(balanced)).toEqual([])
  })
  it('учебные слова: мини-сцена, штраф, раунд', () => {
    expect(checkStyle([t('a', 'Мини-сцена 😄 Маша пишет')]).join()).toContain('[R-meta] a')
    expect(checkStyle([t('a', 'Не успеешь — без штрафа')]).join()).toContain('[R-meta] a')
    expect(checkStyle([t('a', 'представь, Маша пишет)')])).toEqual([])
  })
})
