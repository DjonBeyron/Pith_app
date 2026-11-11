import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createBubbles, bubbleHomes, bubblesAt, bubblePos, burstFrames, burstBubbles, BUB_COUNT, BUB_SETS, BUB_BOB, BUB_SWAY } from './wordLaneBubbles.js'
import { surfaceAt, halfAt, lineAt, SURF_PX, TIP_PX } from './wordLaneLevel.js'
import { createPool, POOL } from './wordLanePool.js'
import { snapPill, burstOrigin } from './wordLaneSnap.js'
import { makeParticle } from '../../../../shared/lib/burstParticles.js'
import { createDoc, fakePill } from '../../../pillstand/pillStandFakeDom.js'

const weak = vi.hoisted(() => ({ on: false }))
const fire = vi.hoisted(() => ({ calls: [] }))
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => weak.on }))
vi.mock('../../../../shared/lib/burstParticles.js', async orig => ({ ...(await orig()), fireBurst: o => { fire.calls.push(o) } }))
afterEach(() => { weak.on = false; fire.calls.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals() })

// Пузыри в жидкости пилюли (v3.3.185, владелец: «частицы как единый кластер плавают в заполненной части капсулы, и как только заполнится капсула, вырываются сверху наружу»): геометрия — пузырь всегда под
// поверхностью и внутри стенок; набор узлов постоянен; наружу — только при хлопке (зачёт), и вылетают те же узлы.
const VERT = [{ w: 80, h: 167 }, { w: 78, h: 158 }, { w: 68, h: 141 }], WIDE = [{ w: 306, h: 92, wide: true }, { w: 285, h: 85, wide: true }]
const inside = (p, r, geo) => { // круг радиуса r с центром p (px от угла клипа) целиком внутри капсулы
  const L = geo.wide ? geo.w : geo.h, R = (geo.wide ? geo.h : geo.w) / 2, a = geo.wide ? p.x : geo.h - p.y, across = (geo.wide ? p.y : p.x) - R
  const t = a < R ? R - a : a > L - R ? a - (L - R) : 0
  return Math.hypot(t, across) <= R - r + 1e-6
}

describe('геометрия: пузырь всегда под поверхностью и внутри стенок', () => {
  it('при любой заливке каждый видимый пузырь — вместе с покачиванием — ниже линии уровня и не касается стенок (вертикальная и широкая пилюля, разные размеры и наборы)', () => {
    for (const geo of [...VERT, ...WIDE]) for (const seed of [22, 29, 36]) {
      const homes = bubbleHomes(geo, BUB_COUNT, seed)
      expect(homes).toHaveLength(BUB_COUNT)
      for (let v = 0; v <= 1.0001; v += 0.01) {
        const surf = surfaceAt(v, geo)
        for (const h of homes.filter(x => v >= x.von)) for (const [da, ds] of [[BUB_BOB, BUB_SWAY], [BUB_BOB, -BUB_SWAY], [-BUB_BOB, BUB_SWAY], [-BUB_BOB, -BUB_SWAY], [0, 0]]) {
          const p = bubblePos({ ...h, d: h.d - da, o: h.o + ds }, v, geo)                 // крайние точки хода: da — к поверхности / от неё, ds — поперёк
          const a = geo.wide ? p.x : geo.h - p.y
          expect(a + h.r).toBeLessThan(surf)                                             // не выше уровня (широкая — не правее фронта)
          expect(inside(p, h.r, geo)).toBe(true)
        }
      }
    }
  })
  it('кластер растёт вместе с уровнем и уходит вместе с ним: пустая — ни одного, чем выше заливка — тем больше, у полной — все', () => {
    for (const geo of [VERT[0], WIDE[0]]) {
      const homes = bubbleHomes(geo)
      expect(bubblesAt(homes, 0)).toBe(0); expect(bubblesAt(homes, 0.05)).toBe(0)
      let prev = 0
      for (let v = 0; v <= 1.0001; v += 0.02) { const n = bubblesAt(homes, v); expect(n).toBeGreaterThanOrEqual(prev); prev = n }
      expect(bubblesAt(homes, 0.3)).toBeGreaterThanOrEqual(1); expect(bubblesAt(homes, 0.3)).toBeLessThan(BUB_COUNT)
      expect(bubblesAt(homes, 0.85)).toBeGreaterThanOrEqual(BUB_COUNT - 2)                // потолок голоса (FILL_CAP) — почти все
      expect(bubblesAt(homes, 1)).toBe(BUB_COUNT)
      expect(new Set(homes.map(h => Math.sign(h.o))).size).toBe(2)                       // по обе стороны от оси
    }
  })
  it('повторяемо: тот же сид — те же дома (свой счётчик, не случайные числа браузера)', () => {
    expect(bubbleHomes(VERT[0], 8, 22)).toEqual(bubbleHomes(VERT[0], 8, 22))
    expect(bubbleHomes(VERT[0], 8, 22)).not.toEqual(bubbleHomes(VERT[0], 8, 29))
  })
  it('линия уровня: на поверхности (тот же отсчёт), у скруглённых торцов короче, кончики за стенкой при любой заливке; у дна и у верха гаснет', () => {
    const geo = VERT[0], R = geo.w / 2
    expect(lineAt(0.5, geo)).toEqual({ scale: 1, opacity: 1 })
    for (const v of [0.05, 0.1, 0.2, 0.9, 0.95]) {
      const half = halfAt(surfaceAt(v, geo), geo), len = lineAt(v, geo).scale * (R + TIP_PX)
      expect(len - half).toBeCloseTo(TIP_PX, 1)                                          // полудлина линии = полуширина поверхности + кончик
    }
    expect(lineAt(0, geo).opacity).toBe(0); expect(lineAt(1, geo).opacity).toBe(0); expect(lineAt(0.02, geo).opacity).toBeLessThan(1)
    expect(surfaceAt(1, geo)).toBe(geo.h + SURF_PX)                                      // полная: поверхность за торцом клипа — запас
  })
})

