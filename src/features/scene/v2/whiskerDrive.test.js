import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Хук без DOM-среды: useLayoutEffect выполняет тело сразу, useRef — обычный объект; cleanup собираем руками
const hooks = vi.hoisted(() => ({ cleanups: [], refs: new Map(), n: 0 }))
vi.mock('react', () => ({
  useRef: init => { const k = hooks.n++; if (!hooks.refs.has(k)) hooks.refs.set(k, { current: init }); return hooks.refs.get(k) },
  useLayoutEffect: fn => { const c = fn(); if (typeof c === 'function') hooks.cleanups.push(c) },
}))

const { createWhiskerDrive, whiskerAngle, whiskerKind, ease, RAMP_MS } = await import('./whiskerDrive.js')
const { useWhiskerDrive } = await import('./useWhiskerDrive.js')

// Ус с classList и style.rotate (история записей — по ней видно рывки)
function fakeWh(cls) {
  const set = new Set(cls.split(' '))
  const el = { isConnected: true, writes: [], classList: { contains: c => set.has(c) } }
  let v = ''
  el.style = { get rotate() { return v }, set rotate(x) { v = x; el.writes.push(x) } }
  return el
}
const fakeRoot = (whs = ['wh wh-l wh-u', 'wh wh-l wh-d', 'wh wh-r wh-u', 'wh wh-r wh-d'].map(fakeWh), scrolling = false) => ({
  whs, scrolling, querySelectorAll: () => whs, closest() { return this.scrolling ? {} : null },
})
// Ручные часы и rAF: tick(ms) выполняет следующий кадр через ms миллисекунд
function rig({ root = fakeRoot(), reduced = false } = {}) {
  let t = 1000, queue = null
  const drive = createWhiskerDrive({
    getRoot: () => root, now: () => t, raf: f => { queue = f; return 1 }, caf: () => { queue = null },
    reduced: () => reduced, held: r => !!r.scrolling,
  })
  const tick = (ms = 16.7) => { t += ms; const f = queue; queue = null; if (f) f() }
  const deg = el => parseFloat(el.style.rotate) || 0
  return { drive, root, tick, deg, running: () => queue !== null }
}
const maxStep = (el, from = 0) => { let m = 0; for (let i = Math.max(1, from); i < el.writes.length; i++) m = Math.max(m, Math.abs((parseFloat(el.writes[i]) || 0) - (parseFloat(el.writes[i - 1]) || 0))); return m }

describe('whiskerAngle / ease: форма движения', () => {
  it('те же углы, что были в keyframes: верхний левый 4° → −3° → 4° за 0,6 с, правый зеркально, нижние — период 0,72 с со сдвигом 0,25 с', () => {
    const l = { side: 'l', low: false }, r = { side: 'r', low: false }
    expect(whiskerAngle(l, 0)).toBeCloseTo(4)
    expect(whiskerAngle(l, 300)).toBeCloseTo(-3)
    expect(whiskerAngle(l, 600)).toBeCloseTo(4)
    expect(whiskerAngle(r, 0)).toBeCloseTo(-4)
    expect(whiskerAngle(r, 300)).toBeCloseTo(3)
    const d = { side: 'l', low: true }
    expect(whiskerAngle(d, 720)).toBeCloseTo(whiskerAngle(d, 0)) // период 720 мс
    expect(whiskerAngle(d, 0)).toBeCloseTo(0.5 + 3.5 * Math.cos((2 * Math.PI * 250) / 720)) // сдвиг 250 мс (бывший animation-delay: −0,25 с)
  })

  it('whiskerKind читает классы wh-l / wh-r и wh-u / wh-d', () => {
    expect(whiskerKind(fakeWh('wh wh-r wh-d'))).toEqual({ side: 'r', low: true })
    expect(whiskerKind(fakeWh('wh wh-l wh-u'))).toEqual({ side: 'l', low: false })
  })

  it('ease: 0 → 0, 1 → 1, нулевая скорость на концах, монотонна', () => {
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1); expect(ease(-1)).toBe(0); expect(ease(2)).toBe(1)
    expect(ease(0.01)).toBeLessThan(0.001)
    expect(1 - ease(0.99)).toBeLessThan(0.001)
    let prev = 0
    for (let i = 1; i <= 20; i++) { const v = ease(i / 20); expect(v).toBeGreaterThanOrEqual(prev); prev = v }
  })
})

