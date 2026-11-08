import { describe, it, expect, vi } from 'vitest'
import { restartGameAudio, SOUND_BUSY_TEXT } from './gameAudioRestart.js'
import { renewUntilLive, retryPlan, LIVE_PROBE_MS, RETRY_GAP_MS, RENEW_RETRIES, RETRIES_INTERRUPTED, GAP_INTERRUPTED_MS } from './gameAudioRenewLive.js'

// v3.3.165 (журнал владельца: после диктовки в Telegram дорожка ended, три пробы «мёртв», getUserMedia не вызывался — жёлтой точки нет):
// дорожка не живая → тип сессии и getUserMedia в жесте ДО renew и пробы; вывод мёртв — захват микрофона → renew → проба, потом проба в типе auto → busy; quick (авто-повтор) — без жеста и без getUserMedia.
const ctx = () => ({ state: 'running', currentTime: 1, resume() { return Promise.resolve() } })
function setup({ probes = [], active = true, micLine = 'live/ended (жив, выключен)', openMic = 'granted', quick = false, session = 'play-and-record/active' } = {}) {
  const order = []
  const seq = [...probes]
  let cur = null, line = micLine
  const d = {
    ctxState: () => cur?.state ?? null, peekCtx: () => cur,
    renew: vi.fn(async o => { order.push(`renew${o.wantType === 'auto' && !o.applyType ? ':auto' : ''}`); o.applyType?.(); cur = ctx(); return { ok: true, state: 'running', closed: 1, kinds: ['game'], type: 'play-and-record', ms: 5 } }),
    voiceType: vi.fn(() => order.push('type')), recreateCtx: vi.fn(), unlockCtx: vi.fn(() => order.push('unlock')),
    stopBuffers: vi.fn(), started: () => 0, uiState: () => null, captures: () => [], markTap: vi.fn(),
    micLine: () => line, closeMic: vi.fn(), openMic: vi.fn(() => { order.push('gum'); if (openMic === 'granted') line = 'live'; return Promise.resolve(openMic) }),
    consume: () => null, session: () => session, active: () => active, memo: {}, now: () => 0,
    waitRunning: vi.fn(async () => ({ state: cur?.state ?? null, tries: 0, ms: 1 })),
    probe: vi.fn(async (_c, o) => { const ok = seq.length ? seq.shift() : true; order.push(`probe${o?.maxMs ? '-live' : ''}:${ok ? 'ok' : 'dead'}`); return ok ? { ok: true, ms: 40 } : { ok: false, ms: 300, why: 'пробный звук не доиграл' } }),
    log: vi.fn(), note: vi.fn(),
  }
  const start = vi.fn(deps => { order.push('start'); return Promise.resolve(deps.openMic ? deps.openMic() : 'off').then(mic => ({ mic })) })
  const p = restartGameAudio({ voice: true, why: 'тест', start, quick }, d)
  return { d, p, order, start, logs: () => d.log.mock.calls.map(c => c[0]) }
}

