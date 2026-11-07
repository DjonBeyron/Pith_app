import { describe, it, expect, vi } from 'vitest'
import { restartGameAudio, REUSE_MS, SOUND_DEAD_TEXT, TAP_AGAIN_TEXT } from './gameAudioRestart.js'
import { renewUntilLive, LIVE_PROBE_MS, RETRY_GAP_MS } from './gameAudioRenewLive.js'

// v3.3.147: «Продолжить» — пробный звук сразу после renew (ДО getUserMedia), повтор renew до 2 раз с выдержкой 1,2 с, микрофон только после живой пробы; жест истёк — tapAgain;
// вывод умер после микрофона — один повтор всей цепочки (журнал владельца: «probe — НЕ доиграл за 1500 мс (контекст running)» после «mic granted»).
const ctx = (state = 'running') => ({ state, currentTime: 1, resume() { return Promise.resolve() } })

function setup({ probes = [], active = true, micLine = 'нет потока', memo = {}, now = () => 0, ctxStart = null } = {}) {
  const order = []
  const seq = [...probes]
  let cur = ctxStart
  const d = {
    ctxState: () => cur?.state ?? null, peekCtx: () => cur,
    renew: vi.fn(async o => { order.push(`renew${o.holdMs ? `:${o.holdMs}` : ''}`); cur = ctx(); return { ok: true, state: 'running', closed: 1, kinds: ['game'], type: 'play-and-record', ms: 5 } }),
    voiceType: vi.fn(), recreateCtx: vi.fn(), unlockCtx: vi.fn(() => order.push('unlock')),
    stopBuffers: vi.fn(), started: () => 0, uiState: () => null, captures: () => [], markTap: vi.fn(),
    micLine: () => micLine, closeMic: vi.fn(), openMic: vi.fn(() => { order.push('openMic'); return Promise.resolve('granted') }),
    consume: () => null, session: () => 'auto/active', active: () => active, memo, now,
    waitRunning: vi.fn(async () => ({ state: cur?.state ?? null, tries: 0, ms: 1 })),
    probe: vi.fn(async (_c, o) => { const ok = seq.length ? seq.shift() : true; order.push(`probe${o?.maxMs ? `:${o.maxMs}` : ''}:${ok ? 'ok' : 'dead'}`); return ok ? { ok: true, ms: 40 } : { ok: false, ms: 300, why: 'время контекста стоит' } }),
    log: vi.fn(), note: vi.fn(),
  }
  const start = vi.fn(deps => { order.push('start'); return Promise.resolve(deps.openMic ? deps.openMic() : 'off').then(mic => ({ mic })) })
  const p = restartGameAudio({ voice: true, why: 'тест', start }, d)
  return { d, p, order, start, logs: () => d.log.mock.calls.map(c => c[0]) }
}

describe('restartGameAudio: живой вывод до микрофона', () => {
  it('проба после renew мёртвая → повтор renew с выдержкой 1,2 с → живая → только тогда getUserMedia; журнал «повтор 1/2 через 1,2 с»', async () => {
    const { p, order, logs } = setup({ probes: [false, true, true] })
    const r = await p
    expect(r.ok).toBe(true)
    expect(order).toEqual(['renew', `probe:${LIVE_PROBE_MS}:dead`, `renew:${RETRY_GAP_MS}`, `probe:${LIVE_PROBE_MS}:ok`, 'start', 'openMic', 'unlock', 'probe:ok'])
    expect(logs()).toContain('[audio] вывод мёртв после renew — повтор 1/2 через 1,2 с (время контекста стоит)')
  })
  it('мёртв и после двух повторов → dead, микрофон не открывается, на плашке совет заблокировать экран', async () => {
    const { p, d, order } = setup({ probes: [false, false, false] })
    const r = await p
    expect(r).toMatchObject({ ok: false, dead: true, mic: 'skipped' })
    expect(d.renew).toHaveBeenCalledTimes(3); expect(d.openMic).not.toHaveBeenCalled(); expect(order).not.toContain('start')
    expect(SOUND_DEAD_TEXT).toMatch(/заблокировать и разблокировать экран/)
  })
  it('жест истёк, пока проверялся вывод (userActivation.isActive = false), микрофона нет → tapAgain без getUserMedia; следующий тап с живым контекстом renew пропускает', async () => {
    const memo = {}
    const a = setup({ active: false, memo })
    const r = await a.p
    expect(r).toMatchObject({ ok: false, tapAgain: true, mic: 'skipped' })
    expect(a.d.openMic).not.toHaveBeenCalled(); expect(a.start).not.toHaveBeenCalled()
    expect(a.logs().some(l => l.includes(`«${TAP_AGAIN_TEXT}»`))).toBe(true)
    expect(memo.at).toBe(0)
    const b = setup({ memo, ctxStart: ctx('running'), now: () => REUSE_MS - 1 })
    const r2 = await b.p
    expect(r2.ok).toBe(true)
    expect(b.d.renew).not.toHaveBeenCalled()
    expect(b.order).toEqual([`probe:${LIVE_PROBE_MS}:ok`, 'start', 'openMic', 'unlock', 'probe:ok'])
    expect(memo.at).toBeNull()
  })
  it('жест истёк, но поток микрофона живой — getUserMedia не нужен, идём дальше', async () => {
    const { p, d } = setup({ active: false, micLine: 'live' })
    expect((await p).ok).toBe(true); expect(d.openMic).toHaveBeenCalled()
  })
  it('вывод умер после открытия микрофона → журнал и ОДИН повтор всей цепочки (renew → проба → старт); второй провал — итог', async () => {
    const ok = setup({ probes: [true, false, true, true] })
    const r = await ok.p
    expect(r).toMatchObject({ ok: true, chain: 2 })
    expect(ok.order).toEqual(['renew', `probe:${LIVE_PROBE_MS}:ok`, 'start', 'openMic', 'unlock', 'probe:dead', 'renew', `probe:${LIVE_PROBE_MS}:ok`, 'start', 'openMic', 'unlock', 'probe:ok'])
    expect(ok.logs().some(l => l.includes('вывод умер после открытия микрофона'))).toBe(true)
    const bad = setup({ probes: [true, false, true, false] })
    expect(await bad.p).toMatchObject({ ok: false, failed: 'пробный звук: время контекста стоит', chain: 2 })
    expect(bad.d.renew).toHaveBeenCalledTimes(2)
  })
})

describe('renewUntilLive', () => {
  it('живой с первого раза — без повторов; нет Web Audio (проба ok) — тоже', async () => {
    const renew = vi.fn(async () => ({ ok: true })), probe = vi.fn(async () => ({ ok: true, ms: 30 }))
    const r = await renewUntilLive({ reason: 'x' }, { renew, probe, peekCtx: () => null, log: () => {}, active: () => true })
    expect(r).toMatchObject({ ok: true, tries: 0, tapAgain: false }); expect(renew).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith(null, { maxMs: LIVE_PROBE_MS })
  })
  it('повтор вне жеста, новый контекст не running → tapAgain, дальше не повторяем', async () => {
    const renew = vi.fn(async () => ({ ok: false })), probe = vi.fn(async () => ({ ok: false, why: 'контекст suspended' }))
    const r = await renewUntilLive({ reason: 'x' }, { renew, probe, peekCtx: () => ({ state: 'suspended' }), log: () => {}, active: () => false })
    expect(r).toMatchObject({ ok: false, tapAgain: true, tries: 1 }); expect(renew).toHaveBeenCalledTimes(2)
    expect(renew.mock.calls[1][0]).toMatchObject({ reason: 'x, повтор 1/2', holdMs: RETRY_GAP_MS })
  })
})
