// Для тестов сцены широкой ленты (racePhraseScene*.test.js): поддельный пул (положение — по поддельным часам и скорости, как у анимации полёта; заливка — число fill; coast / tail — доезд между кругами), поддельный rAF (кадр — tick вручную).
import { vi } from 'vitest'
import { runPhraseScene } from './racePhraseScene.js'
import { ENTER_Y, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export function fakePool(clock) {
  const live = new Map(); let next = 0
  const el = () => ({ animate: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), querySelector: () => null, hasAttribute: () => true, setAttribute() {} })
  const pool = {
    live, taken: [],
    take(lane, o) { const k = next++; const p = { k, lane, ...o, attrs: new Set(), vals: {}, born: clock.t - (o.atMs ?? 0), rate: 1, fill: 0, fills: [], el: el() }; live.set(k, p); pool.taken.push(p); return k },
    give: k => live.delete(k), fade: k => { pool.taken[k].faded = true; live.delete(k) }, rise: k => { live.get(k).rose = true; live.delete(k); return true },
    y: k => { const p = live.get(k); return p ? p.frozen ?? ENTER_Y + (SPEED * p.speed * p.rate * (clock.t - p.born)) / 1000 : null },
    retime(k, speed) { const p = live.get(k); if (!p || p.frozen != null) return false; const y = pool.y(k); p.speed = speed; p.speeds = [...(p.speeds ?? []), speed]; p.born = clock.t - ((y - ENTER_Y) * 1000) / (SPEED * speed * p.rate); return true }, // демо «Скажи»: та же точка, другая скорость
    hold(k, on = true) { const p = live.get(k); if (!p) return false; if (on) p.frozen = pool.y(k); else if (p.frozen != null) { p.born = clock.t - ((p.frozen - ENTER_Y) * 1000) / (SPEED * p.speed * p.rate); p.frozen = null } p.held = on; return true }, // продление хода «Скажи»: полёт замирает
    attr: (k, n, on = true) => { const p = pool.taken[k]; if (on) { p.attrs.add(n); p.vals[n] = on === true ? '1' : String(on) } else { p.attrs.delete(n); delete p.vals[n] } },
    paintFill: (k, v) => { pool.taken[k].fill = v; pool.taken[k].fills.push(v) }, el: k => pool.taken[k].el, flashLane: vi.fn(),
    coast(gone) { pool.coasted = [...live.keys()]; pool.onGone = gone; return pool.coasted }, tail: () => clock.tail ?? null, // доезд при смене ступени (wordLaneCoast.js): номера и «доехала»; tail — верх доезжающих прошлого круга
  }
  return pool
}

/** Сцена на поддельных часах: go(ms) — кадры по 16 мс */
export function setupScene(step, o = {}) {
  const clock = { t: 0, tail: o.tail ?? null }
  const pool = fakePool(clock)
  const fx = { pre: vi.fn(), win: vi.fn(), miss: vi.fn(), fail: vi.fn(), finished: vi.fn(), pitLeft: () => o.pit ?? 0 }
  const run = runPhraseScene({ pool, root: null, scene: { step, from: o.from }, fxRef: { current: fx }, now: () => clock.t, raf: () => 0, caf: () => {}, log: o.log ?? (() => {}), listen: o.listen ?? null, count: o.count ?? (({ onDone }) => { onDone?.(); return () => {} }), held: () => false, snap: () => {}, shake: () => {} })
  const go = ms => { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + (o.frame ?? 16)); run.tick(clock.t) } }
  return { clock, pool, fx, run, go }
}
