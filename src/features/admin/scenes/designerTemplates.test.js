import { describe, it, expect } from 'vitest'
import { catTemplateSvg, propTemplateSvg, TEMPLATE_FILES } from './designerTemplates.js'
import { checkSpriteSvg, spriteCheckSummary } from '../../scene/v2/spriteCheck.js'

describe('шаблоны SVG для дизайнера', () => {
  it('шаблон кота проходит проверку типа cat', () => {
    const svg = catTemplateSvg()
    expect(checkSpriteSvg(svg, 'cat')).toEqual([])
    expect(svg).toContain('viewBox="0 0 200 240"')
    for (const p of ['tail', 'body', 'paws', 'head', 'ears', 'face', 'eyes', 'mouth', 'whiskers']) expect(svg).toContain(`data-part="${p}"`)
    for (const v of ['closed', 'half', 'open']) expect(svg).toContain(`data-viseme="${v}"`)
    expect(spriteCheckSummary(svg, 'cat').nodes).toBeLessThanOrEqual(70)
  })

  it('шаблоны предметов проходят проверку типа prop, якорь задаёт viewBox', () => {
    expect(checkSpriteSvg(propTemplateSvg(), 'prop')).toEqual([])
    expect(propTemplateSvg()).toContain('viewBox="-30 -60 60 60"')
    expect(propTemplateSvg({ w: 80, h: 60, anchor: 'center' })).toContain('viewBox="-40 -30 80 60"')
    expect(propTemplateSvg({ w: 40, h: 70, anchor: 'top' })).toContain('viewBox="-20 0 40 70"')
    expect(propTemplateSvg({ id: 'lamp' })).toContain('data-part="lamp"')
  })

  it('TEMPLATE_FILES: имена латиницей .svg, каждый годен', () => {
    for (const t of TEMPLATE_FILES) {
      expect(t.file).toMatch(/^[a-z0-9-]+\.svg$/)
      expect(checkSpriteSvg(t.make(), t.id === 'cat' ? 'cat' : 'prop')).toEqual([])
    }
  })
})
