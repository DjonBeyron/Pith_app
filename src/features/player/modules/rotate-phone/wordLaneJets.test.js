import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import { createPool } from './wordLanePool.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false })) // в тестах устройство — обычное (слабое проверяется отдельно: off / класс wl--lite)
import { burstOrigin } from './wordLaneSnap.js'
import { makeParticle } from '../../../../shared/lib/burstParticles.js'
import { createJets, jetOrigin, jetFrames, jetLead, JET_GAP_MS, JET_RUSH_GAP_MS, JET_MAX, JET_RUSH_MAX, JET_LEAD_MS, JET_LEAD_MAX, SOFT_PX, GAP_PX } from './wordLaneJets.js'

// Капли из жидкости пилюли: рождаются на линии заливки и вылетают по её направлению; немного узлов, только пока заливка растёт; на слабом устройстве их нет.
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')

function fakePill() {
  const kids = [], anims = []
  const doc = { createElement: () => { const n = { style: {}, className: '', removed: false, remove() { n.removed = true; const i = kids.indexOf(n); if (i >= 0) kids.splice(i, 1) }, getAnimations: () => [], animate(frames, opts) { let ok, no; const a = { frames, opts, finished: new Promise((res, rej) => { ok = res; no = rej }), finish: () => ok(), cancel: () => no(new Error('cancel')) }; a.finished.catch(() => {}); n.anim = a; n.getAnimations = () => [a]; anims.push(a); return a } }; return n } }
  return { el: { ownerDocument: doc, animate() {}, appendChild: n => kids.push(n), hasAttribute: () => false }, kids, anims }
}
const tall = { w: 78, h: 158, wide: false }, flat = { w: 288, h: 85, wide: true }

