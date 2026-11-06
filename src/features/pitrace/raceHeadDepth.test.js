import { describe, it, expect } from 'vitest'
import { headDepth, DOWN_Y, HIDE_MS, HIDE_GRACE_MS, WAIT_TARGET_MS, RISE_MS } from './raceHeadDepth.js'
import { createDodgeDrive } from './raceDodgeDrive.js'
import { DIVE_DOWN_MS, DIVE_UP_MS, JUMP_MS } from './raceDodge.js'

// Одна правда по вертикали (raceHeadDepth.js) на поддельной голове: класс wlCat--up и пауза — флаги, записи --wl-dx / --wl-dy / data-dodge считаются. Цепочки смены стадий: каждый переход атомарен,
// новая цель ждёт конца начатого и выполняется одним переходом; значения пишутся только при изменении.
function head({ up = true } = {}) {
  const st = { up, paused: false }
  const writes = []
  const vars = {}
  const dataset = new Proxy({}, { set: (o, k, v) => { o[k] = v; if (k === 'dodge') writes.push(v); return true } })
  const cat = { dataset, style: { getPropertyValue: () => '', setProperty: (k, v) => { vars[k] = v; writes.push(`${k}=${v}`) } }, classList: { add: () => {}, contains: c => c === 'wlCat--up' && st.up }, querySelector: () => ({}) }
  let t = 0, seq = 0
  const timers = []
  const c = {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.push({ id, at: t + ms, fn }); return id },
    clearTimer: id => { const k = timers.findIndex(x => x.id === id); if (k >= 0) timers.splice(k, 1) },
    go(ms) { const end = t + ms; for (let x = timers.filter(y => y.at <= end).sort((a, b) => a.at - b.at)[0]; x; x = timers.filter(y => y.at <= end).sort((a, b) => a.at - b.at)[0]) { timers.splice(timers.indexOf(x), 1); t = Math.max(t, x.at); x.fn() } t = end },
  }
  const d = headDepth(cat, { x0: 50, headW: 50, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isUp: () => st.up, isPaused: () => st.paused })
  const set = o => { Object.assign(st, o); d.sync() }
  const modes = () => writes.filter(w => !w.startsWith('--'))
  return { d, c, cat, vars, writes, st, set, modes }
}

