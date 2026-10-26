import { describe, it, expect } from 'vitest'
import { buildMascot } from './mascotSprite.js'
import { parseMarkup, findByClass } from './markupTree.js'
import { MASCOT_PACKS, SKINS, facesOf, isFaceOf, isSkin } from './mascots.js'
import { applyMascotMouth, mouthShapeFor } from './mascotMouth.js'
import { countNodes, treeToString, treeToSvgDocument } from '../svgTree.js'
import { checkSpriteSvg } from '../../spriteCheck.js'

const parts = tree => new Set(treeToString(tree).match(/data-part="[a-z]+"/g))

describe('разбор разметки', () => {
  it('вложенные группы, самозакрытые теги, camelCase атрибутов', () => {
    const t = parseMarkup('<g class="a"><path d="M0 0" stroke-width="3"/><g class="b"></g></g><circle r="2"/>')
    expect(t).toHaveLength(2)
    expect(t[0].children.map(c => c.tag)).toEqual(['path', 'g'])
    expect(t[0].children[0].attrs).toEqual({ d: 'M0 0', strokeWidth: '3' })
    expect(findByClass(t, 'b')?.tag).toBe('g')
  })
})

describe('маскоты: пакеты', () => {
  it('два скина с состояниями; base есть у каждого', () => {
    expect(SKINS).toEqual(['kit', 'mia'])
    expect(facesOf('kit')).toEqual(['base', 'pretend', 'shy', 'love', 'bliss'])
    expect(facesOf('mia')).toEqual(['base', 'roll', 'smirk', 'pathos', 'sneer', 'interest'])
    expect(isSkin('kit')).toBe(true); expect(isSkin('x')).toBe(false); expect(isSkin('toString')).toBe(false)
    expect(isFaceOf('mia', 'love')).toBe(false)
  })
})

describe('маскоты: спрайт', () => {
  it.each(SKINS)('%s: все лица проходят spriteCheck и укладываются в лимит узлов', skin => {
    for (const face of facesOf(skin)) {
      const tree = buildMascot(skin, { face })
      const svg = treeToSvgDocument(tree, { viewBox: '0 0 200 240' })
      expect(checkSpriteSvg(svg, 'mascot'), `${skin}/${face}`).toEqual([])
      expect(countNodes(tree)).toBeLessThanOrEqual(100)
    }
  })

  it.each(SKINS)('%s: части хвост / тело / голова / глаза / рот и классы анимаций', skin => {
    const s = treeToString(buildMascot(skin))
    for (const p of ['tail', 'body', 'head', 'eyes', 'mouth']) expect(parts(buildMascot(skin)).has(`data-part="${p}"`), p).toBe(true)
    for (const c of ['cat-tail', 'cat-body', 'cat-head', 'cat-eyes']) expect(s).toContain(`class="${c}"`)
    expect(s).toContain(`data-skin="${skin}"`)
  })

  it('взгляд: родной — влево, поэтому левый персонаж зеркалится, правый нет', () => {
    expect(treeToString(buildMascot('kit', { flip: false }))).toContain('transform="translate(200 0) scale(-1 1) translate(')
    expect(treeToString(buildMascot('kit', { flip: true }))).not.toContain('scale(-1 1)')
  })

  it('extraFace=false и неизвестное лицо дают обычное; чужое лицо тоже', () => {
    const base = treeToString(buildMascot('kit'))
    expect(treeToString(buildMascot('kit', { face: 'love', extraFace: false }))).toBe(base)
    expect(treeToString(buildMascot('kit', { face: 'nope' }))).toBe(base)
    expect(treeToString(buildMascot('kit', { face: 'roll' }))).toBe(base) // 'roll' — лицо Мии
    expect(treeToString(buildMascot('kit', { face: 'love' }))).not.toBe(base)
  })

  it('реакция зрачков: масштаб зрачка по состоянию и пульс сердечек; выключена — зрачки обычные', () => {
    const on = treeToString(buildMascot('mia', { face: 'interest' }))
    const off = treeToString(buildMascot('mia', { face: 'interest', pupilReaction: false }))
    expect(on).toContain('scale(1.9 1.04)')
    expect(off).not.toContain('scale(1.9 1.04)')
    expect(treeToString(buildMascot('kit', { face: 'love' }))).toContain('mx-pulse')
    expect(treeToString(buildMascot('kit', { face: 'love', pupilReaction: false }))).not.toContain('mx-pulse')
    expect(on).not.toContain('data-x') // служебные координаты в дерево не попадают
  })

  it('наклон головы: слой .mx-tilt есть у любого лица (состав детей не меняется), значение — в style', () => {
    expect(treeToString(buildMascot('kit', { face: 'shy' }))).toContain('class="mx-tilt" style="transform:rotate(-2deg)"')
    expect(treeToString(buildMascot('kit'))).toContain('style="transform:rotate(0deg)"')
    const shape = t => treeToString(t).replace(/style="[^"]*"/, '').replace(/ data-[\w-]+="[^"]*"/g, '').match(/<g class="mx-tilt"/g)?.length
    expect(shape(buildMascot('mia', { face: 'sneer' }))).toBe(shape(buildMascot('mia')))
  })

  it('пустые контейнеры brows / dc не остаются в дереве', () => {
    expect(treeToString(buildMascot('kit'))).not.toMatch(/class="(brows|dc)"/)
  })

  it('рот в покое: у состояния свой «закрытый» рот, у base — стандартный; mouth меняет форму в дереве', () => {
    const rest = (skin, face, mouth) => findByClass([buildMascot(skin, { face, mouth })], 'mm').attrs.d
    expect(rest('kit', 'base')).toBe(MASCOT_PACKS.kit.mouthTable.X.m.d)
    expect(rest('kit', 'shy')).toBe(MASCOT_PACKS.kit.states.shy.mouth)
    expect(rest('kit', 'base', 'open')).toBe(MASCOT_PACKS.kit.mouthTable.D.m.d)
    expect(() => buildMascot('nope')).toThrow(/Неизвестный маскот/)
  })

  it('деревья независимы: сборка лица не портит пакет для следующей', () => {
    const a = treeToString(buildMascot('mia', { face: 'sneer' }))
    buildMascot('mia', { face: 'interest' })
    expect(treeToString(buildMascot('mia', { face: 'sneer' }))).toBe(a)
  })
})

