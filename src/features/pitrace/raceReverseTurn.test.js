// Разворот в реверс (raceReverseTurn.js), уход Мии без наползания реплик (mia/miaLeave.js) и стадия catch-rev (владелец 2026-11-17)
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runReverseTurn, REV_MS, REV_ARRIVE_MS, REV_PAUSE_MS, REV_TURN_MS, REV_LEAVE_MS } from './raceReverseTurn.js'
import { afterLeaveSpeech, LEAVE_MAX_POLLS } from './mia/miaLeave.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

function rig() {
  const timers = []; const calls = []; let next = 0
  const mkEl = () => ({ animations: [], animate(frames, o) { const a = { frames, o, cancel: vi.fn() }; this.animations.push(a); return a } })
  const els = [mkEl(), mkEl(), mkEl()]
  const pool = {
    take: lane => { calls.push(['take', lane]); return next++ }, el: k => els[k], cap: (k, c) => calls.push(['cap', k, c]),
    attr: (k, n, on = true) => calls.push(['attr', k, n, on]), give: k => calls.push(['give', k]),
  }
  const root = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v } }
  const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  return { pool, root, els, calls, timers, setTimer, run: o => runReverseTurn({ pool, root, log: () => {}, setTimer, clearTimer: () => {}, ...o }) }
}

describe('разворот в реверс', () => {
  it('три пилюли со стрелкой ↓ и data-still (конвейер затихает сам); приезд с замедлением REV_ARRIVE_MS', () => {
    const r = rig(); r.run()
    expect(r.calls.filter(c => c[0] === 'take').map(c => c[1])).toEqual([0, 1, 2])
    expect(r.calls.filter(c => c[0] === 'cap').every(c => c[2] === '↓')).toBe(true)
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-still' && c[3] === true)).toHaveLength(3)
    for (const el of r.els) expect(el.animations[0].o).toMatchObject({ duration: REV_ARRIVE_MS, fill: 'both' })
  })
  it('таймлайн: поворот на 180° после приезда и паузы, направление узора — в середине поворота, отъезд вверх с data-still снят, возврат в пул в конце; всё укладывается в REV_MS', () => {
    const r = rig(); r.run()
    expect(r.timers.map(t => t.ms)).toEqual([REV_ARRIVE_MS + REV_PAUSE_MS, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS / 2, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 40])
    expect(REV_MS).toBeGreaterThan(r.timers.at(-1).ms - 1)
    r.timers[0].fn(); expect(r.els.every(e => e.animations[1].frames[1].rotate === '180deg')).toBe(true)
    expect(r.root.attrs['data-up']).toBeUndefined(); r.timers[1].fn(); expect(r.root.attrs['data-up']).toBe('')
    r.timers[2].fn(); expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-still' && c[3] === false)).toHaveLength(3); expect(r.els[0].animations[2].o.duration).toBe(REV_LEAVE_MS)
    r.timers[3].fn(); expect(r.calls.filter(c => c[0] === 'give').map(c => c[1])).toEqual([0, 1, 2]); expect(r.els.every(e => e.animations.every(a => a.cancel.mock.calls.length === 1))).toBe(true) // анимации сняты до возврата в пул
  })
  it('быстрый режим (слабое устройство / reduced-motion): поворот без вращения (1 мс)', () => {
    const r = rig(); r.run({ fast: true }); r.timers[0].fn()
    expect(r.els[0].animations[1].o.duration).toBe(1)
  })
})

describe('стадия разворота и уход Мии', () => {
  it('catch-rev: rev = REV_MS, реплика race_reverse (голос, switchTo ru) / race_reverse_tap; сцена reverse; директор держит стадию pitBusy + rev; плашки-подписи у разворота нет; Пит не перебивается — стрелки ждут его', () => {
    const c = rd('./raceStagesCatch.js'), a = rd('./useRaceActs.js'), p = rd('../player/modules/rotate-phone/useWordLanePills.js')
    expect(c).toContain("sid: 'catch-rev', rev: REV_MS"); expect(c).toContain("voice ? 'race_reverse' : 'race_reverse_tap'")
    expect(rd('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("if (stageObj.rev) return { kind: 'reverse', at: s.at }")
    expect(a).toContain('pitBusy() + st.rev + 150'); expect(a).toContain("plate: st => (st?.rev ? ''"); expect(a).toContain('mspeech.leftMs()')
    expect(p).toContain("fxRef.current?.pitBusy?.() ?? 0"); expect(p).toContain('tail < 30')
    expect(rd('../player/modules/rotate-phone/wordLanePool.js')).toContain("'data-up', 'data-arrow'") // у пилюли из пула стрелка не остаётся
  })
  it('afterLeaveSpeech: идём дальше только когда очередь речи пуста (и не раньше delay); страховка по числу опросов', () => {
    const timers = []; let pending = 2; const go = vi.fn()
    afterLeaveSpeech({ pending: () => pending, delay: 1200, go, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length } })
    expect(timers[0].ms).toBe(1200); timers.shift().fn(); expect(go).not.toHaveBeenCalled(); timers.shift().fn(); expect(go).not.toHaveBeenCalled()
    pending = 0; timers.shift().fn(); expect(go).toHaveBeenCalledTimes(1)
    const t2 = []; const go2 = vi.fn(); afterLeaveSpeech({ pending: () => 5, delay: 0, go: go2, setTimer: fn => { t2.push(fn); return t2.length } })
    for (let i = 0; i < LEAVE_MAX_POLLS + 2 && t2.length; i++) t2.shift()()
    expect(go2).toHaveBeenCalledTimes(1) // страховка
  })
})
