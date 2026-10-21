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
  it('пузыри как у настоящих панелей: фраза ученика (зелёная/красная с ловушкой), потом реакция учителя; слово с опечаткой; таблица — только по галочке', () => {
    const pa = { type: 'phrase_assembly', typeData: { phrase_assembly: { words: ['I', 'want', 'to', 'sleep'], distractors: [{ id: 'd1', text: 'too' }], responseCorrect: 'Верно', responseWrong: 'Мимо' } } }
    expect(pickStepAnswer(pa, true).bubbles).toEqual([{ text: 'I want to sleep', result: 'correct' }, { text: 'Верно', result: 'hint' }])
    expect(pickStepAnswer(pa, false).bubbles).toEqual([{ text: 'I want to too sleep', result: 'wrong_final' }, { text: 'Мимо', result: 'hint' }])
    const tw = { type: 'type_word', typeData: { type_word: { word: 'go to bed', extraLetters: 'pl', responseWrong: 'не то' } } }
    expect(pickStepAnswer(tw, true).bubbles).toEqual([{ text: 'go to bed', result: 'correct' }])
    expect(pickStepAnswer(tw, false).bubbles).toEqual([{ text: 'go to bedp', result: 'wrong_final' }, { text: 'не то', result: 'hint' }])
    const fb = { type: 'fill_blanks', typeData: { fill_blanks: { template: 'I ___ to ___', blanks: [{ answer: 'want', options: ['want', 'wants'] }, { answer: 'sleep', options: ['sleep'] }], responseCorrect: 'Да' } } }
    expect(pickStepAnswer(fb, true).bubbles[0]).toEqual({ text: 'I want to sleep', result: 'correct' })
    expect(pickStepAnswer(fb, false).bubbles[0]).toEqual({ text: 'I wants to sleep', result: 'wrong_final' })
    const tb = { type: 'table', typeData: { table: { words: ['a'], responseCorrect: 'ок' } } }
    expect(pickStepAnswer(tb, true).bubbles).toEqual([{ text: 'ок', result: 'hint' }]) // без галочки фразы нет
    expect(pickStepAnswer({ type: 'say_phrase', typeData: { say_phrase: { phrase: 'I want to dance' } } }, true).bubbles).toEqual([{ text: 'I want to dance', result: 'correct' }])
    expect(pickStepAnswer({ type: 'say_phrase', typeData: { say_phrase: { phrase: 'x' } } }, false).bubbles).toEqual([])
  })

  it('null — случайно: монетка решает верно/неверно (режим «?» скипера)', () => {
    const node = { type: 'word_choice', typeData: { word_choice: { options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }], responseCorrect: 'да', responseWrong: 'нет' } } }
    const seq = [0.1, 0, 0.9, 0] // монетка, выбор варианта, монетка, выбор варианта
    let i = 0
    const rnd = () => seq[i++ % seq.length]
    expect(pickStepAnswer(node, null, rnd).correct).toBe(true)  // 0.1 < 0.5 → верно
    expect(pickStepAnswer(node, null, rnd).correct).toBe(false) // 0.9 → неверно
  })

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

describe('fill_blanks', () => {
  const FB = {
    blanks: [{ options: ['tries', 'try', 'tried'], answer: 'tries' }],
    responseCorrect: 'Верно', responseWrong: 'Мимо',
  }

  it('верно — общий триггер, тот же канал ответа (kind: phrase), что у table/phrase_assembly', () => {
    expect(pickStepAnswer(node('fill_blanks', FB), true, first))
      .toMatchObject({ kind: 'phrase', result: 'fill_correct', variantId: null, correct: true, responseText: 'Верно' })
  })

  it('неверно — есть из чего ошибиться (options длиннее одного answer)', () => {
    expect(pickStepAnswer(node('fill_blanks', FB), false, first))
      .toMatchObject({ result: 'fill_wrong', correct: false, responseText: 'Мимо' })
  })

  it('у каждого пропуска в options только сам answer — ошибиться нечем, идём как верный', () => {
    const noWrongOptions = { blanks: [{ options: ['tries'], answer: 'tries' }] }
    expect(pickStepAnswer(node('fill_blanks', noWrongOptions), false, first))
      .toMatchObject({ result: 'fill_correct', correct: true })
  })
})

describe('type_word', () => {
  const TW = { word: 'tries', extraLetters: 'xz', responseCorrect: 'Верно', responseWrong: 'Мимо' }

  it('верно — type_correct, общий канал ответа (kind: phrase)', () => {
    expect(pickStepAnswer(node('type_word', TW), true, first))
      .toMatchObject({ kind: 'phrase', result: 'type_correct', variantId: null, correct: true, responseText: 'Верно' })
  })

  it('неверно — type_wrong с репликой на ошибку', () => {
    expect(pickStepAnswer(node('type_word', TW), false, first))
      .toMatchObject({ result: 'type_wrong', correct: false, responseText: 'Мимо' })
  })

  it('слова нет — проверять не на чем, идём как верный', () => {
    expect(pickStepAnswer(node('type_word', { word: ' ' }), false, first))
      .toMatchObject({ result: 'type_correct', correct: true })
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
    for (const t of ['audio', 'text', 'video', 'photo', 'sticker', 'system', 'pin_message']) {
      expect(pickStepAnswer(node(t, {}), true, first)).toBe(null)
    }
  })
})
