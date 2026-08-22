import { describe, it, expect } from 'vitest'
import { pickStepAnswer } from './stepAnswer.js'

const node = (type, data) => ({ id: 'n1', seq: 1, type, typeData: { [type]: data } })
const first = () => 0        // детерминированный «рандом»: всегда первый вариант
const last  = () => 0.999    // и всегда последний

const WC = {
  options: [
    { id: 'a', text: 'верный',  isCorrect: true },
    { id: 'b', text: 'мимо-1' },
    { id: 'c', text: 'мимо-2' },
  ],
  responseCorrect: 'Да!', responseWrong: 'Нет',
}

describe('word_choice', () => {
  it('верно — берёт вариант с isCorrect и реакцию «верно»', () => {
    const a = pickStepAnswer(node('word_choice', WC), true, first)
    expect(a).toMatchObject({ kind: 'word', correct: true, variantId: 'a', result: 'word_correct', responseText: 'Да!' })
  })

  it('неверно — берёт из неверных, реакция «неверно»', () => {
    expect(pickStepAnswer(node('word_choice', WC), false, first).variantId).toBe('b')
    expect(pickStepAnswer(node('word_choice', WC), false, last).variantId).toBe('c')
    expect(pickStepAnswer(node('word_choice', WC), false, first).result).toBe('word_wrong')
  })

  it('верных вариантов нет вовсе — берём любой, результат по факту', () => {
    const only = { options: [{ id: 'x', text: 'знаю', signal: 'know' }] }
    const a = pickStepAnswer(node('word_choice', only), true, first)
    expect(a).toMatchObject({ variantId: 'x', correct: false, result: 'word_wrong' })
  })

  it('вариантов нет совсем — шаг не знает, что нажать', () => {
    expect(pickStepAnswer(node('word_choice', { options: [] }), true, first)).toBe(null)
  })
})

describe('phrase_assembly и table', () => {
  const PA = { distractors: [{ id: 'd1', text: 'лишнее' }], responseCorrect: 'Верно', responseWrong: 'Мимо' }

  it('верно — общий триггер без варианта', () => {
    expect(pickStepAnswer(node('phrase_assembly', PA), true, first))
      .toMatchObject({ result: 'phrase_correct', variantId: null, correct: true, responseText: 'Верно' })
  })

  it('неверно — вариантом становится слово-ловушка', () => {
    expect(pickStepAnswer(node('phrase_assembly', PA), false, first))
      .toMatchObject({ result: 'phrase_wrong', variantId: 'd1', correct: false, responseText: 'Мимо' })
  })

  it('таблица работает по тем же ключам', () => {
    expect(pickStepAnswer(node('table', PA), false, first).result).toBe('table_wrong')
    expect(pickStepAnswer(node('table', PA), true, first).result).toBe('table_correct')
  })

  it('ловушки ещё голые строки (старая форма) — вариант без id', () => {
    const old = { distractors: ['лишнее'], responseWrong: '' }
    expect(pickStepAnswer(node('phrase_assembly', old), false, first))
      .toMatchObject({ result: 'phrase_wrong', variantId: null })
  })

  it('ловушек нет — неверный ответ невозможен, идём как верный', () => {
    expect(pickStepAnswer(node('phrase_assembly', { distractors: [] }), false, first))
      .toMatchObject({ result: 'phrase_correct', correct: true })
  })
})

describe('photo_choice', () => {
  const PC = { photos: [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }], correctIndexes: [1] }

  it('верно — индекс из correctIndexes', () => {
    expect(pickStepAnswer(node('photo_choice', PC), true, first)).toMatchObject({ kind: 'photo', idx: 1, correct: true })
  })

  it('неверно — любой другой индекс', () => {
    expect(pickStepAnswer(node('photo_choice', PC), false, first)).toMatchObject({ idx: 0, correct: false })
    expect(pickStepAnswer(node('photo_choice', PC), false, last)).toMatchObject({ idx: 2, correct: false })
  })

  it('фото нет — шагу нечего нажать', () => {
    expect(pickStepAnswer(node('photo_choice', { photos: [] }), true, first)).toBe(null)
  })
})

describe('остальные типы', () => {
  it('регистрация: верно = отправил, неверно = отказался', () => {
    expect(pickStepAnswer(node('registration', {}), true, first).result).toBe('reg_submit')
    expect(pickStepAnswer(node('registration', {}), false, first).result).toBe('reg_cancel')
  })

  it('обычные ноды ответа не требуют', () => {
    for (const t of ['audio', 'text', 'video', 'photo', 'sticker', 'system', 'pin_message', 'voice_record']) {
      expect(pickStepAnswer(node(t, {}), true, first)).toBe(null)
    }
  })
})
