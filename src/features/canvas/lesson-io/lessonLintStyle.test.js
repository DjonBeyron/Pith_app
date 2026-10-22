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

  it('пол ученика: «успел», «угадал» — замечание, «я не заметил» (Пит о себе) и нейтральные формы — нет', () => {
    expect(checkStyle([t('a', 'успел) красота')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'ты угадал))')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'давай, я сделаю вид, что я не заметил)')]).filter(w => /gender/.test(w))).toEqual([])
    expect(checkStyle([t('a', 'Собрал фразу с конца 🔥')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'Ритм поймал 👌')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'в точку))')]).filter(w => /gender/.test(w))).toEqual([])
    expect(checkStyle([t('a', 'у тебя уже получается строить такие фразы самому')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'а город допиши сам')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'Теперь скажи сам: что тебе нужно сделать')]).join()).toContain('[R-gender] a')
    expect(checkStyle([t('a', 'can уже сам говорит, что ты умеешь')]).filter(w => /gender/.test(w))).toEqual([])
  })
  it('реакция на верный ответ: больше 8 слов — замечание, короткая — нет', () => {
    const q = { ref: 'q', type: 'word_choice', data: {}, triggers: [{ if: 'word_correct', then: 'a' }] }
    expect(checkStyle([q, t('a', 'ого, звучит круто, готовка отличная тема, продолжай в том же духе)')]).join()).toContain('[R-react-len] a')
    expect(checkStyle([q, t('a', 'в точку))')]).filter(w => /react-len/.test(w))).toEqual([])
  })
  it('скобки грусти «((» тоже считаются скобочным смайлом', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => t('n' + i, i < 4 ? 'ага 😄' : i % 2 ? 'ну вот((' : 'ну вот))'))
    expect(checkStyle(msgs).filter(w => /smiley/.test(w))).toEqual([])
  })
})
