import { describe, it, expect } from 'vitest'
import { maskWord, maskPhrase, maskLine, openWords, nextPeek, SHORT_MAX, SHORT_OPEN_MAX, BRICK } from './racePhraseMask.js'
import { mountMask } from './racePhraseMaskView.js'
import { phraseWords } from './racePhraseData.js'

// Маска слов круга «Скажи» («кирпичики»): спрятанное слово — плашка по длине, первое слово и короткие по правилам открыты, слова проявляются по мере речи (racePhraseMask.js), узел на пилюле (racePhraseMaskView.js)
const fakeDoc = () => {
  const node = tag => ({ tag, children: [], attrs: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v } }, textContent: '', className: '', setAttribute(n, v) { this.attrs[n] = String(v) }, appendChild(c) { this.children.push(c); c.parent = this; return c }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) } })
  const doc = { createElement: node, createTextNode: t => ({ tag: '#text', textContent: t }) }
  const el = node('div'); el.ownerDocument = doc
  return el
}

describe('маска слов', () => {
  it('слово: плашка по числу букв (фигурные пробелы); апостроф не буква; знаки по краям на месте', () => {
    expect(SHORT_MAX).toBe(2); expect(SHORT_OPEN_MAX).toBe(3); expect(BRICK).toBe('\u2007')
    expect(maskWord('Nice')).toBe(BRICK.repeat(4)); expect(maskWord('you?')).toBe(`${BRICK.repeat(3)}?`); expect(maskWord("I'm")).toBe(BRICK.repeat(2))
    expect(maskWord('"Hello,')).toBe(`"${BRICK.repeat(5)},`); expect(maskWord('—')).toBe('—'); expect(maskWord('')).toBe('')
  })
  it('открыты сразу: первое слово всегда; короткое — не сразу за открытым (второе слово — никогда) и не больше трёх на фразу', () => {
    expect(maskLine('Nice to meet you')).toBe('Nice ▭▭ ▭▭▭▭ ▭▭▭') // «to» второе — спрятано
    expect(maskLine("I'm trying to learn")).toBe("I'm ▭▭▭▭▭▭ to ▭▭▭▭▭")
    expect(maskLine("Let's go to your place")).toBe("Let's ▭▭ to ▭▭▭▭ ▭▭▭▭▭") // «go» второе — спрятано, «to» за спрятанным — открыто
    expect(maskLine("I'm gonna go to sleep")).toBe("I'm ▭▭▭▭▭ go ▭▭ ▭▭▭▭▭") // подряд «go to»: второе пропускаем
    expect(maskLine('Where are you from')).toBe('Where ▭▭▭ ▭▭▭ ▭▭▭▭') // трёхбуквенные — не короткие
    expect([...openWords('Come on in or go to it at me')]).toEqual([0, 2, 4, 6]) // on второе, in / go / it — три открытых, at и me — лимит
  })
  it('фраза: черновик — слово бледно, подтверждение — целиком, all — вся фраза', () => {
    const w = maskPhrase('Nice to meet you', new Map([[0, true], [2, false]]))
    expect(w.map(x => `${x.text}:${x.state}`)).toEqual(['Nice:full', `${BRICK.repeat(2)}:hidden`, 'meet:draft', `${BRICK.repeat(3)}:hidden`])
    expect(maskLine('Nice to meet you', new Map([[1, true], [3, true]]))).toBe('Nice to ▭▭▭▭ you')
    expect(maskLine("I'm trying to learn", new Map(), true)).toBe("I'm trying to learn")
  })
  it('номера слов — как у phraseWords (и слушателя): токен без букв номера не получает', () => {
    const text = 'Well — see you soon!'
    const w = maskPhrase(text)
    expect(w.filter(x => x.index >= 0).length).toBe(phraseWords(text).length)
    expect(w.map(x => x.index)).toEqual([0, -1, 1, 2, 3])
    expect(maskLine(text, new Map([[3, true]]))).toBe('Well — ▭▭▭ ▭▭▭ soon!')
  })
})