describe('вылет при хлопке: те же узлы, наружу', () => {
  it('вертикальная: каждый пузырь уходит выше верхнего края клипа и гаснет уже там; старт — с места, где он был', () => {
    const geo = VERT[0]
    for (const h of bubbleHomes(geo)) for (const [a, b] of [[0, 0], [1, 1], [0.5, 0.2]]) {
      const f = burstFrames(h, geo, { from: { transform: 'matrix(1, 0, 0, 1, 2, -3)', opacity: 0.7 }, a, b })
      expect(f[0]).toMatchObject({ transform: 'matrix(1, 0, 0, 1, 2, -3)', opacity: 0.7 })
      const ty = k => Number(/translate\(-?[\d.]+px, (-?[\d.]+)px\)/.exec(f[k].transform)[1])
      const y0 = bubblePos(h, 1, geo).y
      expect(y0 + ty(2)).toBeLessThan(-16)                                               // вершина — над пилюлей (клип + зазор + обводка ≈ 4…5 px)
      expect(y0 + ty(3)).toBeLessThan(-8)                                                // и гаснет снаружи
      expect(f[1].opacity).toBe(1); expect(f.at(-1).opacity).toBe(0)
      expect(f.every(x => Object.keys(x).every(key => ['transform', 'opacity', 'offset', 'easing'].includes(key)))).toBe(true)
    }
    expect(burstFrames(bubbleHomes(geo)[0], geo)[0].transform).toBe('translate(0px, 0px) scale(1)') // вычисленного стиля нет — с дома
  })
  it('широкая: вверх через стенку у переднего торца (справа до края экрана ≈ 40 px), снос вправо небольшой', () => {
    const geo = WIDE[0]
    for (const h of bubbleHomes(geo)) {
      const f = burstFrames(h, geo, { a: 0.5, b: 1 })
      const [tx, ty] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(f[2].transform).slice(1).map(Number)
      expect(bubblePos(h, 1, geo).y + ty).toBeLessThan(-16)
      expect(tx).toBeGreaterThan(0); expect(tx).toBeLessThan(40)
    }
  })
})

function rig() {
  const doc = createDoc(), made = []
  const base = doc.createElement
  doc.createElement = tag => { const n = base(tag); n.anims = []; n.animate = vi.fn((frames, opts) => { let fin; const a = { frames, opts, cancel: vi.fn(), finished: new Promise(r => { fin = r }) }; a.finish = fin; n.anims.push(a); return a }); made.push(n); return n }
  const pill = () => fakePill(doc)
  return { doc, pill, made, bubs: createBubbles({ off: () => weak.on, view: () => ({ getComputedStyle: n => ({ transform: n.style.transform || 'none', opacity: '0.8' }) }) }) }
}

