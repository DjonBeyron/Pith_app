import { describe, it, expect } from 'vitest'
import { wordHint, wordHintText } from './typeWordWordHint.js'

describe('wordHint', () => {
  it('неверное первое слово — подсказка про него', () => {
    const h = wordHint('Do to Masha', 'talk to Masha', 'To')
    expect(h).toMatchObject({ kind: 'wrong', index: 0, expected: 'talk' })
    expect(wordHintText(h)).toContain('начни со слова «talk»')
  })
  it('верное начало, неверное имя в конце', () => {
    const h = wordHint('Talk to Anna', 'talk to Masha', 'To')
    expect(h).toMatchObject({ kind: 'wrong', index: 2, expected: 'Masha' })
    expect(wordHintText(h)).toContain('«Masha»')
  })
  it('опечатка в слове — «проверь написание»', () => {
    expect(wordHint('Go to Parys', 'go to Paris', 'To').kind).toBe('typo')
  })
  it('ошибка в слове урока — подсказки нет (текст автора)', () => {
    expect(wordHint('Go too Paris', 'go to Paris', 'To')).toBeNull()
    expect(wordHint('Go', 'go to Paris', 'To')).toBeNull()
  })
  it('недописанное слово и пропущенное слово', () => {
    expect(wordHint('Go to Par', 'go to Paris', 'To').kind).toBe('partial')
    expect(wordHint('Go to', 'go to Paris', 'To').kind).toBe('missing')
  })
  it('одно слово, лишние слова, верно — null', () => {
    expect(wordHint('cal', 'call', 'To')).toBeNull()
    expect(wordHint('Go to Paris now', 'go to Paris', 'To')).toBeNull()
    expect(wordHint('Go to Paris', 'go to Paris', 'To')).toBeNull()
  })
  it('без названия урока подсказывает любое неверное слово', () => {
    expect(wordHint('Go too Paris', 'go to Paris')).toMatchObject({ kind: 'wrong', index: 1, expected: 'to' })
  })
})