describe('«Продолжить»: дорожка ended / нет потока — getUserMedia в жесте ДО проверки вывода', () => {
  it('порядок: тип сессии → getUserMedia (синхронно в тапе) → renew → проба → старт; шаг mic-first в журнале', async () => {
    const t = setup({ micLine: 'ended/muted/off' })
    expect(t.order).toEqual(['type', 'gum']) // ещё до первого await — в жесте
    const r = await t.p
    expect(r).toMatchObject({ ok: true, mic: 'granted' })
    expect(t.order.slice(0, 6)).toEqual(['type', 'gum', 'renew', 'type', 'probe-live:ok', 'start'])
    expect(r.steps.slice(0, 5)).toEqual(['stop-buffers', 'mic-off', 'mic-first', 'mic-first-done', 'renew'])
    expect(t.logs().some(l => l.includes('getUserMedia в жесте ДО проверки вывода'))).toBe(true)
  })
  it('«нет потока» и заглушённая дорожка — тоже mic-first; живая выключенная (live/off) — прежний порядок (renew → проба → микрофон)', async () => {
    expect(setup({ micLine: 'нет потока' }).order).toEqual(['type', 'gum'])
    expect(setup({ micLine: 'live/muted/off (жив, выключен)' }).order).toEqual(['type', 'gum'])
    const off = setup({ micLine: 'live/off (жив, выключен)' })
    expect(off.order).toEqual(['renew', 'type'])
    await off.p
    expect(off.order.indexOf('gum')).toBeGreaterThan(off.order.indexOf('probe-live:ok'))
  })
  it('микрофон не дали в mic-first — итог несёт mic (denied), renew не идёт', async () => {
    const t = setup({ micLine: 'ended', openMic: 'denied' })
    const r = await t.p
    expect(r).toMatchObject({ ok: false, mic: 'denied' }); expect(t.d.renew).not.toHaveBeenCalled()
  })
  it('вывод мёртв и после mic-first → проба в типе auto живая → dead + busy «микрофон занят другим приложением»', async () => {
    const t = setup({ micLine: 'ended', probes: [false, false, false, true] })
    const r = await t.p
    expect(r).toMatchObject({ ok: false, dead: true, mic: 'granted' })
    expect(r.busy).toMatch(/микрофон занят другим приложением/)
    expect(t.d.openMic).toHaveBeenCalledTimes(1) // микрофон уже открыт в начале тапа — запасной путь (а) не повторяет
    expect(t.order.slice(-2)).toEqual(['renew:auto', 'probe-live:ok'])
    expect(SOUND_BUSY_TEXT).toMatch(/занят другим приложением.*«Продолжить»/)
  })
  it('quick (авто-повтор без жеста): getUserMedia не зовётся, renew без повторов, без запасного пути; дорожки нет — tapAgain', async () => {
    const dead = setup({ micLine: 'ended', active: false, quick: true, probes: [false] })
    const r = await dead.p
    expect(r).toMatchObject({ ok: false, dead: true, mic: 'skipped' }); expect(dead.d.openMic).not.toHaveBeenCalled(); expect(dead.d.renew).toHaveBeenCalledTimes(1)
    const free = setup({ micLine: 'ended', active: false, quick: true })
    expect(await free.p).toMatchObject({ ok: false, tapAgain: true }); expect(free.d.openMic).not.toHaveBeenCalled()
    const live = setup({ micLine: 'live/off (жив, выключен)', active: false, quick: true })
    expect(await live.p).toMatchObject({ ok: true }) // дорожка жива — включается без getUserMedia, игра продолжается без тапа
  })
})

describe('renewUntilLive: audioSession.state в журнале, прерванная сессия — 4 повтора по 2,5 с', () => {
  it('retryPlan: interrupted → 4 × 2,5 с, иначе 2 × 1,2 с; maxRetries — потолок', () => {
    expect(retryPlan('play-and-record/interrupted')).toEqual({ max: RETRIES_INTERRUPTED, gap: GAP_INTERRUPTED_MS })
    expect(retryPlan('play-and-record/active')).toEqual({ max: RENEW_RETRIES, gap: RETRY_GAP_MS })
    expect(retryPlan('auto/interrupted', 0)).toEqual({ max: 0, gap: GAP_INTERRUPTED_MS })
    expect([RETRIES_INTERRUPTED, GAP_INTERRUPTED_MS]).toEqual([4, 2500])
  })
  it('сессия interrupted и вывод мёртв — 4 повтора с выдержкой 2500 мс; каждая строка несёт audioSession', async () => {
    const renew = vi.fn(async () => ({ ok: true })), probe = vi.fn(async () => ({ ok: false, why: 'не доиграл' })), log = vi.fn()
    const r = await renewUntilLive({ reason: 'x' }, { renew, probe, peekCtx: () => ({ state: 'running' }), log, active: () => true, session: () => 'play-and-record/interrupted' })
    expect(r).toMatchObject({ ok: false, tries: 4, session: 'play-and-record/interrupted' }); expect(renew).toHaveBeenCalledTimes(5)
    expect(renew.mock.calls[1][0]).toMatchObject({ holdMs: 2500, reason: 'x, повтор 1/4' })
    expect(probe).toHaveBeenCalledWith({ state: 'running' }, { maxMs: LIVE_PROBE_MS })
    expect(log.mock.calls.every(c => c[0].includes('audioSession=play-and-record/interrupted'))).toBe(true)
  })
})
