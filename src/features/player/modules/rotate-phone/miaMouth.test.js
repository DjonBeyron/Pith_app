import { describe, it, expect, vi } from 'vitest'
import { createMiaMouth } from './miaMouth.js'

// Рот Мии (эпизод «Мия»): реплика ведёт рот по дорожке букв (как у Пита), усы идут, конец реплики закрывает рот
function rig() {
  let t = 0, rafs = [], timers = []
  const shapes = [], talk = [], heads = [{ id: 'a' }, { id: 'b' }]
  let cur = 0
  const look = { lineStart: vi.fn(), lineEnd: vi.fn(), talking: v => talk.push(v) }
  const m = createMiaMouth({
    getHead: () => heads[cur], look, apply: (h, key) => shapes.push([h.id, key]),
    now: () => t, raf: f => rafs.push(f), caf: () => {}, setTimer: (f, ms) => { timers.push({ f, at: t + ms }); return timers.length }, clearTimer: () => {},
  })
  const frame = ms => { t += ms; const r = rafs; rafs = []; r.forEach(f => f()); timers.filter(x => x.at <= t).forEach(x => { x.f(); x.at = Infinity }) }
  return { m, frame, shapes, talk, look, setHead: i => { cur = i } }
}

describe('рот Мии', () => {
  it('реплика: рот открывается по тексту (формы меняются), усы работают, на конце рот закрыт и усы отпущены', () => {
    const r = rig()
    r.m.speak('Посиди в коробке, понял?', 1500, 'mia_announce_1')
    expect(r.m.busy()).toBe(true); expect(r.look.lineStart).toHaveBeenCalled(); expect(r.talk.at(-1)).toBe(true)
    for (let i = 0; i < 40; i++) r.frame(50)
    const keys = new Set(r.shapes.map(s => s[1])); expect(keys.size).toBeGreaterThan(2) // не один и тот же рот: буквы меняются
    expect(r.m.busy()).toBe(false); expect(r.shapes.at(-1)[1]).toBe('closed'); expect(r.talk.at(-1)).toBe(false); expect(r.look.lineEnd).toHaveBeenCalled()
  })
  it('рисует в ТЕКУЩУЮ голову: смена лица — redraw() переносит форму в новую; stop() закрывает рот', () => {
    const r = rig()
    r.m.speak('Хватит играться', 2000); r.frame(120)
    r.setHead(1); r.m.redraw(); expect(r.shapes.at(-1)[0]).toBe('b')
    r.m.stop(); expect(r.m.busy()).toBe(false)
  })
  it('нулевая длительность — ничего не делает', () => {
    const r = rig(); r.m.speak('привет', 0); expect(r.m.busy()).toBe(false); expect(r.shapes).toEqual([])
  })
})
