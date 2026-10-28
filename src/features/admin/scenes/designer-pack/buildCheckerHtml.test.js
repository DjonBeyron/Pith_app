import { describe, it, expect } from 'vitest'
import { buildCheckerHtml, checkerCoreScript, stripExports } from './buildCheckerHtml.js'
import { checkSpriteSvg, spriteCheckSummary, SPRITE_KINDS, FORBIDDEN_TAGS } from '../../../scene/v2/spriteCheck.js'
import { CAT_PARTS } from '../../../scene/v2/sprites/catSprite.js'
import { NODE_BUDGET } from '../../../scene/v2/sceneBudget.js'
import { MOUTH_STEP_MS } from '../../../scene/v2/mouthDriver.js'
import { catTemplateSvg, propTemplateSvg } from '../designerTemplates.js'
import { fixHintFor } from './fixHints.js'
import { SPRITES } from '../../../scene/v2/sprites/spriteRegistry.js'
import { treeToSvgDocument } from '../../../scene/v2/sprites/svgTree.js'

// Проверка из сгенерированного файла — исполняем ядро скрипта в node и забираем функции
const packed = new Function(`${checkerCoreScript()}; return { checkSpriteSvg, spriteCheckSummary, fixHintFor, C }`)()

const SAMPLES = {
  cat_ok: catTemplateSvg(),
  prop_ok: propTemplateSvg(),
  bad_filter_mask: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -60 60 60"><defs><filter id="f"/><mask id="m"/></defs><g data-part="x"><rect width="10" height="10" filter="url(#f)" fill="orange"/></g></svg>',
  cat_no_viseme: catTemplateSvg().replace(/<g data-viseme="half">[\s\S]*?<\/g>/, ''),
  cat_no_tail: catTemplateSvg().replace('data-part="tail"', 'data-part="tale"'),
  prop_too_big: propTemplateSvg({ w: 400, h: 700 }),
  prop_no_group: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
  not_svg: '<html><body>hi</body></html>',
  empty: '   ',
  script: '<svg viewBox="0 0 10 10" onload="x()"><g data-part="a"><a href="http://x"><rect width="1" height="1"/></a><script>1</script></g></svg>',
  many_nodes: `<svg viewBox="-30 -60 60 60"><g data-part="p">${'<rect width="1" height="1"/>'.repeat(20)}</g></svg>`,
  ...Object.fromEntries(SPRITES.map(s => [`builtin_${s.id}`, treeToSvgDocument(s.build({}), { viewBox: s.viewBox })])),
}
const kindOf = name => (name.includes('mascot-') ? 'mascot' : name.startsWith('cat') || name.includes('cat-') ? 'cat' : name.includes('bg-') ? 'background' : 'prop')

describe('HTML-проверщик для дизайнера', () => {
  it('stripExports превращает ESM в обычный скрипт', () => {
    expect(stripExports('export const A = 1\nexport function f() {}\nconst b = 2')).toBe('var A = 1\nfunction f() {}\nconst b = 2')
  })

  it('вердикты проверки в пакете и в приложении совпадают на всех образцах', () => {
    expect(Object.keys(SAMPLES).length).toBeGreaterThan(20)
    for (const [name, svg] of Object.entries(SAMPLES)) {
      for (const kind of ['cat', 'prop', 'background']) {
        expect(packed.checkSpriteSvg(svg, kind), `${name} / ${kind}`).toEqual(checkSpriteSvg(svg, kind))
        expect(packed.spriteCheckSummary(svg, kind), `${name} / ${kind}`).toEqual(spriteCheckSummary(svg, kind))
      }
      const own = kindOf(name)
      if (name.endsWith('_ok') || name.startsWith('builtin_')) expect(checkSpriteSvg(svg, own), name).toEqual([])
      else expect(checkSpriteSvg(svg, own).length, name).toBeGreaterThan(0)
    }
  })

  it('у каждого нарушения из образцов есть подсказка «как исправить», одинаковая в пакете', () => {
    const problems = new Set()
    for (const svg of Object.values(SAMPLES)) for (const kind of ['cat', 'prop', 'background']) checkSpriteSvg(svg, kind).forEach(p => problems.add(p))
    expect(problems.size).toBeGreaterThan(12)
    for (const p of problems) {
      expect(fixHintFor(p), `нет подсказки: ${p}`).not.toBe('')
      expect(packed.fixHintFor(p)).toBe(fixHintFor(p))
    }
  })

  it('константы в файле — из ядра', () => {
    expect(packed.C.SPRITE_KINDS).toEqual(SPRITE_KINDS)
    expect(packed.C.CAT_PARTS).toEqual(CAT_PARTS)
    expect(packed.C.FORBIDDEN_TAGS).toEqual(FORBIDDEN_TAGS)
    expect(packed.C.NODE_BUDGET).toBe(NODE_BUDGET)
    expect(packed.C.MOUTH_STEP_MS).toBe(MOUTH_STEP_MS)
  })

  it('файл автономный: без внешних ссылок, с анимациями приложения, ≤ 60 КБ, все блоки', () => {
    const html = buildCheckerHtml()
    expect(html.length).toBeLessThanOrEqual(60 * 1024)
    expect(html).not.toMatch(/<link\b|<script[^>]+src=|@import\s+["'u]|url\(\s*["']?https?:/i)
    expect(html.match(/https?:\/\//g).every(u => u === 'http://')).toBe(true) // только xmlns в SVG
    expect(html).toContain('@keyframes scnBreath')
    expect(html).toContain('@keyframes scnBlink')
    expect(html).toContain('[data-mouth="open"] [data-viseme="open"]')
    for (const id of ['sec-in', 'sec-rep', 'sec-prev', 'demo-cat', 'stage', 'emo', 'mouth', 'slot']) expect(html).toContain(`id="${id}"`)
    expect(html).toContain(`кот ≤ ${SPRITE_KINDS.cat.maxNodes} узлов`)
    expect(html).toContain(`не больше ${NODE_BUDGET} узлов`)
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).toContain('function checkSpriteSvg')
    expect(html).toContain('function fixHintFor')
  })
})
