import { describe, it, expect } from 'vitest'
import { findReplyNode, resolvePhraseAttempt, resolveReply } from './replyResolve.js'

const node = (seq, type, extra = {}) => ({ id: `n${seq}`, seq, type, typeData: { [type]: extra } })

describe('findReplyNode', () => {
  const nodes = [node(1, 'text', { content: 'Привет' }), node(2, 'sticker'), node(3, 'text')]

  it('находит ноду по seq', () => {
    expect(findReplyNode(1, nodes)).toBe(nodes[0])
    expect(findReplyNode(2, nodes)).toBe(nodes[1])
  })

  it('replyToSeq не задан (null/undefined/0) — цитаты нет', () => {
    expect(findReplyNode(null, nodes)).toBe(null)
    expect(findReplyNode(undefined, nodes)).toBe(null)
    expect(findReplyNode(0, nodes)).toBe(null)
  })

  it('seq такой ноды нет в списке — null, не падает', () => {
    expect(findReplyNode(99, nodes)).toBe(null)
  })

  it('lessonNodes пуст или не передан — null, не падает', () => {
    expect(findReplyNode(1, [])).toBe(null)
    expect(findReplyNode(1, undefined)).toBe(null)
  })
})

describe('resolvePhraseAttempt', () => {
  it('пустой список попыток — заглушка без текста', () => {
    expect(resolvePhraseAttempt([])).toEqual({ text: null, result: null })
    expect(resolvePhraseAttempt(undefined)).toEqual({ text: null, result: null })
  })

  it('верная попытка есть — берём её, даже если она не последняя в списке', () => {
    const attempts = [
      { text: 'I is', result: 'wrong' },
      { text: 'I am', result: 'correct' },
      { text: 'Отлично!', result: 'hint' }, // ответ учителя, добавлен ПОСЛЕ correct
    ]
    expect(resolvePhraseAttempt(attempts)).toBe(attempts[1])
  })

  it('верной попытки нет — берём последнюю НЕВЕРНУЮ (wrong_final), а не hint учителя', () => {
    const attempts = [
      { text: 'I is', result: 'wrong_final' },
      { text: 'Мимо', result: 'hint' }, // подсказка учителя — не ответ ученика
    ]
    expect(resolvePhraseAttempt(attempts)).toBe(attempts[0])
  })

  it('только hint без единой настоящей попытки — заглушка без текста', () => {
    expect(resolvePhraseAttempt([{ text: 'Подсказка', result: 'hint' }]))
      .toEqual({ text: null, result: null })
  })
})

describe('resolveReply', () => {
  it('replyNode нет — null', () => {
    expect(resolveReply(null, 'Учитель', {}, {}, {})).toBe(null)
  })

  it('word_choice — подпись из выбора ученика, цвет по результату', () => {
    const target = node(1, 'word_choice')
    const correct = resolveReply(target, 'Учитель', { n1: { text: 'yes', result: 'correct' } }, {}, {})
    expect(correct).toMatchObject({ name: 'Вы:', label: 'yes' })
    expect(correct.theme.border).toBe('#b6fe3b')

    const wrong = resolveReply(target, 'Учитель', { n1: { text: 'no', result: 'wrong' } }, {}, {})
    expect(wrong.theme.border).toBe('#f87171')

    const unanswered = resolveReply(target, 'Учитель', {}, {}, {})
    expect(unanswered.label).toBe('Выбор слова') // MEDIA_LABEL — ещё не отвечено
  })

  it('phrase_assembly — подпись из resolvePhraseAttempt по allPhraseStates', () => {
    const target = node(1, 'phrase_assembly')
    const states = { n1: [{ text: 'I am', result: 'correct' }] }
    const r = resolveReply(target, 'Учитель', {}, {}, states)
    expect(r).toMatchObject({ name: 'Вы:', label: 'I am' })
    expect(r.theme.border).toBe('#b6fe3b')
  })

  it('table — та же логика, что phrase_assembly (общий handlePhraseAnswer); wrong_final — цвет ошибки', () => {
    const target = node(1, 'table')
    const states = { n1: [{ text: 'wrong final', result: 'wrong_final' }] }
    const r = resolveReply(target, 'Учитель', {}, {}, states)
    expect(r.label).toBe('wrong final')
    expect(r.theme.border).toBe('#f87171')
  })

  it('photo_choice — своя подпись-ярлык, не текст ответа', () => {
    const target = node(1, 'photo_choice')
    const r = resolveReply(target, 'Учитель', {}, { n1: { result: 'correct' } }, {})
    expect(r.label).toBe('Выбор фото')
    expect(r.theme.border).toBe('#b6fe3b')
  })

  it('обычная реплика учителя (text/sticker/photo/...) — имя учителя, подпись из MEDIA_LABEL или content', () => {
    const sticker = node(1, 'sticker', { crop: { x: 5, y: -2, scale: 1.2 } })
    const r = resolveReply(sticker, 'Ирина', {}, {}, {})
    expect(r).toMatchObject({ name: 'Ирина', label: 'Стикер' })
    expect(r.crop).toEqual({ x: 5, y: -2, scale: 1.2 })
  })

  it('teacherName не задан — подпись по умолчанию «Учитель»', () => {
    const sticker = node(1, 'sticker')
    expect(resolveReply(sticker, undefined, {}, {}, {}).name).toBe('Учитель')
  })
})
