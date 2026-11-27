import { describe, it, expect, vi } from 'vitest'
import { createRepGone } from './wordLaneRepGone.js'
import { readFileSync } from 'node:fs'

// «Пилюля слова полностью ушла» (владелец 2026-11-27: мягкие реплики Пита — когда пилюля уже скрылась): событие — по концу уже идущей анимации / ухода за нижний край, не по таймеру.
const tick = () => new Promise(r => setTimeout(r, 0))
const rig = () => { const held = new Map(), gone = vi.fn(), g = createRepGone(held, { current: { gone } }); return { held, gone, g } }

describe('wordLaneRepGone', () => {
  it('взлёт кончился → gone(rise) с числом повторов, ещё державшихся на экране; пока анимация идёт — тишина; отменённая (пауза, смена стадии) — тоже тишина', async () => {
    const { held, gone, g } = rig(); let end; const a = { finished: new Promise(r => { end = r }) }
    held.set('p2', 5); g.spawn('p1', 3); g.spawn('p2', 4); held.delete('p1'); g.rose('p1', 3, a)
    await tick(); expect(gone).not.toHaveBeenCalled(); end(); await tick(); expect(gone).toHaveBeenCalledWith({ idx: 3, why: 'rise', out: 1 })
    const b = { finished: Promise.reject(new Error('AbortError')) }; g.spawn('p3', 7); g.rose('p3', 7, b); await tick(); expect(gone).toHaveBeenCalledTimes(1)
  })
  it('уход за нижний край: событие, когда ушёл последний кусок повтора; out считается без ушедшей', () => {
    const { held, gone, g } = rig(); held.set('a', 1); held.set('b', 2); g.spawn('a', 0); g.spawn('b', 0); g.spawn('c', 1); held.set('c', 3)
    held.delete('a'); g.below('a'); expect(gone).not.toHaveBeenCalled(); held.delete('b'); g.below('b'); expect(gone).toHaveBeenCalledWith({ idx: 0, why: 'fail', out: 1 })
  })
  it('всплывшая упущенная пилюля («Гонка с Питом»): событие — когда погасла; не последний кусок взлёта (last: false) — без события', async () => {
    const { gone, g } = rig(); g.spawn('x', 2); g.lingered('x', 2, { finished: Promise.resolve() }); await tick(); expect(gone).toHaveBeenCalledWith({ idx: 2, why: 'linger', out: 0 })
    g.spawn('y', 6); g.rose('y', 6, { finished: Promise.resolve() }, false); await tick(); expect(gone).toHaveBeenCalledTimes(1)
  })
  it('движок подключён: spawn / win / fail / уход за край зовут wordLaneRepGone', () => {
    const eng = readFileSync(new URL('./useWordLanePills.js', import.meta.url), 'utf8')
    for (const s of ['gone.spawn(p.id, e.rep.idx)', 'gone.rose(e.pill.id, e.rep.idx, a, e.last !== false)', 'gone.lingered(p.id, e.rep.idx, pool.linger(k))', 'gone.below(id)']) expect(eng).toContain(s)
  })
})