describe('createWhiskerDrive: плавный вход', () => {
  it('до речи ничего не пишется и цикл не идёт; set(true) заводит цикл rAF, первые кадры растут от 0 монотонно и мелкими шагами', () => {
    const r = rig()
    expect(r.running()).toBe(false)
    expect(r.root.whs.every(w => w.writes.length === 0)).toBe(true)
    r.drive.set(true)
    expect(r.running()).toBe(true)
    const seen = []
    for (let i = 0; i < 6; i++) { r.tick(); seen.push(Math.abs(r.deg(r.root.whs[0]))) }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(seen[0]).toBeLessThan(0.1) // на первом кадре ус ещё почти в покое, а не в ±4°
    expect(Math.max(...r.root.whs.map(w => maxStep(w)))).toBeLessThan(0.6)
  })

  it('за RAMP_MS амплитуда доходит до 1: угол верхнего левого уса достигает размаха', () => {
    const r = rig()
    r.drive.set(true)
    let peak = 0
    for (let i = 0; i < 60; i++) { r.tick(); peak = Math.max(peak, Math.abs(r.deg(r.root.whs[0]))) }
    expect(RAMP_MS).toBe(300)
    expect(peak).toBeGreaterThan(3.4)
    expect(r.drive.state().amp).toBe(1)
  })

  it('повторный set(true) ничего не меняет (звать можно каждый кадр)', () => {
    const r = rig()
    r.drive.set(true); r.tick(); r.tick()
    const before = r.drive.state()
    r.drive.set(true)
    expect(r.drive.state()).toEqual(before)
  })
})

describe('createWhiskerDrive: плавный выход', () => {
  it('set(false) из полной амплитуды: ни одного шага больше скорости обычного качания, к покою — ровно 0, цикл rAF кончается сам, rotate снят', () => {
    const r = rig()
    r.drive.set(true)
    for (let i = 0; i < 60; i++) r.tick()
    const from = r.root.whs[0].writes.length
    r.drive.set(false)
    for (let i = 0; i < 40 && r.running(); i++) r.tick()
    expect(r.running()).toBe(false)
    for (const w of r.root.whs) {
      expect(w.style.rotate).toBe('')
      expect(maxStep(w, from)).toBeLessThan(0.7)
      expect(Math.abs(parseFloat(w.writes[w.writes.length - 2]))).toBeLessThan(0.15) // перед снятием угол уже ≈ 0: снимаем на покое, а не посреди взмаха
    }
    expect(r.drive.state().ph).toBe(0) // следующая речь начнётся с той же фазы
  })

  it('заговорил снова посреди выхода: амплитуда идёт обратно от текущего значения, фаза не сбрасывается, скачка нет', () => {
    const r = rig()
    r.drive.set(true)
    for (let i = 0; i < 40; i++) r.tick()
    r.drive.set(false)
    for (let i = 0; i < 8; i++) r.tick()
    const mid = r.drive.state()
    expect(mid.amp).toBeGreaterThan(0); expect(mid.amp).toBeLessThan(1)
    const from = r.root.whs[0].writes.length
    r.drive.set(true)
    for (let i = 0; i < 30; i++) r.tick()
    expect(r.drive.state().amp).toBe(1)
    expect(r.drive.state().ph).toBeGreaterThan(mid.ph)
    expect(maxStep(r.root.whs[0], from)).toBeLessThan(0.7)
  })

  it('set(false) без речи ничего не заводит', () => {
    const r = rig()
    r.drive.set(false)
    expect(r.running()).toBe(false)
  })

  it('stop() — конец жизни кота: цикл снят, углы сброшены сразу', () => {
    const r = rig()
    r.drive.set(true)
    for (let i = 0; i < 20; i++) r.tick()
    r.drive.stop()
    expect(r.running()).toBe(false)
    expect(r.root.whs.every(w => w.style.rotate === '')).toBe(true)
    expect(r.drive.state()).toMatchObject({ amp: 0, to: 0, ph: 0 })
  })
})

