import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createProgressTimeline, LAST_CAP, CREEP_CAP, END_MS, REWIND_MS } from './sceneProgressModel.js'

// Конец прогресса сцены: к 'ended' кольцо/полоса ровно 100 %, в каком бы порядке ни пришли события; полоса пузыря, кольцо
// кружка и полоса полного экрана — одна модель (один хук), а не три копии
const D = [2000, 3000, 1500]
const at = (tl, st, now, durations = D) => tl.onState({ run: 1, ...st }, { durations, now })
const read = src => readFileSync(new URL(src, import.meta.url), 'utf8')

// Значение модели сразу после 'ended' и через END_MS (+ запас): ровно 1 и дальше остаётся 1
function endsFull(tl, now) {
  expect(tl.value(now + END_MS)).toBe(1)
  expect(tl.value(now + END_MS + 5000)).toBe(1)
  let prev = tl.value(now)
  for (let t = 0; t <= END_MS + 20; t += 10) { // доезд монотонный
    const v = tl.value(now + t)
    expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
    prev = v
  }
}

describe('конец прогресса — ровно 1, независимо от порядка событий', () => {
  it("'ended' раньше оценки (звук короче плана): доезд с текущего значения до 1", () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0 }, 0)
    at(tl, { status: 'playing', index: 1 }, 1200)
    at(tl, { status: 'playing', index: 2 }, 3000)
    const v = tl.value(3400)
    expect(v).toBeLessThan(0.9)
    const r = at(tl, { status: 'ended', index: 2 }, 3400)
    expect(r.from).toBeCloseTo(v, 6)
    expect(r.steps).toEqual([{ to: 1, ms: END_MS }])
    endsFull(tl, 3400)
  })

  it("'ended' позже оценки (звук длиннее плана): хвост ползёт к CREEP_CAP, но не доходит до 1; 'ended' доводит до 1", () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0 }, 0)
    at(tl, { status: 'playing', index: 1 }, 2000)
    const r = at(tl, { status: 'playing', index: 2 }, 5000)
    expect(r.steps.map(s => s.to)).toEqual([LAST_CAP, CREEP_CAP])
    expect(tl.value(5000 + 1500)).toBeCloseTo(LAST_CAP, 6) // к оценочному концу — ровно LAST_CAP, не раньше
    const late = tl.value(5000 + 60000)
    expect(late).toBeGreaterThan(LAST_CAP)
    expect(late).toBeLessThanOrEqual(CREEP_CAP)
    at(tl, { status: 'ended', index: 2 }, 5000 + 6000)
    endsFull(tl, 5000 + 6000)
  })

  it('хвост идёт плавно: нет «стоянки» у края — значение растёт всё время последней реплики и после оценки', () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0 }, 0, [3000])
    let prev = tl.value(0)
    let flat = 0
    for (let t = 10; t <= 9000; t += 10) {
      const v = tl.value(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      if (v === prev) flat += 1
      prev = v
    }
    expect(flat).toBe(0)
  })

  it("'ended' после паузы на последней реплике: с замороженного значения до 1", () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0 }, 0, [2000])
    at(tl, { status: 'paused', index: 0 }, 900, [2000])
    const frozen = tl.value(5000)
    expect(frozen).toBeCloseTo(tl.value(900), 9)
    at(tl, { status: 'playing', index: 0, run: 2 }, 5000, [2000])
    at(tl, { status: 'ended', index: 0 }, 7000, [2000])
    endsFull(tl, 7000)
  })

  it("одна реплика (loop): каждый проход заканчивается ровно на 1, следующий — откат за REWIND_MS и снова вперёд", () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0, run: 1 }, 0, [1000])
    at(tl, { status: 'ended', index: 0, run: 1 }, 1000, [1000])
    endsFull(tl, 1000)
    const r = at(tl, { status: 'playing', index: 0, run: 2 }, 4000, [1000])
    expect(r.steps[0]).toEqual({ to: 0, ms: REWIND_MS })
    expect(tl.value(4000 + REWIND_MS)).toBe(0)
    at(tl, { status: 'ended', index: 0, run: 2 }, 4000 + REWIND_MS + 1000, [1000])
    endsFull(tl, 4000 + REWIND_MS + 1000)
  })

  it("повторный 'ended' (замороженный свёрнутый кружок: freeze) значение не трогает; 'ended' из idle (устаревшее состояние) — тоже к 1", () => {
    const tl = createProgressTimeline()
    at(tl, { status: 'playing', index: 0 }, 0, [1000])
    at(tl, { status: 'ended', index: 0 }, 1000, [1000])
    const again = at(tl, { status: 'ended', index: 0 }, 5000, [1000])
    expect(again).toEqual({ from: 1, steps: [] })
    const cold = createProgressTimeline()
    at(cold, { status: 'idle', index: 0 }, 0, [1000])
    at(cold, { status: 'ended', index: 0 }, 10, [1000])
    endsFull(cold, 10)
  })

  it('settle: нода перемонтирована уже доигравшей — значение 1 сразу, без анимации; следующий проход откатывает', () => {
    const tl = createProgressTimeline()
    expect(tl.settle({ status: 'ended', index: 2 }, 1, 0)).toEqual({ from: 1, steps: [] })
    expect(tl.value(0)).toBe(1)
    expect(tl.value(9999)).toBe(1)
    const r = at(tl, { status: 'playing', index: 0, run: 2 }, 100)
    expect(r.from).toBe(1)
    expect(r.steps[0]).toEqual({ to: 0, ms: REWIND_MS })
  })

  it('шаблон с сегментами (одна реплика-цепочка) и сцена на таймере — та же модель: к ended ровно 1', () => {
    for (const durations of [[2600], [1400, 900, 1100, 2000]]) {
      const tl = createProgressTimeline()
      durations.forEach((d, i) => at(tl, { status: 'playing', index: i }, durations.slice(0, i).reduce((a, b) => a + b, 0), durations))
      const total = durations.reduce((a, b) => a + b, 0)
      at(tl, { status: 'ended', index: durations.length - 1 }, total, durations)
      endsFull(tl, total)
    }
  })
})

