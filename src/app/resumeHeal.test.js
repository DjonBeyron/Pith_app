import { describe, it, expect } from 'vitest'
import { invisibleAncestor, findNavCover, probeNav } from './resumeHeal.js'

// Мини-DOM: элементы с родителями; opacity берём из поля el.op
const el = (name, parent = null, op = '1') => ({ nodeType: 1, tagName: 'DIV', className: name, parentElement: parent, op, style: {} })
const getStyle = e => ({ opacity: e.op })

// Панель с двумя кнопками; elementFromPoint возвращает то, что «лежит сверху»
function docWith(top) {
  const nav = el('shellV2Nav')
  const btns = [el('shellV2NavBtn', nav), el('shellV2NavBtn', nav)]
  btns.forEach(b => { b.getBoundingClientRect = () => ({ left: 0, top: 0, width: 50, height: 40 }); b.contains = x => x === b })
  nav.contains = x => x === nav || btns.includes(x)
  nav.querySelectorAll = () => btns
  return {
    btns,
    querySelector: s => (s === '.shellV2Nav' ? nav : null),
    elementFromPoint: () => (top === 'nav' ? btns[0] : top),
  }
}

describe('resumeHeal: невидимый слой над панелью вкладок', () => {
  it('invisibleAncestor находит предка с opacity 0, а у видимой цепочки — null', () => {
    const root = el('layer', null, '0')
    const child = el('inner', root, '1')
    expect(invisibleAncestor(child, getStyle)).toBe(root)
    expect(invisibleAncestor(el('x', el('y')), getStyle)).toBe(null)
  })

  it('findNavCover: null, когда сверху сама панель; элемент, когда поверх что-то чужое', () => {
    expect(findNavCover(docWith('nav'))).toBe(null)
    const stray = el('stray')
    expect(findNavCover(docWith(stray))).toBe(stray)
  })

  it('probeNav снимает невидимый слой с попадания, видимый оставляет', () => {
    const ghost = el('ghost', null, '0')
    expect(probeNav(docWith(ghost), getStyle)).toMatch(/снят невидимый слой div\.ghost/)
    expect(ghost.style.pointerEvents).toBe('none')

    const vis = el('popup', null, '1')
    expect(probeNav(docWith(vis), getStyle)).toMatch(/оставлено как есть/)
    expect(vis.style.pointerEvents).toBeUndefined()

    expect(probeNav(docWith('nav'), getStyle)).toBe(null)
  })
})
