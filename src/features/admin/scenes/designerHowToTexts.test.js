import { describe, it, expect } from 'vitest'
import { CAT_PARTS } from '../../scene/v2/sprites/catSprite.js'
import { FORBIDDEN_TAGS, SPRITE_KINDS } from '../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../scene/v2/sceneBudget.js'
import { HOWTO_STEPS, APP_POINTS, EXPORT_HINTS, GOODBAD, TAG_WORDS, banWords, FILE_EXAMPLES } from './designerHowToTexts.js'

const step = id => HOWTO_STEPS.find(s => s.id === id).body

describe('тексты инструкции дизайнера', () => {
  it('5 шагов и пункты «в приложении» непустые', () => {
    expect(HOWTO_STEPS).toHaveLength(5)
    for (const s of HOWTO_STEPS) { expect(s.title.trim()).not.toBe(''); expect(s.body.trim()).not.toBe('') }
    expect(APP_POINTS.length).toBeGreaterThanOrEqual(3)
    expect(APP_POINTS.length).toBeLessThanOrEqual(5)
    for (const [, t] of APP_POINTS) expect(t.trim()).not.toBe('')
    expect(EXPORT_HINTS.length).toBeGreaterThan(0)
    expect(GOODBAD.good).toContain('closed')
  })

  it('числа берутся из ядра', () => {
    const ban = step('ban')
    expect(ban).toContain(`до ${SPRITE_KINDS.cat.maxNodes} узлов`)
    expect(ban).toContain(`до ${SPRITE_KINDS.prop.maxNodes}`)
    expect(ban).toContain(`до ${SPRITE_KINDS.background.maxNodes}`)
    expect(ban).toContain(`не больше ${NODE_BUDGET}`)
  })

  it('все части кота и виземы названы в тексте', () => {
    for (const p of CAT_PARTS) expect(step('draw')).toContain(p)
    for (const v of SPRITE_KINDS.cat.requiredVisemes) expect(step('draw')).toContain(v)
  })

  it('каждый запрещённый тег имеет слова и попал в текст', () => {
    for (const t of FORBIDDEN_TAGS) expect(TAG_WORDS[t], `нет слов для тега ${t}`).toBeTruthy()
    for (const w of banWords()) expect(step('ban')).toContain(w)
  })

  it('примеры имён файлов проходят правило латиницы', () => {
    for (const f of FILE_EXAMPLES) { expect(f).toMatch(/^[a-z0-9-]+\.svg$/); expect(step('check')).toContain(f) }
  })
})
