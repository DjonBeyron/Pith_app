import { describe, it, expect, vi } from 'vitest'
import { createMicHealth, micHealthLine, ZERO_MS, AGAIN_MS } from './standMicHealth.js'
import { createStandTrace } from './pillStandTrace.js'

// Здоровье микрофона стенда (замечание владельца: «микрофон перестал гореть жёлтым» — rms ровно 0 сорок секунд, слушатель «dead», стенд не оживлял): тишина — переоткрыть тем же путём, что игра (renew),
// снова оглох вскоре — плашка (тап); дорожка оборвана — сразу плашка; заглушена — ждём unmute. Часы ручные.
function rig({ renew = () => Promise.resolve('granted'), reopen = () => Promise.resolve('granted'), track = { readyState: 'live', muted: false }, waitUnmute = () => Promise.resolve(true) } = {}) {
  let t = 0
  const trace = createStandTrace({ now: () => t, log: () => {} })
  const states = [], revived = []
  const h = createMicHealth({ trace, renew: vi.fn(renew), reopen: vi.fn(reopen), tracks: () => track, waitUnmute, onState: s => states.push(s.state), onRevived: how => revived.push(how), now: () => t })
  return { h, trace, states, revived, tick: ms => { t += ms }, kinds: () => trace.events().map(e => e.k) }
}
const flush = () => new Promise(r => setTimeout(r, 0))

describe('здоровье микрофона стенда', () => {
  it('уровень ровно 0 дольше ZERO_MS — оглох (rms0) → переоткрыт без жеста → ожил, слушатель перезапускается', async () => {
    const r = rig()
    for (let k = 0; k <= ZERO_MS; k += 50) { r.h.level(0); r.tick(50) }
    await flush()
    expect(r.trace.events().find(e => e.k === 'mic-dead')).toMatchObject({ why: 'rms0', readyState: 'live', muted: false, attempts: 0 })
    expect(r.trace.events().find(e => e.k === 'mic-revive')).toMatchObject({ how: 'авто', attempts: 1 })
    expect(r.revived).toEqual(['авто'])
    expect(r.states).toEqual(['reviving', 'ok'])
  })
  it('тихий шум (не ноль) — не смерть; ноль прерванный голосом — отсчёт сначала', () => {
    const r = rig()
    for (let k = 0; k < ZERO_MS * 3; k += 50) { r.h.level(k % 1000 === 0 ? 0.0004 : 0); r.tick(50) }
    expect(r.kinds()).not.toContain('mic-dead')
  })
  it('слушатель «dead» снова вскоре после авто-оживления — плашка; тап — ожил', async () => {
    const r = rig()
    r.h.dead('dead'); await flush()
    r.tick(AGAIN_MS - 1000); r.h.dead('dead'); await flush()
    expect(r.h.state()).toBe('tap')
    const p = r.h.tap(); await p
    expect(r.revived).toEqual(['авто', 'тап'])
    expect(r.h.state()).toBe('ok')
  })
  it('дорожка оборвана (ended) — сразу плашка: без жеста getUserMedia на iOS показывает диалог', async () => {
    const r = rig({ track: { readyState: 'ended', muted: false } })
    r.h.dead('rms0'); await flush()
    expect(r.h.state()).toBe('tap')
    expect(r.trace.events().find(e => e.k === 'mic-dead')).toMatchObject({ why: 'ended', signal: 'rms0', readyState: 'ended' })
  })
  it('заглушена (mute) — ждём unmute; не ожила — плашка; переоткрыть не вышло — плашка с причиной', async () => {
    const a = rig(); a.h.dead('mute'); await flush(); expect(a.revived).toEqual(['unmute'])
    const b = rig({ waitUnmute: () => Promise.resolve(false) }); b.h.dead('mute'); await flush(); expect(b.h.state()).toBe('tap')
    const c = rig({ renew: () => Promise.resolve('denied') }); c.h.dead('dead'); await flush(); expect(c.h.state()).toBe('tap')
    expect(c.trace.events().find(e => e.k === 'mic-revive-fail')).toMatchObject({ how: 'авто', result: 'denied' })
  })
  it('строка «микрофон: …» для шапки отчёта', async () => {
    const r = rig()
    expect(micHealthLine(r.trace.events())).toBe('без сбоев')
    r.h.dead('dead'); await flush()
    expect(micHealthLine(r.trace.events())).toMatch(/^оглох 1 раз \(слушатель: тишина \(dead\)\), ожил 1 \(авто 1\), попыток 1; последний сбой 0,0 с: readyState live, muted false$/)
  })
})