describe('набор узлов: постоянный, наружу — только при хлопке', () => {
  const geo = VERT[0]
  it('набор выдаётся растущей заливке и кладётся в слой уровня; узлы создаются один раз; видимые — по порогам; transform набора — тот же, что у слоя уровня', () => {
    const { pill, bubs, made } = rig(), p = pill()
    expect(bubs.level(p, 0.3, geo, 'translateY(70.0%)', false)).toBe(0)                  // не растёт — набора нет
    expect(p.querySelector('.wlBubs')).toBeNull()
    const n1 = bubs.level(p, 0.3, geo, 'translateY(70.0%)', true)
    const box = p.querySelector('.wlPillSparks .wlBubs')
    expect(box.children).toHaveLength(BUB_COUNT); expect(box.style.transform).toBe('translateY(70.0%)')
    expect(box.children.filter(n => !n.hasAttribute('data-off'))).toHaveLength(n1)
    expect(n1).toBe(bubblesAt(bubbleHomes(geo), 0.3)); expect(n1).toBeGreaterThan(0)
    const created = made.length
    for (let v = 0.3; v <= 0.9; v += 0.01) bubs.level(p, v, geo, `translateY(${((1 - v) * 100).toFixed(1)}%)`, true)
    expect(made.length).toBe(created)                                                    // за сотню кадров — ни одного нового узла
    expect(bubs.count(p)).toBe(bubblesAt(bubbleHomes(geo), 0.9))
    expect(box.children.every(n => /left:calc\(50% \+ -?[\d.]+px\);top:[\d.]+px;width:[\d.]+px;height:[\d.]+px;animation-duration:[\d.]+s;animation-delay:-?[\d.]+s/.test(n.style.cssText))).toBe(true)
    expect(bubs.level(p, 0.2, geo, 'translateY(80.0%)', false)).toBeLessThan(n1 + 1)     // жидкость стекает — кластер опускается и редеет
    expect(bubs.level(p, 0, geo, 'translateY(100.0%)', false)).toBe(0)
    expect(p.querySelector('.wlBubs')).toBeNull()                                        // пусто — набор вернулся в запас
    expect(made.every(n => n.animate.mock.calls.length === 0)).toBe(true)                // пока хлопка нет, наружу ничего не летит
  })
  it('наборов не больше BUB_SETS: четвёртая пилюля — без пузырей; освободившийся набор переходит к следующей (те же узлы)', () => {
    const { pill, bubs, made } = rig(), ps = Array.from({ length: BUB_SETS + 1 }, pill)
    ps.forEach(p => bubs.level(p, 0.6, geo, 't', true))
    expect(bubs.sets()).toBe(BUB_SETS)
    expect(made.filter(n => n.className === 'wlBub')).toHaveLength(BUB_SETS * BUB_COUNT)
    expect(ps.map(p => !!p.querySelector('.wlBubs'))).toEqual([true, true, true, false])
    const box = ps[0].querySelector('.wlBubs')
    bubs.clear(ps[0])
    expect(ps[0].querySelector('.wlBubs')).toBeNull()
    bubs.level(ps[3], 0.61, geo, 't', true)
    expect(ps[3].querySelector('.wlBubs')).toBe(box)
    expect(made.filter(n => n.className === 'wlBub')).toHaveLength(BUB_SETS * BUB_COUNT)
  })
  it('хлопок: вылетают ровно видимые узлы (новых не создаётся), каждый — одной анимацией transform + opacity со своего места; второй хлопок — ничего; долетели — набор в запасе', async () => {
    const { pill, bubs, made } = rig(), p = pill()
    bubs.level(p, 0.8, geo, 't', true); bubs.level(p, 1, geo, 'translateY(0.0%)', true)
    const box = p.querySelector('.wlBubs'), created = made.length
    box.children[0].style.transform = 'matrix(1, 0, 0, 1, 2, -3)'
    expect(burstBubbles(p)).toBe(BUB_COUNT)
    expect(made.length).toBe(created)
    expect(box.hasAttribute('data-out')).toBe(true); expect(bubs.out(p)).toBe(true)
    expect(box.children.every(n => n.animate.mock.calls.length === 1)).toBe(true)
    const first = box.children[0].anims[0]
    expect(first.frames[0]).toMatchObject({ transform: 'matrix(1, 0, 0, 1, 2, -3)', opacity: 0.8 })
    expect(first.opts.duration).toBeGreaterThanOrEqual(600); expect(first.opts.duration).toBeLessThanOrEqual(920)
    expect(burstBubbles(p)).toBe(0)
    expect(bubs.level(p, 1, geo, 'translateY(0.0%)', false)).toBe(BUB_COUNT)             // кадры после хлопка набор не трогают
    box.children.forEach(n => n.anims[0].finish())
    await new Promise(r => setTimeout(r, 0))
    expect(p.querySelector('.wlBubs')).toBeNull()
    expect(bubs.level(p, 1, geo, 't', true)).toBe(0)                                     // пилюля, чьи пузыри вылетели, новых не получает…
    bubs.clear(p)
    expect(bubs.level(p, 0.5, geo, 't', true)).toBeGreaterThan(0)                        // …пока не вернулась в пул
  })
  it('слабое устройство — пузырей нет; «не успел» и пилюля без размеров — тоже; пузырей нет — хлопок их не выдумывает', () => {
    const { pill, bubs } = rig()
    weak.on = true
    const p = pill(); expect(bubs.level(p, 0.6, geo, 't', true)).toBe(0); expect(p.querySelector('.wlBubs')).toBeNull(); expect(burstBubbles(p)).toBe(0)
    weak.on = false
    const f = pill(); f.setAttribute('data-fail', '1'); expect(bubs.level(f, 0.6, geo, 't', true)).toBe(0)
    expect(bubs.level(pill(), 0.6, { w: 0, h: 0 }, 't', true)).toBe(0)
    const jump = pill(); expect(bubs.level(jump, 1, geo, 't', true)).toBe(0); expect(jump.querySelector('.wlBubs')).toBeNull() // залита до края одним шагом (тап) — плавать было негде, набор не выдаётся
  })
})

