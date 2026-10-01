import { describe, it, expect } from 'vitest'
import {
  makeBlock, normalizeBlock, normalizeWordCard, isBlockEmpty, cleanForSave, parseMarks, moveBlock, blockSummary, splitNeg, DEFAULT_LEFT, DEFAULT_RIGHT,
} from './wordCardModel.js'

describe('справка слова: блоки', () => {
  it('новые блоки пустые, у диалога имена по умолчанию Пит и Анна', () => {
    const d = makeBlock('dialog')
    expect([d.left, d.right]).toEqual([DEFAULT_LEFT, DEFAULT_RIGHT])
    expect(DEFAULT_LEFT).toBe('Пит')
    expect(DEFAULT_RIGHT).toBe('Анна')
    expect(d.lines.map(l => l.side)).toEqual(['l', 'r'])
    expect(['text', 'table', 'formula', 'cases', 'dialog'].every(t => isBlockEmpty(makeBlock(t)))).toBe(true)
    expect(makeBlock('что-то').type).toBe('text')
  })

  it('normalizeBlock: чинит чужое — обрезает, достраивает, выбрасывает неизвестное', () => {
    expect(normalizeBlock(null)).toBe(null)
    expect(normalizeBlock({ type: 'video' })).toBe(null)
    expect(normalizeBlock({ type: 'text', text: 'x'.repeat(2000) }).text).toHaveLength(600)
    const t = normalizeBlock({ type: 'table', head: ['a', 'b'], rows: [['1'], ['2', '3', '4']], mark: 9 })
    expect(t.head).toEqual(['a', 'b'])
    expect(t.rows).toEqual([['1', ''], ['2', '3']]) // по числу столбцов
    expect(t.mark).toBe(null)                        // номер строки вне таблицы
    expect(normalizeBlock({ type: 'table', head: ['a', 'b'], rows: [['1', '2']], mark: 0 }).mark).toBe(0)
    const d = normalizeBlock({ type: 'dialog', left: '', lines: [{ side: 'x', text: 'Hi', neg: 1 }] })
    expect([d.left, d.right]).toEqual(['Пит', 'Анна'])
    expect(d.lines[0]).toEqual({ side: 'l', text: 'Hi', tr: '', neg: true })
  })

  it('normalizeWordCard: без годных блоков справки нет; tag сохраняется', () => {
    expect(normalizeWordCard(null)).toBe(null)
    expect(normalizeWordCard({ nodes: [{ type: 'bad' }] })).toBe(null)
    expect(normalizeWordCard({ tag: ' глагол ', nodes: [{ type: 'text', text: 'a' }] })).toMatchObject({ tag: 'глагол', nodes: [{ type: 'text', text: 'a' }] })
    expect(normalizeWordCard({ nodes: Array.from({ length: 30 }, () => ({ type: 'text', text: 'a' })) }).nodes).toHaveLength(12)
  })

  it('cleanForSave: пустые блоки, строки и реплики не сохраняются; метка строки сдвигается', () => {
    const wc = {
      tag: '',
      nodes: [
        { ...makeBlock('text'), text: '  ' },
        { ...makeBlock('table'), head: ['a', 'b', 'c'], rows: [['', '', ''], ['x', 'y', 'z'], ['', '', ''], ['p', 'q', 'r']], mark: 3 },
        { ...makeBlock('dialog'), lines: [{ side: 'l', text: 'Hi', tr: 'Привет', neg: false }, { side: 'r', text: ' ', tr: '', neg: false }] },
      ],
    }
    const c = cleanForSave(wc)
    expect(c.nodes.map(n => n.type)).toEqual(['table', 'dialog'])
    expect(c.nodes[0].rows).toEqual([['x', 'y', 'z'], ['p', 'q', 'r']])
    expect(c.nodes[0].mark).toBe(1)
    expect(c.nodes[1].lines).toHaveLength(1)
    expect('tag' in c).toBe(false)
    expect(cleanForSave({ nodes: [makeBlock('text')] })).toBe(null)
  })

  it('parseMarks: **выделение**; непарные звёздочки — обычный текст', () => {
    expect(parseMarks('I want **to** eat')).toEqual([{ text: 'I want ', bold: false }, { text: 'to', bold: true }, { text: ' eat', bold: false }])
    expect(parseMarks('**a** **b**')).toEqual([{ text: 'a', bold: true }, { text: ' ', bold: false }, { text: 'b', bold: true }])
    expect(parseMarks('x **y')).toEqual([{ text: 'x ', bold: false }, { text: '**y', bold: false }])
    expect(parseMarks('')).toEqual([])
  })

  it('moveBlock и blockSummary', () => {
    expect(moveBlock(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveBlock(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveBlock(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    expect(blockSummary({ type: 'text', text: 'Это **важно**' })).toBe('Это важно')
    expect(blockSummary({ type: 'dialog', lines: [1, 2, 3] })).toBe('3 реплик')
  })

  it('splitNeg: не / don’t / not подсвечиваются, остальной текст целый', () => {
    expect(splitNeg('I don’t want to wait!', 'en')).toEqual([{ text: 'I ', neg: false }, { text: 'don’t', neg: true }, { text: ' want to wait!', neg: false }])
    expect(splitNeg('Я не хочу ждать!', 'ru')).toEqual([{ text: 'Я ', neg: false }, { text: 'не', neg: true }, { text: ' хочу ждать!', neg: false }])
    expect(splitNeg('Now is nothing', 'en').some(p => p.neg)).toBe(false) // «no» внутри слова не считается
    expect(splitNeg('', 'en')).toEqual([])
  })
})