describe('raceHeadDepth: одна правда по вертикали', () => {
  it('нырок: вниз до конца → x под краем → выныривает; повторная цель во время нырка — тем же переходом', () => {
    const { d, c, vars, modes } = head()
    d.dive(27)
    expect(vars['--wl-dy']).toBe(DOWN_Y); expect(vars['--wl-dx']).toBe('0.00%')
    c.go(100); d.dive(73) // цель сменилась посреди нырка
    expect(d.left()).toBe(DIVE_DOWN_MS - 100 + DIVE_UP_MS)
    c.go(100)
    expect(vars['--wl-dx']).toBe('46.00%'); expect(vars['--wl-dy']).toBe('0%')
    c.go(DIVE_UP_MS)
    expect(modes()).toEqual(['set', 'dive-down', 'dive-up'])
    expect(d.left()).toBe(0)
  })
  it('после окончания перехода значения не пишутся: повторные sync / одна и та же цель — без записей', () => {
    const { d, c, writes } = head()
    d.dive(27); c.go(1000)
    const n = writes.length
    for (let i = 0; i < 20; i++) { d.sync(); d.jump(27, 1); c.go(16) }
    expect(writes.length).toBe(n)
  })
  it('уход по peek с выдержкой: голову позвали снова раньше HIDE_GRACE_MS — ни одной записи (нет «хочет нырнуть»)', () => {
    const { c, writes, set, vars } = head()
    const n = writes.length
    set({ up: false }); c.go(HIDE_GRACE_MS - 50); set({ up: true }); c.go(1000)
    expect(writes.length).toBe(n)
    set({ up: false }); c.go(HIDE_GRACE_MS + HIDE_MS)
    expect(vars['--wl-dy']).toBe(DOWN_Y)
  })
  it('начатый уход доигрывает: подъём для речи посреди ухода — после него, одним выныриванием', () => {
    const { c, set, modes } = head()
    set({ up: false }); c.go(HIDE_GRACE_MS + 100)
    set({ up: true })
    expect(modes().at(-1)).toBe('hide')
    c.go(HIDE_MS)
    expect(modes().slice(-2)).toEqual(['hide', 'rise'])
    c.go(RISE_MS)
    expect(modes().filter(m => m === 'rise')).toHaveLength(1)
  })
  it('прыжок во время выныривания ждёт его конца (translate не обрывается)', () => {
    const { d, c, vars, modes } = head()
    d.dive(27); c.go(DIVE_DOWN_MS + 50)
    d.jump(73, 1)
    expect(modes().at(-1)).toBe('dive-up'); expect(vars['--wl-dx']).toBe('-46.00%')
    c.go(DIVE_UP_MS)
    expect(modes().at(-1)).toBe('jump'); expect(vars['--wl-dx']).toBe('46.00%')
    expect(d.left()).toBe(JUMP_MS - 50)
  })
  it('пауза посреди нырка: нырок доигрывает вниз и голова остаётся внизу; конец ступени — только цель', () => {
    const { d, c, set, modes, vars } = head()
    d.dive(27); c.go(80)
    set({ paused: true })
    d.dive(50) // конец старой ступени (stop) — нырок в центр
    c.go(2000)
    expect(modes()).toEqual(['set', 'dive-down'])
    expect(vars['--wl-dy']).toBe(DOWN_Y); expect(vars['--wl-dx']).toBe('0.00%')
  })
  it('пауза → «Продолжить» → новая ступень: голова ныряет на паузе и выныривает ОДИН раз под первой пилюлей', () => {
    const { d, c, set, modes, vars } = head()
    d.dive(73); c.go(1000)
    set({ paused: true }); c.go(DIVE_DOWN_MS)
    expect(modes().at(-1)).toBe('dive-down'); expect(vars['--wl-dy']).toBe(DOWN_Y)
    d.dive(50); c.go(1500) // stop старой ступени
    set({ paused: false }); c.go(60) // фаза сменилась раньше, чем стартовал движок новой ступени
    expect(vars['--wl-dy']).toBe(DOWN_Y) // ещё не выныривает: ждёт цель
    d.dive(27) // старт новой ступени
    expect(vars['--wl-dx']).toBe('-46.00%'); expect(vars['--wl-dy']).toBe('0%')
    c.go(2000)
    expect(modes().slice(-3)).toEqual(['dive-up', 'dive-down', 'dive-up']) // нырок на паузе, одно выныривание
  })
  it('после паузы ступень без пилюль: цели нет — выныривает по центру через WAIT_TARGET_MS', () => {
    const { d, c, set, vars } = head()
    d.dive(73); c.go(1000)
    set({ paused: true }); d.dive(50); c.go(500)
    set({ paused: false }); c.go(WAIT_TARGET_MS - 10)
    expect(vars['--wl-dy']).toBe(DOWN_Y)
    c.go(20)
    expect(vars['--wl-dx']).toBe('0.00%'); expect(vars['--wl-dy']).toBe('0%')
  })
})

describe('цепочки смены стадий (привод + глубина)', () => {
  const pill = (y, o = {}) => ({ id: 'a', rep: 0, lane: 0, y, speed: 1, state: 'fly', ...o })
  it('конец ступени → плашка (реплика поднимает голову) → новая ступень: каждый нырок один, голова по центру на плашке', () => {
    const h = head()
    const dr = createDodgeDrive({ cat: h.cat, lanes: [0, 2], log: () => {}, now: h.c.now, setTimer: h.c.setTimer, clearTimer: h.c.clearTimer, quick: false })
    h.c.go(1000)
    dr.stop() // ступень кончилась: нырок в центр
    h.c.go(60); h.set({ up: true }) // реплика плашки посреди нырка — ждёт выныривания
    h.c.go(1000)
    expect(h.vars['--wl-dx']).toBe('0.00%')
    const center = h.modes().length
    h.c.go(3000) // плашка: Пит в центре, ничего не пишется
    expect(h.modes().length).toBe(center)
    createDodgeDrive({ cat: h.cat, lanes: [2], log: () => {}, now: h.c.now, setTimer: h.c.setTimer, clearTimer: h.c.clearTimer, quick: false })
    h.c.go(1000)
    expect(h.modes().slice(center)).toEqual(['dive-down', 'dive-up'])
    expect(h.vars['--wl-dx']).toBe('46.00%')
  })
  it('зачёт на последней пилюле → итог: один нырок в центр, stop после него ничего не добавляет', () => {
    const h = head()
    const dr = createDodgeDrive({ cat: h.cat, lanes: [0], log: () => {}, now: h.c.now, setTimer: h.c.setTimer, clearTimer: h.c.clearTimer, quick: false })
    h.c.go(1000)
    const n = h.modes().length
    dr.step([pill(40)], 1000, [{ type: 'claim', rep: { idx: 0 } }])
    h.c.go(100); dr.stop(); h.c.go(2000)
    expect(h.modes().slice(n)).toEqual(['dive-down', 'dive-up'])
    expect(h.vars['--wl-dx']).toBe('0.00%')
  })
})
