import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { shiftHighlights } from '../lib/textHighlight.js'
import { EMOJI_GROUPS, ALL_EMOJI } from '../lib/emojiSet.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('набор смайликов', () => {
  it('стандартный Unicode — ничего не грузится со стороны', () => {
    const set = read('../lib/emojiSet.js')
    expect(set).not.toContain('http')
    expect(set).not.toContain('import ')
    expect(ALL_EMOJI.length).toBeGreaterThan(150)
  })

  it('группы непустые, повторов нет', () => {
    for (const g of EMOJI_GROUPS) {
      expect(g.items.length).toBeGreaterThan(10)
      expect(g.title).toBeTruthy()
    }
    expect(new Set(ALL_EMOJI).size).toBe(ALL_EMOJI.length)
  })
})

describe('раскраска не съезжает при вставке', () => {
  // «Привет мир», слово «мир» раскрашено (7..10)
  const hl = () => [{ start: 7, end: 10, mode: 'text', color: '#b6fe3b' }]

  it('вставка перед выделением сдвигает его', () => {
    expect(shiftHighlights(hl(), 6, 6, 2)).toEqual([{ start: 9, end: 12, mode: 'text', color: '#b6fe3b' }])
  })

  it('вставка после выделения его не трогает', () => {
    expect(shiftHighlights(hl(), 10, 10, 2)).toEqual(hl())
  })

  it('вставка внутрь выделения растягивает его', () => {
    expect(shiftHighlights(hl(), 8, 8, 2)[0]).toMatchObject({ start: 7, end: 12 })
  })

  it('замена выделенного куска ужимает выделение', () => {
    expect(shiftHighlights(hl(), 7, 10, 2)[0]).toMatchObject({ start: 7, end: 9 })
  })

  it('схлопнувшееся выделение выбрасывается', () => {
    expect(shiftHighlights(hl(), 7, 10, 0)).toEqual([])
  })

  it('без выделений и без изменения длины ничего не делаем', () => {
    expect(shiftHighlights([], 0, 0, 2)).toEqual([])
    const same = hl()
    expect(shiftHighlights(same, 0, 1, 1)).toBe(same)
  })
})

describe('кнопка смайликов в редакторе ноды', () => {
  it('есть у всех типов со своим текстом', () => {
    const editor = read('../../features/canvas/NodeContentEditor.jsx')
    expect(editor).toContain("const HAS_TEXT_TYPES = new Set(['text', 'pin_message', 'system', 'audio', 'sticker', 'photo'])")
    expect(editor).toContain('hasText={HAS_TEXT_TYPES.has(node.type)}')
  })

  it('смайлик доступен и на пустом тексте, кисть с переносами — только на написанном', () => {
    const tools = read('../../features/canvas/NodeTextTools.jsx')
    expect(tools).toContain('title="Смайлики"')
    expect(tools).toContain('{textWritten && (')
  })

  it('вставка идёт в позицию курсора, снятую при открытии окна', () => {
    const hook = read('../../features/canvas/useNodeEmoji.js')
    expect(hook).toContain('el.selectionStart')
    expect(hook).toContain('targetRef.current = (el && el.selectionStart != null)')
    expect(hook).toContain('setSelectionRange(caret, caret)')
    expect(hook).toContain('shiftHighlights(highlights, start, end, ch.length)')
  })

  it('окно рисуется порталом — холст канваса его не утащит', () => {
    expect(read('./EmojiPicker.jsx')).toContain('document.body,')
  })
})
