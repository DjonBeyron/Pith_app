import { describe, it, expect } from 'vitest'
import { maskWord, maskPhrase, maskLine, SHORT_MAX, DOTS } from './racePhraseMask.js'
import { mountMask } from './racePhraseMaskView.js'
import { phraseWords } from './racePhraseData.js'

// Маска слов круга «Скажи»: слова спрятаны до первой буквы, короткие видны, проявляются по мере речи (racePhraseMask.js), узел на пилюле (racePhraseMaskView.js)
const fakeDoc = () => {
  const node = tag => ({ tag, children: [], attrs: {}, textContent: '', className: '', setAttribute(n, v) { this.attrs[n] = String(v) }, appendChild(c) { this.children.push(c); c.parent = this; return c }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) } })
  const doc = { createElement: node, createTextNode: t => ({ tag: '#text', textContent: t }) }
  const el = node('div'); el.ownerDocument = doc
  return el
}

describe('маска слов', () => {
  it('слово: первая буква и многоточие; короткое (≤ 2 букв, апостроф не считается) — целиком; знаки по краям на месте', () => {
    expect(SHORT_MAX).toBe(2); expect(DOTS).toBe('…')
    expect(maskWord('Nice')).toBe('N…'); expect(maskWord('meet')).toBe('m…'); expect(maskWord('you?')).toBe('y…?')
    expect(maskWord('to')).toBe('to'); expect(maskWord('a')).toBe('a'); expect(maskWord("I'm")).toBe("I'm")
    expect(maskWord("don't")).toBe('d…'); expect(maskWord('"Hello,')).toBe('"H…,'); expect(maskWord('—')).toBe('—')
  })
  it('фраза: «Nice to meet you» → «N… to m… y…»; черновик — слово бледно, подтверждение — целиком, all — вся фраза', () => {
    expect(maskLine('Nice to meet you')).toBe('N… to m… y…')
    const w = maskPhrase('Nice to meet you', new Map([[0, true], [2, false]]))
    expect(w.map(x => `${x.text}:${x.state}`)).toEqual(['Nice:full', 'to:full', 'meet:draft', 'y…:hidden'])
    expect(maskLine("I'm trying to learn", new Map(), true)).toBe("I'm trying to learn")
    expect(maskLine("I'm trying to learn")).toBe("I'm t… to l…")
  })
  it('номера слов — как у phraseWords (и слушателя): токен без букв номера не получает', () => {
    const text = 'Well — see you soon!'
    const w = maskPhrase(text)
    expect(w.filter(x => x.index >= 0).length).toBe(phraseWords(text).length)
    expect(w.map(x => x.index)).toEqual([0, -1, 1, 2, 3])
    expect(maskLine(text, new Map([[3, true]]))).toBe('W… — s… y… soon!')
  })
})

describe('узел маски на пилюле', () => {
  it('по <b> на слово с data-w; set меняет только изменившиеся; remove снимает узел; без документа — тихо ничего', () => {
    const el = fakeDoc()
    const m = mountMask(el, 'Nice to meet you')
    const box = el.children[0]
    expect(box.className).toBe('racePhraseMask'); expect(box.attrs['aria-hidden']).toBe('true')
    const cells = box.children.filter(c => c.tag === 'b')
    expect(cells.map(b => `${b.textContent}:${b.attrs['data-w']}`)).toEqual(['N…:hidden', 'to:full', 'm…:hidden', 'y…:hidden'])
    m.set(new Map([[0, false]]))
    expect(cells[0].textContent).toBe('Nice'); expect(cells[0].attrs['data-w']).toBe('draft')
    m.set(new Map(), true); expect(cells.map(b => b.textContent).join(' ')).toBe('Nice to meet you')
    m.remove(); expect(el.children).toHaveLength(0)
    const bare = mountMask({}, 'Nice to meet you'); bare.set(new Map([[0, true]])); expect(bare.words()[0].state).toBe('full'); bare.remove()
  })
})
