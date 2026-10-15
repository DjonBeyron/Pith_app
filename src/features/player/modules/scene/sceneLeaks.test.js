import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/sceneAudioUnlock.js', () => ({ getSceneAudioElement: () => null, unlockSceneAudio: () => {} }))

const { attachSceneSolo, sceneSoloListeners } = await import('./useSceneSolo.js')
const { watchSceneNear, sceneNearWatchers } = await import('./useSceneNear.js')

function fakeDoc() {
  const active = new Map()
  return {
    active,
    addEventListener: t => active.set(t, (active.get(t) ?? 0) + 1) && undefined,
    removeEventListener: (t) => active.set(t, (active.get(t) ?? 0) - 1) && undefined,
    querySelectorAll: () => [],
  }
}
const count = d => [...d.active.values()].reduce((a, b) => a + b, 0)

describe('размонтирование сцены снимает всё (useSceneSolo)', () => {
  it('play на документе и подписка на шину «одна сцена звучит» снимаются отпиской', () => {
    const doc = fakeDoc()
    const off = attachSceneSolo({ rootEl: null, pause: () => {}, doc, own: null })
    expect(doc.active.get('play')).toBe(1)
    expect(sceneSoloListeners()).toBe(1)
    off()
    expect(count(doc)).toBe(0)
    expect(sceneSoloListeners()).toBe(0)
  })

  it('100 циклов «Продолжить урок» (маунт/размонтаж) не копят слушателей', () => {
    const doc = fakeDoc()
    for (let i = 0; i < 100; i++) attachSceneSolo({ rootEl: null, pause: () => {}, doc, own: null })()
    expect(count(doc)).toBe(0)
    expect(sceneSoloListeners()).toBe(0)
  })

  it('другая сцена заиграла — первая получает паузу', () => {
    const doc = fakeDoc()
    const pause = vi.fn()
    const offA = attachSceneSolo({ rootEl: null, pause, doc, own: null })
    const offB = attachSceneSolo({ rootEl: null, pause: () => {}, doc, own: null })
    expect(pause).toHaveBeenCalledTimes(1)
    offA(); offB()
    expect(sceneSoloListeners()).toBe(0)
  })
})

describe('подписка замороженных сцен на экран (useSceneNear)', () => {
  const made = []
  class IO {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); this.alive = true; made.push(this) }
    observe(el) { this.targets.add(el) }
    unobserve(el) { this.targets.delete(el) }
    disconnect() { this.alive = false; this.targets.clear() }
  }
  afterEach(() => { made.length = 0; vi.unstubAllGlobals() })
  const stub = () => {
    vi.stubGlobal('IntersectionObserver', IO)
    vi.stubGlobal('window', { innerHeight: 812 })
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0))
    vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id))
  }
  const el = top => ({ getBoundingClientRect: () => ({ top, bottom: top + 400 }) })

  it('все замороженные сцены делят одну пару наблюдателей; после ухода последней — disconnect', () => {
    stub()
    const offs = [100, 520, 940, 1360].map(t => watchSceneNear(el(t), () => {}))
    expect(made).toHaveLength(2)
    expect(sceneNearWatchers()).toBe(4)
    offs.forEach(off => off())
    expect(sceneNearWatchers()).toBe(0)
    expect(made.every(o => !o.alive)).toBe(true)
  })

  it('на маунте видимая сцена получает true синхронно (без кадра плашки), далёкая — false', () => {
    stub()
    const got = {}
    const offs = [watchSceneNear(el(100), v => { got.near = v }), watchSceneNear(el(5000), v => { got.far = v })]
    expect(got.near).toBe(true)
    expect(got.far).toBe(false) // вне зоны запаса — плашка
    offs.forEach(off => off())
  })
})