describe('пул и щелчок', () => {
  function poolRig(cls = '') {
    const doc = createDoc(), base = doc.createElement
    doc.createElement = tag => { const n = base(tag); n.animate = vi.fn(() => ({ cancel() {}, finished: new Promise(() => {}) })); return n }
    const pills = Array.from({ length: POOL }, () => { const p = fakePill(doc); Object.assign(p.querySelector('.wlPillClip'), { offsetHeight: 167, offsetWidth: 80 }); p.dataset = {}; p.animate = vi.fn(() => ({ cancel() {}, finished: new Promise(() => {}) })); p.getBoundingClientRect = () => ({ left: 100, top: 200, width: 88, height: 175 }); return p })
    let t = 5000
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    vi.stubGlobal('document', doc); vi.stubGlobal('navigator', {})
    return { pool: createPool({ querySelectorAll: s => (s === '[data-pill]' ? pills : []), classList: { contains: c => cls.split(' ').includes(c) } }), pills, tick: ms => { t += ms } }
  }
  it('рост заливки — набор на пилюле, его transform = transform слоя уровня и слоя заливки; заливка стоит — узлы те же; give — убраны', () => {
    const { pool, pills, tick } = poolRig()
    const k = pool.take(1, { flight: false }), el = pills[k]
    pool.paintFill(k, 0.4)
    const box = el.querySelector('.wlBubs')
    expect(box.style.transform).toBe(el.querySelector('.wlPillFill').style.transform)
    expect(box.style.transform).toBe(el.querySelector('.wlPillSparks i').style.transform)
    tick(16); pool.paintFill(k, 0.4); tick(16); pool.paintFill(k, 0.3)
    expect(el.querySelector('.wlBubs')).toBe(box); expect(box.style.transform).toBe('translateY(70.0%)')
    pool.give(k)
    expect(el.querySelector('.wlBubs')).toBeNull()
    const k2 = pool.take(1, { flight: false }); tick(16); pool.paintFill(k2, 0.5)
    expect(pills[k2].querySelector('.wlBubs')).not.toBeNull()
    pool.attr(k2, 'data-fail'); expect(pills[k2].querySelector('.wlBubs')).toBeNull() // «не успел» — набор сразу в запас
  })
  it('щелчок: пузыри пилюли вылетают, отдельного залпа искр нет; у пилюли без пузырей (слабое устройство — класс wl--lite) — прежний залп из края', () => {
    const a = poolRig()
    const k = a.pool.take(1, { flight: false })
    a.pool.paintFill(k, 0.5); a.pool.paintFill(k, 1)
    expect(snapPill(a.pills[k], 1)).toBe(BUB_COUNT)
    expect(fire.calls).toHaveLength(0)
    expect(a.pills[k].querySelector('.wlBubs').hasAttribute('data-out')).toBe(true)
    const b = poolRig('wl--lite')
    const k2 = b.pool.take(1, { flight: false })
    b.pool.paintFill(k2, 0.5); b.pool.paintFill(k2, 1)
    expect(b.pills[k2].querySelector('.wlBubs')).toBeNull()
    expect(snapPill(b.pills[k2], 1)).toBe(0)
    expect(fire.calls).toHaveLength(1); expect(fire.calls[0].origin).toMatchObject({ x: 144, y: 206 })
  })
  it('запасной залп — из края, в который упёрлась жидкость: вертикальная — из верхней кромки вверх; широкая — из правого торца вправо-вверх', () => {
    const r = { left: 100, top: 200, width: 80, height: 160 }, w = { left: 20, top: 300, width: 330, height: 90 }
    expect(burstOrigin(r)).toMatchObject({ x: 140, y: 206 }); expect(burstOrigin(r).angle).toBeUndefined()
    const o = burstOrigin(w, true)
    expect(o.x).toBe(20 + 330 - 45); expect(o.y).toBe(345); expect(o.angle).toBeLessThan(0); expect(o.angle).toBeGreaterThan(-Math.PI / 2)
    const dx = p => Number(/translate\((-?[\d.]+)px/.exec(p.frames.at(-1).transform)[1])
    expect(Array.from({ length: 200 }, () => dx(makeParticle(375, 200, 3.5, ['#fff'], o))).filter(x => x > 0).length).toBeGreaterThan(190)
  })
})

describe('вёрстка пузырей', () => {
  const css = readFileSync(fileURLToPath(new URL('../../../../styles/player/modules/word-lane-bubbles.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  it('только фон и transform / opacity — без filter, box-shadow и will-change; покачивание на паузе, идёт только у наливающейся; выключенный пузырь — display: none; слабое устройство и «не успел» — скрыты', () => {
    expect(css).not.toMatch(/filter|box-shadow|will-change|transition/)
    for (const m of css.matchAll(/@keyframes (\w+) \{([^\n]*)\}\n/g)) expect([...m[2].matchAll(/([a-z-]+):/g)].map(x => x[1]).every(p => p === 'transform' || p === 'opacity')).toBe(true)
    expect([...css.matchAll(/@keyframes/g)]).toHaveLength(3)
    expect(css).toMatch(/\.wlBub \{[^}]*animation: wlBubA 2\.2s ease-in-out infinite alternate paused;/)
    expect(css).toContain('.wlPill[data-live] .wlBub { animation-play-state: running; }')
    expect(css).toContain('.wlBub[data-off] { display: none; }')
    expect(css).toContain('.wl--lite .wlBubs, .weak-device .wlBubs, .wlPill[data-fail] .wlBubs { display: none; }')
    expect(css).toMatch(/\.wlBubs \{[^}]*inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)       // вертикальная: блок слоя заливки
    expect(css).toContain('.wlPill[data-wide] .wlBubs { inset: 0; transform: translateX(0); }') // широкая: рамка кромки
    for (const m of css.matchAll(/translate\((-?\d+)px, (-?\d+)px\)/g)) { expect(Math.abs(Number(m[1]))).toBeLessThanOrEqual(BUB_SWAY); expect(Math.abs(Number(m[2]))).toBeLessThan(BUB_BOB) } // кадры — в пределах запаса геометрии
  })
  it('файл подключён вместе с пилюлями; старых капель и искр-плиток в проекте нет', () => {
    const idx = readFileSync(fileURLToPath(new URL('../../../../index.css', import.meta.url)), 'utf8')
    expect(idx).toContain("@import './styles/player/modules/word-lane-bubbles.css';")
    expect(idx).not.toContain('word-lane-jets.css')
  })
})