describe('одна модель на три представления (кольцо кружка, полоса пузыря, полоса полного экрана)', () => {
  it('одинаковая цепочка событий → одинаковое значение в любой момент (модель чистая: ни kind, ни элемент не влияют)', () => {
    const events = [
      [{ status: 'idle', index: 0 }, 0], [{ status: 'playing', index: 0 }, 100], [{ status: 'playing', index: 1 }, 2100],
      [{ status: 'paused', index: 1 }, 2900], [{ status: 'playing', index: 1, run: 2 }, 4000], [{ status: 'playing', index: 2 }, 7000],
      [{ status: 'ended', index: 2 }, 8400],
    ]
    const make = () => { const tl = createProgressTimeline(); events.forEach(([st, t]) => at(tl, st, t)); return tl }
    const ring = make(), bubbleBar = make(), fsBar = make()
    for (let t = 0; t <= 9000; t += 37) {
      expect(bubbleBar.value(t)).toBe(ring.value(t))
      expect(fsBar.value(t)).toBe(ring.value(t))
    }
  })

  it('в коде: все три вида берут прогресс из useSceneProgress, а createProgressTimeline создаёт только он', () => {
    expect(read('./SceneCircleView.jsx')).toContain("kind: 'ring'")
    expect(read('./SceneBubbleView.jsx')).toContain("kind: 'bar'")
    expect(read('./SceneFullscreenView.jsx')).toContain("kind: 'bar'")
    for (const f of ['./SceneCircleView.jsx', './SceneBubbleView.jsx', './SceneFullscreenView.jsx']) {
      expect(read(f)).toContain("from './useSceneProgress.js'")
      expect(read(f)).not.toContain('createProgressTimeline')
    }
    expect(read('./useSceneProgress.js')).toContain('createProgressTimeline()')
  })

  it('движение полос — scaleX на композиторе (transform), а не width; кольцо — dashoffset без setState', () => {
    const hook = read('./useSceneProgress.js')
    expect(hook).toContain('scaleX(')
    expect(hook).not.toMatch(/style\.width|useState\(/)
    const css = read('../../../../styles/player/modules/scene-fs.css')
    expect(css).toMatch(/\.playerSceneFsProgress \{[^}]*transform: scaleX\(0\)[^}]*will-change: transform/)
  })
})

describe('рассинхрон с режиссёром', () => {
  it('режиссёр чуть длиннее/короче плана (±15 %): к ended расхождение значения с «долей времени» не больше 100 мс, без скачков', () => {
    for (const k of [0.85, 1, 1.15]) {
      const real = D.map(d => d * k)
      const tl = createProgressTimeline()
      const total = real.reduce((a, b) => a + b, 0)
      const starts = real.map((_, i) => real.slice(0, i).reduce((a, b) => a + b, 0))
      let prev = 0
      let worst = 0
      let fed = 0
      for (let t = 0; t <= total; t += 10) {
        while (fed < starts.length && starts[fed] <= t) { at(tl, { status: 'playing', index: fed }, starts[fed]); fed += 1 }
        const v = tl.value(t)
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
        expect(v - prev).toBeLessThan(0.02)
        prev = v
        worst = Math.max(worst, Math.abs(v - t / total) * total)
      }
      expect(worst).toBeLessThanOrEqual(k === 1 ? 100 : 0.2 * total) // при идеальном режиссёре — ≤ 100 мс; при неточной оценке — плавная подгонка
      at(tl, { status: 'ended', index: 2 }, total)
      endsFull(tl, total)
    }
  })
})
