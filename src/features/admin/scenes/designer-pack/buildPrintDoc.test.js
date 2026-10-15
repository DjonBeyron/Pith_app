import { describe, it, expect } from 'vitest'
import { buildPrintDoc } from './buildPrintDoc.js'
import { buildTemplatesPack } from './buildTemplatesPack.js'
import { TOC } from './printDocParts.js'
import { SPRITE_KINDS, FORBIDDEN_TAGS } from '../../../scene/v2/spriteCheck.js'
import { CAT_PARTS, CAT_VIEWBOX } from '../../../scene/v2/sprites/catSprite.js'
import { NODE_BUDGET } from '../../../scene/v2/sceneBudget.js'
import { LAYERS } from '../../../scene/v2/sprites/slots.js'
import { PALETTE_PRESETS } from '../../../scene/v2/sceneConstants.js'
import { HOWTO_STEPS } from '../designerHowToTexts.js'
import { TEMPLATE_FILES } from '../designerTemplates.js'
import { DEV_STEPS, DEV_FILES, DEV_CHECKLIST, DEV_DONTS } from './designerDevTexts.js'
import { PACK_FILES } from './packConsts.js'
import { APP_VERSION } from '../../../../shared/lib/version.js'

// Автономность: без внешних ресурсов. Единственный http:// — xmlns у inline-SVG шаблонов
const external = html => (html.match(/https?:\/\/[^"' )<]+/g) ?? []).filter(u => u !== 'http://www.w3.org/2000/svg')

describe('печатный документ пакета дизайнера', () => {
  const html = buildPrintDoc({ date: new Date(2026, 9, 15) })

  it('самодостаточный: без внешних ссылок, скриптов и <link>', () => {
    expect(external(html)).toEqual([])
    expect(html).not.toMatch(/<link\b|<script\b|@import/i)
    expect(html).toContain('<style>')
    expect(html).toContain('15.10.2026')
    expect(html).toContain(`v${APP_VERSION}`)
  })

  it('содержит все разделы: оглавление, инструкция, спецификация 1–8, шаблоны, проверка, для программиста', () => {
    for (const [id] of TOC) expect(html, id).toContain(`id="p-${id}"`)
    for (const id of ['scd-canvas', 'scd-parts', 'scd-mouth', 'scd-anchor', 'scd-color', 'scd-forbidden', 'scd-budget', 'scd-files', 'scd-dev']) expect(html).toContain(`id="${id}"`)
    for (const s of HOWTO_STEPS) expect(html).toContain(s.title)
    for (const s of DEV_STEPS) expect(html).toContain(s.title)
    for (const [path] of DEV_FILES) expect(html).toContain(path)
    for (const c of DEV_CHECKLIST) expect(html).toContain(c.slice(0, 40))
    for (const d of DEV_DONTS) expect(html).toContain(d.slice(0, 30))
    expect(html).toContain(PACK_FILES.checker)
    expect(html).toContain(PACK_FILES.templates)
    expect(html).toContain('Сохранить как PDF')
  })

  it('схемы и шаблоны — inline SVG, без кнопок «?» и без React-портала', () => {
    expect((html.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(4 + 2 + TEMPLATE_FILES.length)
    for (const t of TEMPLATE_FILES) expect(html).toContain(t.file)
    expect(html).toContain('aria-label="Холст кота 200×240')
    expect(html).not.toContain('htBtn')
    expect(html).not.toContain('<button')
  })

  it('числа и списки — из ядра', () => {
    const K = SPRITE_KINDS
    expect(html).toContain(`Кот ≤ <b>${K.cat.maxNodes}</b>`)
    expect(html).toContain(`предмет ≤ <b>${K.prop.maxNodes}</b>`)
    expect(html).toContain(`фон ≤ <b>${K.background.maxNodes}</b>`)
    expect(html).toContain(`≤ <b>${NODE_BUDGET}</b>`)
    expect(html).toContain(`<code>${CAT_VIEWBOX}</code>`)
    for (const p of CAT_PARTS) expect(html).toContain(`<code class="${K.cat.requiredParts.includes(p) ? 'scdReq' : ''}">${p}</code>`)
    for (const t of FORBIDDEN_TAGS) expect(html).toContain(`&lt;${t}&gt;`)
    for (const l of LAYERS) expect(html).toContain(`<code>${l}</code>`)
    for (const id of Object.keys(PALETTE_PRESETS)) expect(html).toContain(`<span class="scdPalName">${id}</span>`)
  })

  it('печать: A4, разрывы страниц между частями, шапка в thead', () => {
    expect(html).toContain('size: A4')
    expect(html).toContain('break-before: page')
    expect((html.match(/class="part"/g) ?? []).length).toBe(TOC.length)
    expect(html).toMatch(/<thead><tr><td>Pithy/)
  })
})

describe('пакет шаблонов (HTML с вкладками)', () => {
  const html = buildTemplatesPack()
  it('все шаблоны внутри, кнопки «Скачать» и «Скачать все», без внешних ссылок', () => {
    expect(external(html)).toEqual([])
    for (const t of TEMPLATE_FILES) {
      expect(html).toContain(`id="svg-${t.id}"`)
      expect(html).toContain(`data-file="${t.file}"`)
      expect(html).toContain(`id="pane-${t.id}"`)
    }
    expect(html).toContain('id="all"')
    expect(html).toContain('URL.createObjectURL')
    expect(html.length).toBeLessThan(40 * 1024)
  })
})
