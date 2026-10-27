import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PlayerLikeFeed from './PlayerLikeFeed.jsx'

// В тестах нет IntersectionObserver — лента рисует все слоты (как и задумано в useNearSlots)
const node = (ref, seq) => ({ ref, seq, type: 'text', data: { text: `Привет ${ref}` } })
const nodes = [node('a', 1), node('b', 2), node('c', 3)]
const items = nodes.map(n => ({ kind: 'node', ref: n.ref, node: n, wrongBranch: false, hasWrong: false, choice: null, picked: null }))
const canvasById = new Map(nodes.map(n => [n.ref, n]))
const NOOP = () => {}

const html = marks => renderToStaticMarkup(
  <PlayerLikeFeed items={items} canvasById={canvasById} canvasNodes={nodes} warnMap={new Map()} noteCounts={new Map()} changeMarks={marks}
    onNote={NOOP} onSelect={NOOP} onChoice={NOOP} onPick={NOOP} />
)
// Класс слота по его data-ref
const slotClass = (h, ref) => new RegExp(`class="([^"]*)"[^>]*data-ref="${ref}"|data-ref="${ref}"[^>]*class="([^"]*)"`).exec(h)?.slice(1).find(Boolean) ?? ''

describe('лента разбора: цвет метки «Изменений» по значению метки', () => {
  const h = html(new Map([['a', 'new'], ['b', 'changed']]))
  it('новая — rvwChg + rvwChg--new, подпись «новая»', () => {
    const c = slotClass(h, 'a')
    expect(c).toContain('rvwChg')
    expect(c).toContain('rvwChg--new')
    expect(c).not.toContain('rvwChg--changed')
    expect(h).toContain('новая</span>')
  })
  it('изменённая — rvwChg + rvwChg--changed, подпись «изменена»', () => {
    const c = slotClass(h, 'b')
    expect(c).toContain('rvwChg')
    expect(c).toContain('rvwChg--changed')
    expect(c).not.toContain('rvwChg--new')
    expect(h).toContain('изменена</span>')
  })
  it('без метки класса нет', () => {
    expect(slotClass(h, 'c')).not.toContain('rvwChg')
    expect(slotClass(html(new Map()), 'a')).not.toContain('rvwChg')
  })
})
