import { describe, it, expect } from 'vitest'
import { buildSpans, bridgeSpans, splitLines, addHighlight, removeHighlightAt, rangeHasStyle, removeRange } from './textHighlight.js'

const hl = (start, end, over = {}) => ({ start, end, color: '#ffeb3b', mode: 'bg', opacity: 0.5, ...over })

describe('buildSpans — разбор текста с переносами', () => {
  it('текст без выделений остаётся одним куском вместе с переносами', () => {
    const spans = buildSpans('первая\nвторая', [])
    expect(spans).toHaveLength(1)
    expect(spans[0].text).toBe('первая\nвторая')
  })

  it('выделение внутри одной строки не задевает соседнюю', () => {
    const spans = buildSpans('раз два\nтри', [hl(0, 3)])
    expect(spans[0].text).toBe('раз')
    expect(spans[0].h).toBeTruthy()
    expect(spans[1].h).toBeNull()
    expect(spans.map(s => s.text).join('')).toBe('раз два\nтри')
  })

  it('выделение через перенос сохраняет сам перенос внутри куска', () => {
    const spans = buildSpans('раз\nдва', [hl(0, 7)])
    expect(spans.map(s => s.text).join('')).toBe('раз\nдва')
    expect(spans.every(s => s.h)).toBe(true)
  })
})

describe('bridgeSpans — склейка соседних выделений', () => {
  it('пробел между одинаковыми выделениями подхватывает их стиль', () => {
    const spans = bridgeSpans(buildSpans('раз два', [hl(0, 3), hl(4, 7)]))
    const middle = spans.find(s => s.text === ' ')
    expect(middle?.h).toBeTruthy()
  })

  it('перенос между выделениями НЕ склеивается — иначе заливка тянется через всю строку', () => {
    const spans = bridgeSpans(buildSpans('раз\nдва', [hl(0, 3), hl(4, 7)]))
    const middle = spans.find(s => s.text === '\n')
    expect(middle).toBeTruthy()
    expect(middle.h).toBeNull()
  })

  it('перенос с пробелами вокруг тоже не склеивается', () => {
    const spans = bridgeSpans(buildSpans('раз \n два', [hl(0, 3), hl(6, 9)]))
    const middle = spans.find(s => s.text.includes('\n'))
    expect(middle.h).toBeNull()
  })
})

describe('splitLines — раскладка куска по строкам', () => {
  it('кусок без переноса остаётся одной строкой', () => {
    expect(splitLines('привет')).toEqual(['привет'])
  })

  it('каждая строка отдаётся отдельно — фон рисуется построчно', () => {
    expect(splitLines('раз\nдва\nтри')).toEqual(['раз', 'два', 'три'])
  })

  it('пустая строка между абзацами сохраняется', () => {
    expect(splitLines('раз\n\nдва')).toEqual(['раз', '', 'два'])
  })

  it('перенос в конце даёт пустой хвост — курсор печати встаёт на новую строку', () => {
    expect(splitLines('раз\n')).toEqual(['раз', ''])
  })
})

describe('жирность — отдельный слой поверх цвета и плашки', () => {
  const bold = (start, end) => ({ start, end, mode: 'bold' })

  it('жирный кусок помечается флагом, а не съедает цвет', () => {
    const spans = buildSpans('раз два', [bold(0, 3)])
    expect(spans[0].bold).toBe(true)
    expect(spans[0].h).toBeNull()
  })

  it('жирность сочетается с плашкой на одних и тех же буквах', () => {
    const spans = buildSpans('раз два', [hl(0, 3), bold(0, 3)])
    expect(spans[0].bold).toBe(true)
    expect(spans[0].h?.mode).toBe('bg')
  })

  it('жирность сочетается с цветом текста', () => {
    const spans = buildSpans('раз два', [hl(0, 3, { mode: 'text' }), bold(0, 3)])
    expect(spans[0].bold).toBe(true)
    expect(spans[0].h?.mode).toBe('text')
  })

  it('граница жирности рвёт кусок, даже если цвет один', () => {
    const spans = buildSpans('раздва', [hl(0, 6), bold(0, 3)])
    expect(spans.length).toBeGreaterThan(1)
    expect(spans[0].bold).toBe(true)
    expect(spans[1].bold).toBe(false)
  })

  it('снимается последней: сначала плашка, потом цвет, потом жирность', () => {
    let list = [hl(0, 5), hl(0, 5, { mode: 'text' }), bold(0, 5)]
    list = removeHighlightAt(list, 2)
    expect(list.some(h => h.mode === 'bg')).toBe(false)
    list = removeHighlightAt(list, 2)
    expect(list.some(h => h.mode === 'text')).toBe(false)
    expect(list.some(h => h.mode === 'bold')).toBe(true)
    list = removeHighlightAt(list, 2)
    expect(list).toHaveLength(0)
  })
})

describe('повторное выделение снимает раскраску', () => {
  it('участок целиком закрашен тем же цветом — распознаётся', () => {
    expect(rangeHasStyle([hl(0, 5)], 0, 5, 'bg', '#ffeb3b')).toBe(true)
  })

  it('другой цвет на том же месте — не считается закрашенным', () => {
    expect(rangeHasStyle([hl(0, 5)], 0, 5, 'bg', '#ff5252')).toBe(false)
  })

  it('закрашена только часть — не считается', () => {
    expect(rangeHasStyle([hl(0, 3)], 0, 5, 'bg', '#ffeb3b')).toBe(false)
  })

  it('режимы не путаются: плашка не выдаёт себя за цвет текста', () => {
    expect(rangeHasStyle([hl(0, 5)], 0, 5, 'text', '#ffeb3b')).toBe(false)
  })

  it('снятие вырезает только свой участок, хвосты остаются', () => {
    const next = removeRange([hl(0, 10)], 3, 6, 'bg')
    expect(next.map(h => [h.start, h.end])).toEqual([[0, 3], [6, 10]])
  })

  it('снятие не трогает выделения другого режима', () => {
    const next = removeRange([hl(0, 5), hl(0, 5, { mode: 'text' })], 0, 5, 'bg')
    expect(next).toHaveLength(1)
    expect(next[0].mode).toBe('text')
  })

  it('жирность снимается тем же механизмом', () => {
    const next = removeRange([{ start: 0, end: 5, mode: 'bold' }], 0, 5, 'bold')
    expect(next).toHaveLength(0)
  })
})

describe('addHighlight — выделения не путаются от переносов', () => {
  it('новое выделение поверх старого того же типа обрезает старое', () => {
    const next = addHighlight([hl(0, 10)], hl(4, 8, { color: '#ff5252' }))
    const colors = next.map(h => h.color)
    expect(colors).toContain('#ff5252')
    expect(next.every(h => h.start < h.end)).toBe(true)
  })

  it('индексы переносов считаются как обычные символы', () => {
    const text = 'раз\nдва'
    expect(text.indexOf('два')).toBe(4)
    const spans = buildSpans(text, [hl(4, 7)])
    const marked = spans.filter(s => s.h).map(s => s.text).join('')
    expect(marked).toBe('два')
  })
})