describe('где рождается капля', () => {
  it('вертикальная пилюля: на сплошном крае слоя заливки — gap + (1 − v)·(высота + мягкий край), по центру; тот же отсчёт, что у искр (edge20)', () => {
    expect(jetOrigin(0.5, tall).y).toBeCloseTo(GAP_PX + 0.5 * (158 + SOFT_PX), 6)
    expect(jetOrigin(1, tall).y).toBe(GAP_PX)                             // полная — у верхнего края клипа
    expect(jetOrigin(0.5, tall).x).toBe(GAP_PX + 39)
    expect(jetOrigin(0.25, tall).y).toBeGreaterThan(jetOrigin(0.75, tall).y) // выше заливка — выше поверхность
  })
  it('широкая пилюля: на веретене кромки — gap + v·(ширина + мягкий край) − половина мягкого края, по центру высоты', () => {
    expect(jetOrigin(0.5, flat).x).toBeCloseTo(GAP_PX + 0.5 * (288 + SOFT_PX) - SOFT_PX / 2, 6)
    expect(jetOrigin(0.5, flat).y).toBe(GAP_PX + 42.5)
    expect(jetOrigin(0.8, flat).x).toBeGreaterThan(jetOrigin(0.3, flat).x)
  })
  it('у скруглённого торца поверхность уже: капли не рождаются за дугой капсулы', () => {
    expect(jetOrigin(0.5, tall).half).toBe(39)                            // середина — вся ширина
    expect(jetOrigin(0.02, tall).half).toBeLessThan(25)
    expect(jetOrigin(1, tall).half).toBeCloseTo(39 * 0.3, 6)              // у самого края — узко, но не точка
  })
  it('полёт — по направлению заливки: вертикальная — вверх (y убывает), широкая — вправо (x растёт); рывок летит дальше; гаснет к концу', () => {
    const y = f => Number(/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(f.transform)[2]), x = f => Number(/translate\(([-\d.]+)px/.exec(f.transform)[1])
    const up = jetFrames({ wide: false, a: 0.5, b: 0.5 }), right = jetFrames({ wide: true, a: 0.5, b: 0.5 })
    expect(y(up[0])).toBe(0); expect(y(up[1])).toBeLessThan(-8); expect(up.at(-1).opacity).toBe(0)
    expect(x(right[0])).toBe(0); expect(x(right[1])).toBeGreaterThan(8); expect(x(right[2])).toBeGreaterThan(x(right[1]))
    expect(-y(jetFrames({ rush: true, a: 0.5, b: 0.5 })[1])).toBeGreaterThan(-y(up[1]))
    expect(-y(up[2])).toBeLessThan(-y(up[1]))                             // после вершины — лёгкий спад
    for (const f of [...up, ...right]) expect(Object.keys(f).filter(k => !['transform', 'opacity', 'offset', 'easing'].includes(k))).toEqual([]) // только transform и opacity
  })
})

describe('упреждение: капля летит впереди поверхности, а не тонет в ней', () => {
  const y = f => Number(/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(f.transform)[2])
  it('доезд после зачёта (rush): упреждение — весь остаток до края; капля с заливки 0,4 вылетает за край пилюли', () => {
    const lead = jetLead(0.4, tall, { rush: true })
    expect(lead).toBeCloseTo(0.6 * (158 + SOFT_PX), 6)
    const top = jetOrigin(0.4, tall).y - GAP_PX                           // от поверхности до верхнего края клипа
    expect(-y(jetFrames({ rush: true, a: 0, b: 0.5, lead })[1])).toBeGreaterThan(top + 10) // вершина — выше края
    expect(-y(jetFrames({ rush: true, a: 0, b: 0.5, lead })[2])).toBeGreaterThan(top)      // и в конце не ныряет обратно
    expect(jetLead(1, tall, { rush: true })).toBe(0)
  })
  it('обычный рост: скорость заливки × JET_LEAD_MS, не больше JET_LEAD_MAX длины; заливка почти стоит — прыжок короткий', () => {
    expect(jetLead(0.3, tall, { speed: 0.001 })).toBeCloseTo(0.001 * JET_LEAD_MS * (158 + SOFT_PX), 6)
    expect(jetLead(0.3, tall, { speed: 1 })).toBeCloseTo(JET_LEAD_MAX * (158 + SOFT_PX), 6)
    expect(jetLead(0.3, tall, { speed: 0 })).toBe(0); expect(jetLead(0.3, tall, { speed: -1 })).toBe(0)
    expect(jetLead(0.3, flat, { speed: 0.001 })).toBeCloseTo(0.001 * JET_LEAD_MS * (288 + SOFT_PX), 6) // широкая — по ширине
  })
})

describe('бюджет', () => {
  it('обычный рост: одна капля не чаще JET_GAP_MS, не больше JET_MAX живых; узел уходит по концу анимации', async () => {
    let t = 0
    const jets = createJets({ now: () => t, off: () => false }), p = fakePill()
    expect(jets.rise(p.el, 0.3, tall)).toBe(1)
    expect(jets.rise(p.el, 0.31, tall)).toBe(0)                           // рано
    for (let i = 0; i < 20; i++) { t += JET_GAP_MS; jets.rise(p.el, 0.3 + i * 0.01, tall, { speed: 0.0006 }) }
    expect(p.kids.length).toBe(JET_MAX); expect(jets.count(p.el)).toBe(JET_MAX)
    expect(p.kids.every(n => n.className === 'wlJet' && /left:[\d.]+px;top:[\d.]+px;width:[\d.]+px;height:[\d.]+px;/.test(n.style.cssText))).toBe(true)
    p.anims.forEach(a => a.finish()); await Promise.resolve(); await Promise.resolve()
    expect(p.kids.length).toBe(0); expect(jets.count(p.el)).toBe(0)       // в покое узлов нет
  })
  it('доезд после зачёта (rush): по две капли, чаще, не больше JET_RUSH_MAX', () => {
    let t = 0
    const jets = createJets({ now: () => t, off: () => false }), p = fakePill()
    expect(jets.rise(p.el, 0.5, tall, { rush: true })).toBe(2)
    for (let i = 0; i < 20; i++) { t += JET_RUSH_GAP_MS; jets.rise(p.el, 0.5 + i * 0.02, tall, { rush: true }) }
    expect(p.kids.length).toBe(JET_RUSH_MAX)
    expect(JET_RUSH_MAX).toBeLessThanOrEqual(12)
  })
  it('слабое устройство — капель нет; «не успел» и пилюля без размеров — тоже; clear убирает всё сразу', () => {
    const p = fakePill()
    expect(createJets({ now: () => 0, off: () => true }).rise(p.el, 0.5, tall, { rush: true })).toBe(0)
    const jets = createJets({ now: () => 0, off: () => false })
    expect(jets.rise(p.el, 0.5, { w: 0, h: 0 }, { rush: true })).toBe(0)
    expect(jets.rise({ ...p.el, hasAttribute: a => a === 'data-fail' }, 0.5, tall, { rush: true })).toBe(0)
    expect(p.kids.length).toBe(0)
    jets.rise(p.el, 0.5, tall, { rush: true }); expect(p.kids.length).toBe(2)
    jets.clear(p.el); expect(p.kids.length).toBe(0); expect(jets.count(p.el)).toBe(0)
  })
  it('повторяемо (свой счётчик, не Math.random): два набора капель одинаковы', () => {
    const make = () => { const jets = createJets({ now: () => 0, off: () => false }), p = fakePill(); jets.rise(p.el, 0.5, tall, { rush: true }); return p.kids.map(n => n.style.cssText + JSON.stringify(n.anim.frames)) }
    expect(make()).toEqual(make())
    expect(read('./wordLaneJets.js')).not.toMatch(/Math\.random/)
  })
  it('вёрстка: только фон и transform / opacity — без filter, box-shadow, will-change и постоянных анимаций; на слабом устройстве скрыты', () => {
    const css = strip(read('../../../../styles/player/modules/word-lane-jets.css'))
    expect(css).not.toMatch(/filter|box-shadow|will-change|animation|@keyframes/)
    expect(css).toMatch(/\.wl--lite \.wlJet, \.weak-device \.wlJet[^{]*\{\s*display: none/)
    expect(css).toMatch(/\.wlJet \{[^}]*pointer-events: none/)
    expect(read('../../../../index.css')).toContain("word-lane-jets.css")
  })
})

// Пул: капли рождает paintFill, пока заливка растёт; вернувшаяся в пул пилюля — без капель
function poolRig({ lite = false } = {}) {
  let t = 5000
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  const plain = (extra = {}) => ({ style: { setProperty() {} }, dataset: {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, hasAttribute: () => false, querySelector: () => null, querySelectorAll: () => [], ...extra })
  const pill = () => {
    const attrs = new Map(), kids = []
    const el = {}
    const clip = Object.defineProperties(plain(), { offsetHeight: { get: () => (el.style.width === '78%' ? 85 : 158) }, offsetWidth: { get: () => (el.style.width === '78%' ? 288 : 78) } }) // ёмкость — по размеру, который пул записал пилюле (широкая — 78 % ширины)
    const parts = { '.wlPillClip': clip, '.wlPillFill': plain(), '.wlGhost': plain(), '.wlPace': plain() }
    const doc = { createElement: () => { const n = { style: {}, className: '', remove() { const i = kids.indexOf(n); if (i >= 0) kids.splice(i, 1) }, getAnimations: () => [], animate: () => ({ finished: new Promise(() => {}), cancel() {} }) }; return n } }
    return Object.assign(el, plain({ kids, ownerDocument: doc, appendChild: n => kids.push(n), setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, hasAttribute: k => attrs.has(k), animate: () => ({ currentTime: 0, cancel() {} }), querySelector: sel => parts[sel] ?? null }))
  }
  const pills = [pill(), pill()]
  const pool = createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? pills : []), classList: { contains: c => lite && c === 'wl--lite' } })
  return { pool, pills, advance: ms => { t += ms } }
}
afterEach(() => vi.restoreAllMocks())

describe('пул: капли только пока заливка растёт', () => {
  it('рост заливки — капли на пилюле; заливка стоит или убывает — новых нет; give — капли убраны', () => {
    const { pool, pills, advance } = poolRig()
    const k = pool.take(0, { flight: false }), el = pills[k]
    expect(el.kids.length).toBe(0)                                        // взятая пустая пилюля — без капель
    pool.paintFill(k, 0.2); expect(el.kids.length).toBe(1)                // растёт — капля
    expect(el.kids.every(n => n.className === 'wlJet')).toBe(true)
    advance(JET_GAP_MS); pool.paintFill(k, 0.2); expect(el.kids.length).toBe(1) // стоит
    advance(JET_GAP_MS); pool.paintFill(k, 0.15); expect(el.kids.length).toBe(1) // убывает
    advance(JET_GAP_MS); pool.paintFill(k, 0.16); expect(el.kids.length).toBe(2) // снова растёт — капля
    advance(JET_RUSH_GAP_MS); pool.paintFill(k, 0.4, true); expect(el.kids.length).toBe(4) // доезд после зачёта (rush от движка) — по две
    pool.give(k); expect(el.kids.length).toBe(0)
  })
  it('широкая пилюля: ёмкость перемеряется после записи размеров (при взятии замер шёл до них) — капля на фронте заливки, а не по меркам обычной пилюли; обратно в обычную — тоже', () => {
    const { pool, pills } = poolRig()
    const left = n => Number(/left:([\d.]+)px/.exec(n.style.cssText)[1]), top = n => Number(/top:([\d.]+)px/.exec(n.style.cssText)[1])
    const k = pool.take(1, { flight: false, wide: true })
    pool.paintFill(k, 0.5)
    expect(left(pills[k].kids[0])).toBeCloseTo(jetOrigin(0.5, flat).x, 1)   // фронт: gap + v·(288 + 8) − 4 = 146
    expect(Math.abs(top(pills[k].kids[0]) - jetOrigin(0.5, flat).y)).toBeLessThanOrEqual(42.5)
    pool.give(k)
    const k2 = pool.take(1, { flight: false })                             // та же пилюля — снова обычная
    expect(k2).toBe(k)
    pool.paintFill(k2, 0.5)
    expect(top(pills[k2].kids[0])).toBeCloseTo(jetOrigin(0.5, tall).y, 1)  // поверхность: gap + (1 − v)·(158 + 8) = 85
  })
  it('слабое устройство (класс wl--lite на поле) — капель нет', () => {
    const { pool, pills } = poolRig({ lite: true })
    const k = pool.take(0, { flight: false })
    pool.paintFill(k, 0.5); pool.paintFill(k, 1)
    expect(pills[k].kids.length).toBe(0)
  })
})

describe('залп щелчка — из края, в который упёрлась жидкость', () => {
  const r = { left: 100, top: 200, width: 80, height: 160 }, w = { left: 40, top: 300, width: 300, height: 90 }
  it('вертикальная пилюля: из верхней кромки, вверх (как было); широкая: из правого торца, вправо-вверх', () => {
    expect(burstOrigin(r)).toMatchObject({ x: 140, y: 206 })
    expect(burstOrigin(r).angle).toBeUndefined()
    const o = burstOrigin(w, true)
    expect(o.x).toBe(40 + 300 - 45); expect(o.y).toBe(345)                // центр правого скругления
    expect(o.angle).toBeGreaterThan(-Math.PI / 2); expect(o.angle).toBeLessThan(0) // между «вверх» и «вправо»
  })
  it('частицы залпа с origin.angle летят в заданную сторону; без него — вверх, как раньше', () => {
    const dx = p => Number(/translate\(([-\d.]+)px/.exec(p.frames[3].transform)[1])
    const right = Array.from({ length: 200 }, () => dx(makeParticle(375, 200, 3.5, ['#fff'], burstOrigin(w, true))))
    expect(right.every(x => x > 0)).toBe(true)                            // все — вправо (веер −87°…−19°)
    const up = Array.from({ length: 400 }, () => dx(makeParticle(375, 260, 3.5, ['#fff'], burstOrigin(r))))
    const mean = list => list.reduce((a, b) => a + b, 0) / list.length
    expect(Math.abs(mean(up))).toBeLessThan(mean(right) / 3)             // вверх: в среднем без сноса (вправо уносит только широкую)
  })
})
