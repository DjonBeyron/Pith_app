import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DEV_FILES, DEV_STEPS, DEV_DONTS, DEV_CHECKLIST, DEV_COMMANDS, DEV_INTRO, DEV_TITLE } from './designerDevTexts.js'
import { SPRITE_KINDS } from '../../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../../scene/v2/sceneBudget.js'
import { PACK_FILES } from './packConsts.js'
import { SLOTS_BY_LOCATION } from '../../../scene/v2/sprites/slots.js'

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const step = id => DEV_STEPS.find(s => s.id === id).body

describe('тексты «Для программиста / админа»', () => {
  it('каждый упомянутый путь к файлу существует в репозитории', () => {
    expect(DEV_FILES.length).toBeGreaterThan(8)
    for (const [path, what] of DEV_FILES) {
      expect(existsSync(join(ROOT, path)), `нет файла ${path}`).toBe(true)
      expect(what.trim()).not.toBe('')
    }
  })

  it('шаги, запреты и чек-лист непустые и в нужном порядке', () => {
    expect(DEV_STEPS.map(s => s.id)).toEqual(['accept', 'where', 'convert', 'slots', 'verify', 'see', 'ship'])
    for (const s of DEV_STEPS) { expect(s.title.trim()).not.toBe(''); expect(s.body.length).toBeGreaterThan(80) }
    expect(DEV_DONTS.length).toBeGreaterThanOrEqual(5)
    expect(DEV_CHECKLIST.length).toBeGreaterThanOrEqual(5)
    expect(DEV_TITLE).toContain('программиста')
    expect(DEV_INTRO.length).toBeGreaterThan(50)
  })

  it('числа и имена — из ядра: лимиты, бюджет, файл проверки, слоты', () => {
    expect(step('verify')).toContain(`предмет ≤ ${SPRITE_KINDS.prop.maxNodes}`)
    expect(step('verify')).toContain(`кот ≤ ${SPRITE_KINDS.cat.maxNodes}`)
    expect(step('verify')).toContain(`бюджет ${NODE_BUDGET}`)
    expect(step('accept')).toContain(PACK_FILES.checker)
    const slotIds = new Set(Object.values(SLOTS_BY_LOCATION).flat().map(s => s.id))
    for (const id of ['floor-left', 'floor-right', 'counter', 'wall-art', 'wall-board', 'wall-menu']) {
      expect(slotIds.has(id), id).toBe(true)
      expect(step('slots')).toContain(id)
    }
    for (const c of DEV_COMMANDS) expect(DEV_STEPS.map(s => s.body).join(' ')).toContain(c)
  })
})
