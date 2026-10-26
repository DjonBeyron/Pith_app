import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderTree } from './renderTree.js'
import { el } from './sprites/svgTree.js'

describe('renderTree: style строкой', () => {
  it('style="a-b:c;d:e" → объект React; в разметке остаётся строкой', () => {
    const tree = el('g', { class: 'x', style: 'transform:rotate(2deg);transform-origin:1px 2px' }, [el('rect', { width: 1 })])
    const html = renderToStaticMarkup(<svg>{renderTree(tree)}</svg>)
    expect(html).toContain('style="transform:rotate(2deg);transform-origin:1px 2px"')
  })
})
