import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { calmTail, wakeTail, restTail } from './miaTailCalmDom.js'
import { frameLeft, TAIL_MS, TAIL_FRAMES, REST_FRAME } from './miaTailCalm.js'
import { MIA_TAIL_FRAMES, MIA_TAIL_MARKS } from './miaTailData.js'

// Хвост Мии: хвост и штрихи одного кадра всегда вместе, кадр один (владелец, v3.3.343: «в конце штрихи накладываются на хвост, будто старый хвост участвует в анимации; хвост при анимации мелькает»).
// Причина наложения была в CSS: «довольна» прятала штрихи через display: none — это снимает их CSS-анимацию, и после «довольна» штрихи заводили цикл заново, со сдвигом от хвоста.
const css = readFileSync(new URL('../../../styles/player/modules/race-mia.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }))

/** Подставная Мия: 9 контуров и штрихи с классом on; видимый кадр CSS-цикла задаёт cssFrame (пока нет класса tail-js), progress — доля цикла у видимого контура */
function fakeMia({ cssFrame = 0, progress = null } = {}) {
  const st = { cssFrame, progress, cls: new Set(), props: {} }
  const node = (kind, s) => { const n = { kind, dataset: { s: String(s) }, on: false, classList: { toggle: (_, v) => { n.on = v } }, getAnimations: () => (st.progress == null ? [] : [{ effect: { getComputedTiming: () => ({ progress: st.progress }) } }]) }; return n }
  const mt = MIA_TAIL_FRAMES.map(f => node('mt', f.s)), mk = MIA_TAIL_MARKS.map(m => node('mk', m.s))
  const root = { classList: { add: c => st.cls.add(c), remove: c => st.cls.delete(c) }, style: { setProperty: (k, v) => { st.props[k] = v } }, hasAttribute: () => false, querySelectorAll: sel => (sel.includes('.mk') ? [...mt, ...mk] : mt) }
  vi.stubGlobal('getComputedStyle', n => ({ opacity: (st.cls.has('tail-js') ? n.on : n.kind === 'mt' && +n.dataset.s === st.cssFrame) ? '1' : '0' }))
  const timers = []
  const later = (fn, ms) => { const t = { fn, ms, off: false }; timers.push(t); return () => { t.off = true } }
  const tick = () => { const t = timers.shift(); if (t && !t.off) t.fn(); return t }
  const shown = () => ({ mt: mt.filter(n => n.on).map(n => +n.dataset.s), mk: mk.filter(n => n.on).map(n => +n.dataset.s) })
  return { root, st, later, tick, timers, shown }
}
afterEach(() => vi.unstubAllGlobals())

describe('хвост Мии: хвост и штрихи одного кадра не расходятся', () => {
  it('CSS: кадры хвоста и штрихи нигде не прячутся через display (оно снимает анимацию — штрихи потом идут со сдвигом от хвоста)', () => {
    const bad = rules.filter(r => /\.cat-tail\s+\.(mt|mk|on)\b/.test(r.sel) && /(^|[;\s])display\s*:/.test(r.body))
    expect(bad.map(r => r.sel)).toEqual([])
  })
  it('CSS: «довольна» прячет штрихи через visibility — цикл штрихов продолжает идти вместе с хвостом', () => {
    const r = rules.find(x => x.sel.includes("[data-tail='pleased']") && x.sel.includes('.mk'))
    expect(r.body).toMatch(/visibility\s*:\s*hidden/)
  })
  it('у каждого набора штрихов есть свой кадр хвоста; у кадра покоя штрихов нет', () => {
    const frames = new Set(MIA_TAIL_FRAMES.map(f => f.s))
    expect(frames.size).toBe(TAIL_FRAMES)
    for (const m of MIA_TAIL_MARKS) expect(frames.has(m.s)).toBe(true)
    expect(MIA_TAIL_MARKS.some(m => m.s === REST_FRAME)).toBe(false)
  })
})

describe('хвост Мии: смена «дёргает ↔ лежит» без пропажи, двойного кадра и скачка', () => {
  const oneFrame = m => { const s = m.shown(); expect(s.mt).toHaveLength(1); expect(s.mk.every(x => x === s.mt[0])).toBe(true); return s.mt[0] }

  it('остановка из любого кадра: на каждом шаге виден ровно один кадр со своими штрихами, кадры идут подряд до кадра 1', () => {
    for (let cur = 0; cur < TAIL_FRAMES; cur++) {
      const m = fakeMia({ cssFrame: cur, progress: 0 })
      calmTail(m.root, m.later, 'instant', 1)
      const seen = [oneFrame(m)]
      while (m.timers.length) { m.tick(); seen.push(oneFrame(m)) }
      expect(seen[0]).toBe(cur) // текущий кадр остаётся (не обрывается)
      seen.forEach((f, i) => { if (i) expect((f - seen[i - 1] + TAIL_FRAMES) % TAIL_FRAMES).toBe(1) })
      expect(seen.at(-1)).toBe(REST_FRAME)
    }
  })
  it('остановка: текущий кадр доигрывает свой слот (а не срезается сразу)', () => {
    const m = fakeMia({ cssFrame: 4, progress: 30 / (TAIL_MS * TAIL_FRAMES) }) // кадр на экране 30 мс из 90
    calmTail(m.root, m.later, 'instant', 1)
    expect(oneFrame(m)).toBe(4); expect(m.timers[0].ms).toBeCloseTo(60, 5)
    m.tick(); expect(oneFrame(m)).toBe(5); expect(m.timers[0].ms).toBe(TAIL_MS)
  })
  it('сколько кадру осталось: по доле цикла; не узнать — 0', () => {
    expect(frameLeft(0)).toBe(TAIL_MS); expect(frameLeft(45 / (TAIL_MS * TAIL_FRAMES))).toBeCloseTo(45, 5)
    expect(frameLeft(1 / TAIL_FRAMES)).toBe(0); expect(frameLeft(0.5)).toBe(0); expect(frameLeft(null)).toBe(0); expect(frameLeft(undefined)).toBe(0)
  })
  it('запуск из покоя — цикл с кадра 2; запуск, пока хвост ещё доходит до покоя, — со следующего кадра (раньше перескакивал на кадр 2)', () => {
    const a = fakeMia(); restTail(a.root); wakeTail(a.root, a.later, 'instant')
    expect(a.st.props['--tail-from']).toBe('1'); expect(a.st.cls.has('tail-js')).toBe(false)
    const b = fakeMia({ cssFrame: 5, progress: 0 })
    const stop = calmTail(b.root, b.later, 'instant', 1); b.tick(); b.tick() // кадры 5 → 6 → 7
    expect(oneFrame(b)).toBe(7); stop(); wakeTail(b.root, b.later, 'instant')
    expect(b.st.props['--tail-from']).toBe('8'); expect(b.st.cls.has('tail-js')).toBe(false)
  })
})