describe('createWhiskerDrive: условия', () => {
  it('prefers-reduced-motion: усы не качаются вообще', () => {
    const r = rig({ reduced: true })
    r.drive.set(true)
    expect(r.running()).toBe(false)
  })

  it('прокрутка ленты ([data-scrolling]): усы стоят на месте, время и рампа не идут; прокрутка кончилась — продолжают с того же места', () => {
    const r = rig()
    r.drive.set(true)
    for (let i = 0; i < 10; i++) r.tick()
    const state = r.drive.state(); const w0 = r.root.whs[0].writes.length
    r.root.scrolling = true
    for (let i = 0; i < 20; i++) r.tick()
    expect(r.root.whs[0].writes.length).toBe(w0)
    expect(r.drive.state()).toMatchObject({ amp: state.amp, ph: state.ph })
    r.root.scrolling = false
    r.tick()
    expect(r.drive.state().ph).toBeGreaterThan(state.ph)
  })

  it('кадр после долгой паузы вкладки не перепрыгивает фазу: dt ограничен', () => {
    const r = rig()
    r.drive.set(true)
    r.tick(5000)
    expect(r.drive.state().ph).toBeLessThanOrEqual(64)
  })

  it('React пересобрал усы (старые отсоединены): привод берёт новые', () => {
    const r = rig()
    r.drive.set(true)
    r.tick(); r.tick()
    const fresh = ['wh wh-l wh-u', 'wh wh-l wh-d', 'wh wh-r wh-u', 'wh wh-r wh-d'].map(fakeWh)
    r.root.whs.forEach(w => { w.isConnected = false })
    r.root.querySelectorAll = () => fresh
    r.tick(); r.tick()
    expect(fresh[0].writes.length).toBeGreaterThan(0)
  })

  it('кот убран из DOM (getRoot → null): цикл кончается сам, ошибок нет', () => {
    const r = rig()
    r.drive.set(true)
    r.tick()
    r.root.querySelectorAll = () => []
    const d2 = createWhiskerDrive({ getRoot: () => null, now: () => 0, raf: () => 1, caf: () => {} })
    expect(() => { d2.set(true); d2.stop() }).not.toThrow()
  })
})

describe('useWhiskerDrive (кот сцены)', () => {
  function run(el, active, enabled = true) { hooks.n = 0; useWhiskerDrive({ current: el }, active, enabled) }
  function fresh() { hooks.cleanups.length = 0; hooks.refs.clear() }

  it('enabled=false (lite, флаг v2 выключен, статика): ничего не создаёт, rotate не трогает', () => {
    fresh()
    const root = fakeRoot()
    const g = { querySelectorAll: root.querySelectorAll, closest: root.closest }
    run(g, true, false)
    expect(hooks.cleanups).toHaveLength(0)
    expect(root.whs.every(w => w.writes.length === 0)).toBe(true)
  })

  it('enabled=true: создаётся привод, при размонтировании (cleanup) он останавливается', () => {
    fresh()
    const g = fakeRoot()
    const raf = vi.fn(() => 7), caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', caf)
    vi.stubGlobal('performance', { now: () => 0 })
    run(g, true)
    expect(raf).toHaveBeenCalledTimes(1) // речь началась — цикл заведён
    expect(hooks.cleanups.length).toBeGreaterThan(0)
    for (const c of hooks.cleanups) c()
    expect(caf).toHaveBeenCalledWith(7)
    vi.unstubAllGlobals()
  })
})

describe('подключение к сцене', () => {
  it('Cat в SceneRenderer: усы качает useWhiskerDrive только в live + animV2 + не lite; пауза и успокоение сцены (calm) гасят амплитуду; ссылка на <g> рядом с onEl', () => {
    const src = readFileSync(fileURLToPath(new URL('./SceneRenderer.jsx', import.meta.url)), 'utf8')
    expect(src).toContain('useWhiskerDrive(gRef, talking && !calm, whisk)')
    expect(src).toContain('const whiskOn = live && animV2 && !isLite')
    expect(src).toContain('const whiskCalm = animPaused || settling')
    expect(src).toContain('ref={el => { gRef.current = el; onEl(who, el) }}')
    expect(src.match(/whisk=\{whiskOn\} calm=\{whiskCalm\}/g)).toHaveLength(2) // оба кота
  })
})
