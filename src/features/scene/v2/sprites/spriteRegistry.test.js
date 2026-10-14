import { describe, it, expect } from 'vitest'
import { SPRITES, getSprite, PROP_IDS, catSprite, spritesForSlot } from './spriteRegistry.js'
import { SLOTS_BY_LOCATION, slotsFor, slotAccepts, emptySlots, slotsInDrawOrder, COMMON_SLOT_IDS } from './slots.js'
import { countNodes, treeToSvgDocument, treeToString, el } from './svgTree.js'
import { buildCat } from './catSprite.js'
import { checkSpriteSvg, SPRITE_KINDS } from '../spriteCheck.js'
import { sceneNodeBudget, sceneNodeBreakdown, NODE_BUDGET } from '../sceneBudget.js'
import { demoOfficeScene, demoCafeScene } from '../demoScenes.js'
import { defaultSlots } from '../sceneMigrate.js'

describe('реестр спрайтов', () => {
  it('состав: 2 кота, 5 офис, 5 кафе, 5 общих, 2 фона; id уникальны', () => {
    const by = cat => SPRITES.filter(s => s.category === cat).length
    expect(by('character-part')).toBe(2)
    expect(by('office')).toBe(5)
    expect(by('cafe')).toBe(5)
    expect(by('common')).toBe(5)
    expect(by('background')).toBe(2)
    expect(new Set(SPRITES.map(s => s.id)).size).toBe(SPRITES.length)
    SPRITES.forEach(s => expect(s.title, s.id).toMatch(/[А-Яа-яЁё]/))
  })

  it('каждый спрайт проходит spriteCheck своего типа и лимит узлов', () => {
    for (const s of SPRITES) {
      const tree = s.build({})
      const svg = treeToSvgDocument(tree, { viewBox: s.viewBox })
      expect(checkSpriteSvg(svg, s.kind), `${s.id}: ${checkSpriteSvg(svg, s.kind).join('; ')}`).toEqual([])
      expect(s.nodeCount).toBe(countNodes(tree))
      expect(s.nodeCount).toBeLessThanOrEqual(SPRITE_KINDS[s.kind].maxNodes)
    }
  })

  it('каждый предмет ставится хотя бы в один слот, и каждый accepts указывает на предмет', () => {
    for (const id of PROP_IDS) expect(getSprite(id).slots.length, id).toBeGreaterThan(0)
    for (const slots of Object.values(SLOTS_BY_LOCATION)) {
      for (const slot of slots) {
        for (const id of slot.accepts) expect(getSprite(id)?.kind, `${slot.id} → ${id}`).toBe('prop')
        expect(spritesForSlot(slot).map(s => s.id)).toEqual(slot.accepts)
      }
    }
  })

  it('предметы локации совместимы со слотами своей локации', () => {
    for (const loc of ['office', 'cafe']) {
      const ids = SPRITES.filter(s => s.category === loc).map(s => s.id)
      for (const id of ids) expect(slotsFor(loc).some(sl => slotAccepts(sl, id)), `${loc}/${id}`).toBe(true)
    }
    const common = SPRITES.filter(s => s.category === 'common').map(s => s.id)
    for (const id of common) {
      expect(slotsFor('office').some(sl => slotAccepts(sl, id)), `office/${id}`).toBe(true)
      expect(slotsFor('cafe').some(sl => slotAccepts(sl, id)), `cafe/${id}`).toBe(true)
    }
  })

  it('слоты: по 10 на локацию, 5 общих; порядок отрисовки стена → пол → стол → на столе', () => {
    expect(slotsFor('office')).toHaveLength(10)
    expect(slotsFor('cafe')).toHaveLength(10)
    expect(COMMON_SLOT_IDS).toHaveLength(5)
    expect(Object.keys(emptySlots('cafe'))).toHaveLength(10)
    const layers = slotsInDrawOrder('office').map(s => s.layer)
    const order = ['wall', 'floor', 'table', 'tabletop']
    expect([...layers].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(layers)
    expect(slotsFor('nowhere')).toEqual([])
  })
})

describe('кот: пол и части', () => {
  it('мужской и женский варианты различимы по частям', () => {
    const m = treeToString(buildCat({ gender: 'male' }))
    const f = treeToString(buildCat({ gender: 'female' }))
    expect(m).toContain('data-part="collar"')
    expect(m).toContain('data-part="tufts"')
    expect(m).not.toContain('data-part="bow"')
    expect(f).toContain('data-part="bow"')
    expect(f).toContain('data-part="lashes"')
    expect(f).not.toContain('data-part="collar"')
    expect(catSprite('female').gender).toBe('female')
    expect(catSprite(undefined).gender).toBe('male')
  })

  it('три виземы рта и четыре эмоции собираются; цвета берутся из палитры', () => {
    const s = treeToString(buildCat({ palette: { fur: '#123456' } }))
    for (const v of ['closed', 'half', 'open']) expect(s).toContain(`data-viseme="${v}"`)
    expect(s).toContain('#123456')
    for (const e of ['neutral', 'happy', 'tired', 'surprised']) expect(countNodes(buildCat({ emotion: e }))).toBeGreaterThan(40)
    expect(treeToString(buildCat({ flip: true }))).toContain('scale(-1 1)')
    // Без полосок: нет полос на лбу, теле и хвосте (коготки на лапах остаются)
    const plain = treeToString(buildCat({ stripes: false }))
    expect(plain).not.toContain('M-12 -40 q4 10 0 20')
    expect(plain).not.toContain('M50 146 q10 8 18 0')
    expect(plain.match(/stroke="#d9843d"/g)).toHaveLength(1)
  })
})

describe('бюджет узлов', () => {
  it('демо-сцены укладываются в бюджет; разбивка сходится', () => {
    for (const s of [demoOfficeScene, demoCafeScene]) {
      const total = sceneNodeBudget(s)
      expect(total).toBeLessThanOrEqual(NODE_BUDGET)
      const b = sceneNodeBreakdown(s)
      expect(b.background + b.characters + b.props).toBe(total)
      expect(b.characters).toBeGreaterThan(80)
    }
  })

  it('все слоты заняты самыми тяжёлыми предметами — всё ещё ≤ бюджета', () => {
    for (const loc of ['office', 'cafe']) {
      const slots = Object.fromEntries(slotsFor(loc).map(sl => {
        const heaviest = sl.accepts.map(getSprite).sort((a, b) => b.nodeCount - a.nodeCount)[0]
        return [sl.id, heaviest.id]
      }))
      const scene = { ...demoOfficeScene, location: loc, slots }
      expect(sceneNodeBudget(scene), loc).toBeLessThanOrEqual(NODE_BUDGET)
    }
  })

  it('пустые слоты и мусор не ломают счёт; слоты по умолчанию миграции заполнены', () => {
    expect(sceneNodeBudget(null)).toBe(0)
    const bare = sceneNodeBudget({ location: 'office', characters: {}, slots: {} })
    expect(bare).toBeGreaterThan(100)
    expect(sceneNodeBudget({ location: 'office', characters: {}, slots: defaultSlots('office') })).toBeGreaterThan(bare)
  })
})

describe('svgTree', () => {
  it('запрещённый тег — ошибка; строка с экранированием и kebab-атрибутами', () => {
    expect(() => el('filter')).toThrow(/запрещён/)
    const s = treeToString(el('g', { strokeWidth: 2, 'data-part': 'x', hidden: false }, [el('text', { children: 'a<b' })]))
    expect(s).toBe('<g stroke-width="2" data-part="x"><text>a&lt;b</text></g>')
  })
})