describe('маскоты: рот в DOM', () => {
  const fake = (skin, face) => {
    const nodes = Object.fromEntries(['mm', 'mt', 'mf', 'ml'].map(c => [c, { a: {}, setAttribute(k, v) { this.a[k] = v } }]))
    return { nodes, getAttribute: k => ({ 'data-skin': skin, 'data-face': face })[k], querySelector: sel => nodes[sel.slice(1)] }
  }
  it('closed / half / open → формы X / C / D из таблицы пакета', () => {
    const el = fake('mia', 'base')
    applyMascotMouth(el, 'open')
    expect(el.nodes.mm.a.d).toBe(MASCOT_PACKS.mia.mouthTable.D.m.d)
    expect(el.nodes.mf.a.d).toBe(MASCOT_PACKS.mia.mouthTable.D.f)
    applyMascotMouth(el, 'closed')
    expect(el.nodes.mm.a.d).toBe(MASCOT_PACKS.mia.mouthTable.X.m.d)
    expect(mouthShapeFor('mia', 'base', 'half')).toBe(MASCOT_PACKS.mia.mouthTable.C)
  })
  it('закрытый рот берёт «рот в покое» лица, открытый — таблицу', () => {
    const el = fake('kit', 'shy')
    applyMascotMouth(el, 'closed')
    expect(el.nodes.mm.a.d).toBe(MASCOT_PACKS.kit.states.shy.mouth)
    expect(el.nodes.mt.a.d).toBe('')
    applyMascotMouth(el, 'open')
    expect(el.nodes.mm.a.d).toBe(MASCOT_PACKS.kit.mouthTable.D.m.d)
  })
  it('обычный кот (нет data-skin) не трогается', () => {
    const el = fake(null, null)
    applyMascotMouth(el, 'open')
    expect(Object.values(el.nodes).every(n => !Object.keys(n.a).length)).toBe(true)
  })
})
