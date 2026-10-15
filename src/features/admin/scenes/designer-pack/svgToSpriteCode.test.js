import { describe, it, expect } from 'vitest'
import { parseSvg, decodeEntities } from './svgParse.js'
import { svgToTree, treeToCode, spriteEntryCode, svgToSpriteCode, inferAnchor } from './svgToSpriteCode.js'
import { SPRITES } from '../../../scene/v2/sprites/spriteRegistry.js'
import { el, part, countNodes, treeToString, treeToSvgDocument } from '../../../scene/v2/sprites/svgTree.js'
import { checkSpriteSvg } from '../../../scene/v2/spriteCheck.js'
import { catTemplateSvg, propTemplateSvg } from '../designerTemplates.js'

// Сгенерированный фрагмент — настоящий JS: исполняем его с el/part из ядра
const evalEntry = code => new Function('el', 'part', `return ${code.replace(/,\s*$/, '')}`)(el, part)
const evalTree = code => new Function('el', 'part', `return [${code}]`)(el, part)

describe('разбор SVG (svgParse)', () => {
  it('вложенность, самозакрытие, title/desc выброшены, сущности раскрыты', () => {
    const { root, error } = parseSvg('<?xml version="1.0"?><!-- c --><svg viewBox="0 0 10 10"><title>t</title><g data-part="a"><rect width="1" height="2"/><text x="1">A &amp; B</text></g></svg>')
    expect(error).toBeNull()
    expect(root.children).toHaveLength(1)
    expect(root.children[0].children.map(c => c.tag)).toEqual(['rect', 'text'])
    expect(root.children[0].children[1].attrs.children).toBe('A & B')
    expect(decodeEntities('&lt;&#65;&#x42;&quot;')).toBe('<AB"')
  })
  it('ошибки: не svg, незакрытый, непарный', () => {
    expect(parseSvg('<html></html>').error).toMatch(/начинаться с <svg/)
    expect(parseSvg('<svg><g>').error).toMatch(/Не закрыт тег <g>/)
    expect(parseSvg('<svg><g></rect></svg>').error).toMatch(/Непарный/)
  })
})

describe('SVG → код спрайта', () => {
  it('встроенные спрайты проходят круг без потерь: дерево → SVG → дерево → код → дерево', () => {
    for (const s of SPRITES) {
      const tree = s.build({})
      const svg = treeToSvgDocument(tree, { viewBox: s.viewBox })
      const r = svgToTree(svg)
      expect(r.error, s.id).toBeNull()
      expect(r.viewBox.join(' ')).toBe(s.viewBox)
      expect(treeToString(r.tree), s.id).toBe(treeToString(tree))
      const back = evalTree(treeToCode(r.tree))
      expect(treeToString(back), `${s.id} (код)`).toBe(treeToString(tree))
      expect(countNodes(back)).toBe(s.nodeCount)
    }
  })

  it('запись реестра исполняется, проходит spriteCheck, якорь угадан по viewBox', () => {
    for (const s of SPRITES.filter(x => x.kind === 'prop')) {
      const svg = treeToSvgDocument(s.build(), { viewBox: s.viewBox })
      const r = svgToSpriteCode(svg, { id: s.id, title: s.title, category: s.category })
      expect(r.anchor, s.id).toBe(s.anchor)
      const entry = evalEntry(r.code)
      expect(entry).toMatchObject({ id: s.id, title: s.title, category: s.category, anchor: s.anchor, size: s.size })
      const out = treeToSvgDocument(entry.build(), { viewBox: s.viewBox })
      expect(checkSpriteSvg(out, 'prop'), s.id).toEqual([])
      expect(countNodes(entry.build())).toBe(s.nodeCount)
    }
  })

  it('шаблон предмета дизайнера → запись; фигуры без общей группы заворачиваются в part(id)', () => {
    const r = svgToSpriteCode(propTemplateSvg({ id: 'cup', w: 40, h: 50 }), { id: 'coffee-cup', title: 'Чашка' })
    expect(r.error).toBeNull()
    expect(r.code).toContain("part('coffee-cup'")
    expect(r.code).toContain('size: { w: 40, h: 50 }')
    expect(evalEntry(r.code).build().attrs['data-part']).toBe('coffee-cup')
    const loose = svgToSpriteCode('<svg viewBox="-5 -10 10 10"><rect x="-5" y="-10" width="10" height="10" fill="#fff"/><circle r="2" fill="#000"/></svg>', { id: 'dot' })
    const e = evalEntry(loose.code)
    expect(e.build().attrs['data-part']).toBe('dot')
    expect(e.build().children).toHaveLength(2)
    expect(checkSpriteSvg(treeToSvgDocument(e.build(), { viewBox: '-5 -10 10 10' }), 'prop')).toEqual([])
  })

  it('якорь: низ / центр / верх / нет; предупреждения о расхождении и style', () => {
    expect(inferAnchor([-30, -60, 60, 60])).toBe('bottom')
    expect(inferAnchor([-40, -30, 80, 60])).toBe('center')
    expect(inferAnchor([-20, 0, 40, 70])).toBe('top')
    expect(inferAnchor([0, 5, 10, 10])).toBeNull()
    const r = svgToSpriteCode(propTemplateSvg({ anchor: 'center', w: 80, h: 60 }), { id: 'a', anchor: 'bottom' })
    expect(r.warnings.join(' ')).toMatch(/якоре «center», выбран «bottom»/)
    const s = svgToSpriteCode('<svg viewBox="0 5 10 10"><g data-part="a" style="fill:#fff"><rect width="1" height="1"/></g></svg>', { id: 'a' })
    expect(s.warnings.join(' ')).toMatch(/style/)
    expect(s.warnings.join(' ')).toMatch(/ни одному якорю/)
  })

  it('атрибуты: kebab → camelCase, числа → числа, xmlns/id/xlink выброшены, data-* как есть', () => {
    const r = svgToTree('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><g id="x" data-part="p" class="k"><path d="M0 0" stroke-width="1.5" stroke-linecap="round" opacity=".5" xlink:href="#a"/></g></svg>')
    const p = r.tree[0].children[0]
    expect(r.tree[0].attrs).toEqual({ 'data-part': 'p', class: 'k' })
    expect(p.attrs).toEqual({ d: 'M0 0', strokeWidth: 1.5, strokeLinecap: 'round', opacity: 0.5 })
    expect(r.warnings.join(' ')).toMatch(/xlink:href/)
    expect(treeToCode(r.tree)).toContain("part('p', { class: 'k' }")
  })

  it('шаблон кота разбирается целиком и собирается обратно тем же числом узлов', () => {
    const r = svgToTree(catTemplateSvg())
    expect(r.error).toBeNull()
    const back = evalTree(treeToCode(r.tree))
    expect(checkSpriteSvg(treeToSvgDocument(back, { viewBox: '0 0 200 240' }), 'cat')).toEqual([])
    expect(svgToSpriteCode('<html>').error).toMatch(/svg/)
    expect(spriteEntryCode({ id: 'z', title: 'Z', viewBox: null, tree: [] })).toContain('size: { w: 0, h: 0 }')
  })
})
