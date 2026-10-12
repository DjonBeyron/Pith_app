import { describe, it, expect } from 'vitest'
import { nodeCopyText } from './nodeCopyText.js'

describe('nodeCopyText', () => {
  it('текст, голосовое, таблица, выбор', () => {
    expect(nodeCopyText({ type: 'text', data: { content: 'привет' } })).toBe('привет')
    expect(nodeCopyText({ type: 'audio', data: { text: 'to часто не переводят', showText: false } })).toBe('to часто не переводят')
    expect(nodeCopyText({ type: 'table', data: { chatCaption: 'T', table: { cells: [{ row: 1, col: 1, value: 'am' }, { row: 1, col: 0, value: 'I' }, { row: 0, col: 0, value: 'Кто' }] } } })).toBe('T\nКто\nI\tam')
    expect(nodeCopyText({ type: 'word_choice', data: { options: [{ text: 'a', isCorrect: true }, { text: 'b' }] } })).toBe('✓ a\n✗ b')
  })
})