describe('подсказка следующего слова (peek)', () => {
  it('состояния слова: hidden → peek (текст слова, только у спрятанного) → full; nextPeek — строго следующее за самым дальним сказанным, ничего не сказано — нет', () => {
    const st = (heard, peek) => maskPhrase('Nice to meet you', heard, false, peek).map(w => `${w.text.replaceAll(BRICK, '▭')}:${w.state}`).join(' ')
    expect(st(new Map(), -1)).toBe('Nice:full ▭▭:hidden ▭▭▭▭:hidden ▭▭▭:hidden')
    expect(nextPeek('Nice to meet you', new Map())).toBe(-1) // до первого слова подсказки нет (решение владельца 2026-11-09)
    expect(nextPeek('Nice to meet you', new Map([[0, false]]))).toBe(1); expect(st(new Map(), 1)).toBe('Nice:full to:peek ▭▭▭▭:hidden ▭▭▭:hidden')
    const h = new Map([[0, true], [1, true]])
    expect(nextPeek('Nice to meet you', h)).toBe(2); expect(st(h, 2)).toBe('Nice:full to:full meet:peek ▭▭▭:hidden')
    expect(st(new Map([[0, true], [1, true], [2, true]]), 2)).toBe('Nice:full to:full meet:full ▭▭▭:hidden') // сказано — целиком, peek не перекрывает
    expect(nextPeek("I'm trying to learn", new Map([[0, true], [1, true]]))).toBe(-1) // следующее «to» открыто сразу — подсказывать нечего (дальше не забегаем)
    expect(nextPeek("I'm trying to learn", new Map([[0, true], [1, true], [2, true]]))).toBe(3)
    expect(nextPeek('Nice to meet you', new Map([[3, false]]))).toBe(-1)
    expect(st(new Map(), 0)).toBe('Nice:full ▭▭:hidden ▭▭▭▭:hidden ▭▭▭:hidden') // открытое слово подсказкой не бывает
  })
  it('узел: peek — текст в ячейке data-w="peek", проявление целым словом — --peek (opacity 0…1, до 0,01) только у неё, пишется при смене; кирпичик → текст — перемер границ', () => {
    const el = fakeDoc(), m = mountMask(el, 'Nice to meet you')
    const cells = el.children[0].children.filter(c => c.tag === 'b')
    m.set(new Map(), false, 1)
    expect(cells[1].textContent).toBe('to'); expect(cells[1].attrs['data-w']).toBe('peek')
    m.peek(0.1234); expect(cells[1].style.props['--peek']).toBe('0.12'); m.peek(1.5); expect(cells[1].style.props['--peek']).toBe('1')
    expect(cells[2].style.props['--peek']).toBeUndefined()
    m.set(new Map([[1, true]]), false, 2); expect(cells[1].attrs['data-w']).toBe('full'); expect(cells[2].attrs['data-w']).toBe('peek')
    m.peek(0.2); expect(cells[2].style.props['--peek']).toBe('0.2')
  })
})

describe('узел маски на пилюле', () => {
  it('по <b> на слово с data-w; set меняет только изменившиеся; remove снимает узел; без документа — тихо ничего', () => {
    const el = fakeDoc()
    const m = mountMask(el, 'Nice to meet you')
    const box = el.children[0]
    expect(box.className).toBe('racePhraseMask'); expect(box.attrs['aria-hidden']).toBe('true')
    const cells = box.children.filter(c => c.tag === 'b')
    expect(cells.map(b => `${b.textContent}:${b.attrs['data-w']}`)).toEqual(['Nice:full', `${BRICK.repeat(2)}:hidden`, `${BRICK.repeat(4)}:hidden`, `${BRICK.repeat(3)}:hidden`])
    m.set(new Map([[2, false]]))
    expect(cells[2].textContent).toBe('meet'); expect(cells[2].attrs['data-w']).toBe('draft'); expect(cells[0].attrs['data-w']).toBe('full')
    m.set(new Map(), true); expect(cells.map(b => b.textContent).join(' ')).toBe('Nice to meet you')
    m.remove(); expect(el.children).toHaveLength(0)
    const bare = mountMask({}, 'Nice to meet you'); bare.set(new Map([[2, true]])); expect(bare.words()[2].state).toBe('full'); bare.remove()
  })
})
