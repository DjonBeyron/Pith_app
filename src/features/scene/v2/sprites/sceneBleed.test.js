import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { BACKGROUNDS, LOCATIONS, SCENE_W, SCENE_H, FLOOR_Y, BLEED } from './backgrounds.js'
import { slotsFor, catPlacement } from './slots.js'
import { getSprite } from './spriteRegistry.js'
import { countNodes } from './svgTree.js'
import { SPRITE_KINDS } from '../spriteCheck.js'
import { sceneNodeBudget, NODE_BUDGET } from '../sceneBudget.js'
import { sceneStaticMarkup } from '../staticMarkup.js'
import { demoOfficeScene, demoCafeScene, demoPitCircleScene } from '../demoScenes.js'

// Стражи стандарта 2026-10-15: пол продолжается за кадр, настенные предметы компактны и не накладываются, бюджет узлов цел

const findPart = (tree, name) => (tree.attrs['data-part'] === name ? tree : tree.children.map(c => findPart(c, name)).find(Boolean))
const firstRect = g => g.children.find(c => c.tag === 'rect').attrs

describe('фон продолжается за кадр 360×640', () => {
  for (const loc of LOCATIONS) {
    const tree = BACKGROUNDS[loc].build()
    it(`${loc}: пол уходит вниз и в стороны далеко за кадр, стена — вверх и в стороны`, () => {
      const floor = firstRect(findPart(tree, 'floor'))
      expect(floor.y).toBe(FLOOR_Y)
      expect(floor.y + floor.height).toBeGreaterThanOrEqual(SCENE_H + 1000) // хватает на любой слайд и ручной feedFrame
      expect(floor.x).toBeLessThanOrEqual(-BLEED.x)
      expect(floor.x + floor.width).toBeGreaterThanOrEqual(SCENE_W + BLEED.x)
      const wall = firstRect(findPart(tree, 'wall'))
      expect(wall.y).toBeLessThanOrEqual(-1000)
      expect(wall.y + wall.height).toBe(FLOOR_Y)
      expect(wall.x).toBeLessThanOrEqual(-BLEED.x)
    })
    it(`${loc}: узор пола продолжается ниже кадра (линии досок есть и за y 640), узлов не больше лимита фона`, () => {
      const lines = findPart(tree, 'floor').children.find(c => c.attrs.opacity === 0.6).attrs.d
      const ys = [...lines.matchAll(/M-?\d+ (\d+) H/g)].map(m => +m[1])
      expect(ys.some(y => y > SCENE_H + 500)).toBe(true)
      expect(countNodes(tree)).toBeLessThanOrEqual(SPRITE_KINDS.background.maxNodes)
    })
  }

  it('статичная разметка несёт тот же фон (staticMarkup): пол ниже кадра есть', () => {
    const html = sceneStaticMarkup({ ...demoOfficeScene }, null, 0)
    expect(html).toMatch(new RegExp(`<rect[^>]*y="${FLOOR_Y}"[^>]*height="${SCENE_H - FLOOR_Y + BLEED.bottom}"`))
  })

  it('лента рисует SVG с overflow: visible (иначе фон обрежется по viewBox)', () => {
    const css = fs.readFileSync(new URL('../../../../styles/feed-scene.css', import.meta.url), 'utf8')
    const block = css.match(/\.slideSceneRoot \.scn__svg\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toMatch(/overflow:\s*visible/)
  })
})

// Габарит слота в худшем случае (самый большой из допустимых спрайтов) в координатах кадра
function slotRect(slot) {
  const k = slot.scale ?? 1
  let w = 0
  let h = 0
  let anchor = 'center'
  for (const id of slot.accepts) {
    const s = getSprite(id)
    w = Math.max(w, s.size.w * k)
    h = Math.max(h, s.size.h * k)
    anchor = s.anchor
  }
  const y0 = anchor === 'bottom' ? slot.y - h : anchor === 'top' ? slot.y : slot.y - h / 2
  return { l: slot.x - w / 2, r: slot.x + w / 2, t: y0, b: y0 + h }
}
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

describe('компактные якоря слотов: ничего не накладывается', () => {
  for (const loc of LOCATIONS) {
    const slots = slotsFor(loc)
    const rects = slots.map(s => ({ s, r: slotRect(s) }))
    it(`${loc}: настенные слоты не пересекаются друг с другом и со стойкой/полом/столом`, () => {
      const wall = rects.filter(x => x.s.layer === 'wall')
      const others = rects.filter(x => x.s.layer !== 'wall' && x.s.layer !== 'tabletop')
      for (let i = 0; i < wall.length; i++) {
        for (let j = i + 1; j < wall.length; j++) {
          // подвесная лампа висит перед окном по слоям, но по габаритам не должна заходить на него
          expect(hit(wall[i].r, wall[j].r), `${wall[i].s.id} × ${wall[j].s.id}`).toBe(false)
        }
        for (const o of others) expect(hit(wall[i].r, o.r), `${wall[i].s.id} × ${o.s.id}`).toBe(false)
      }
    })
    it(`${loc}: настенные предметы собраны к центру — выше пола и ниже y 90, окно не выше y 150`, () => {
      for (const { s, r } of rects.filter(x => x.s.layer === 'wall')) {
        expect(r.b, s.id).toBeLessThan(FLOOR_Y - 60)
        expect(r.t, s.id).toBeGreaterThanOrEqual(90)
      }
      expect(rects.find(x => x.s.id === 'window').r.t).toBeGreaterThanOrEqual(150)
    })
    it(`${loc}: настенное не доходит до голов котов, коты стоят на прежнем месте`, () => {
      expect(Math.max(...rects.filter(x => x.s.layer === 'wall').map(x => x.r.b))).toBeLessThan(catPlacement('a').y)
      expect(catPlacement('a').y).toBe(444)
      expect(catPlacement('b', false).x).toBe(198)
    })
  }
})

describe('бюджет узлов с максимумом слотов', () => {
  const full = { ...demoOfficeScene, slots: { ...demoOfficeScene.slots } }
  const cafe = { ...demoCafeScene }
  for (const [name, scene] of [['офис', full], ['кафе', cafe], ['Пит solo', demoPitCircleScene]]) {
    it(`${name}: ≤ ${NODE_BUDGET}`, () => expect(sceneNodeBudget(scene)).toBeLessThanOrEqual(NODE_BUDGET))
  }
})
