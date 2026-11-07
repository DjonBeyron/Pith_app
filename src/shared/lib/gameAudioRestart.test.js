import { describe, it, expect, vi } from 'vitest'
import { restartGameAudio } from './gameAudioRestart.js'
import { waitCtxRunning } from './gameAudioCheck.js'

// Координатор жёсткого перезапуска звука по «Продолжить» (gameAudioRestart.js): порядок шагов, все контексты закрывает renew (gameAudioRenew.js), в голосе микрофон останавливается и открывается заново,
// в тапе — не трогается; resume повторяется, пока контекст не 'running'; «interrupted» насовсем — пересоздание и честный провал (ok: false → «Звук не вернулся»).
function fakeCtx(state = 'suspended', { resumeTo = 'running' } = {}) {
  return { state, currentTime: 1, sampleRate: 48000, resumes: 0, resume() { this.resumes += 1; if (resumeTo) this.state = resumeTo; return Promise.resolve() } }
}

function setup({ voice = true, ctx = fakeCtx('running'), startResult = { mic: 'granted' }, probeOk = true, waitStates = null, active = true } = {}) {
  const order = []
  let cur = null
  const waits = waitStates ? [...waitStates] : null
  const d = {
    ctxState: () => cur?.state ?? null, peekCtx: () => cur,
    // обновление аудиосессии (gameAudioRenew.js): auto → закрыть ВСЕ контексты → тип → новый игровой контекст
    renew: vi.fn(async ({ applyType }) => { order.push('renew'); applyType?.(); cur = ctx; return { ok: true, state: cur.state, closed: 3, kinds: ['game', 'sounds', 'capture'], type: voice ? 'play-and-record' : 'auto', ms: 12 } }),
    voiceType: vi.fn(() => order.push('voiceType')),
    recreateCtx: vi.fn(() => { order.push('recreateCtx'); cur = ctx; return cur }),
    unlockCtx: vi.fn(() => { order.push('unlockCtx'); return Promise.resolve(cur?.state ?? null) }),
    stopBuffers: vi.fn(() => order.push('stopBuffers')), started: () => 0,
    uiState: () => 'interrupted', captures: () => ['interrupted'],
    micLine: () => 'live/muted', closeMic: vi.fn(() => order.push('closeMic')), openMic: vi.fn(() => { order.push('openMic'); return Promise.resolve('granted') }),
    consume: () => 'пауза: hidden', session: () => 'play-and-record/active', active: () => active, memo: {},
    waitRunning: vi.fn(async get => { order.push('waitRunning'); const s = waits ? waits.shift() : get()?.state ?? null; return { state: s, tries: 1, ms: 10 } }),
    probe: vi.fn(async () => { order.push('probe'); return probeOk ? { ok: true, ms: 50 } : { ok: false, ms: 1500, why: 'время контекста стоит' } }),
    log: vi.fn(), note: vi.fn(), now: () => 0,
  }
  // прежний старт звука (startGameAudio): с renewed сессию второй раз не обновляет; тип сессии → openMic → unlock
  const start = vi.fn(deps => { order.push('start'); order.push('session'); const mic = deps.openMic ? deps.openMic() : (order.push('legacyMic'), Promise.resolve('granted')); return mic.then(m => ({ ...startResult, mic: startResult.mic ?? m })) })
  const p = restartGameAudio({ voice, why: 'тест', start }, d)
  return { d, start, p, order, logs: () => d.log.mock.calls.map(c => c[0]) }
}

describe('restartGameAudio: «Продолжить» идёт через обновление аудиосессии (renew)', () => {
  it('голос: оборвать источники → остановить дорожки → renew (auto → закрыть ВСЕ → тип голоса → новый ctx) → старт (renewed, микрофон) → разблокировка', async () => {
    const { order, start, d, p } = setup()
    expect(order.slice(0, 3)).toEqual(['stopBuffers', 'closeMic', 'renew']) // renew начинается синхронно в тапе (auto), старт — после закрытия контекстов
    await p
    expect(order.slice(0, 9)).toEqual(['stopBuffers', 'closeMic', 'renew', 'voiceType', 'probe', 'start', 'session', 'openMic', 'unlockCtx']) // пробный звук после renew — ДО микрофона
    expect(d.renew).toHaveBeenCalledWith(expect.objectContaining({ reason: '«тест»', applyType: d.voiceType, wantType: null }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ renewed: true, openMic: expect.any(Function), consume: expect.any(Function) }))
    expect(d.recreateCtx).not.toHaveBeenCalled() // новый контекст создал renew
  })
  it('голос: итог ok, шаги по порядку, журнал «ДО» и «ПОСЛЕ» с состоянием каждого контекста и дорожек', async () => {
    const { p, logs } = setup()
    const r = await p
    expect(r).toMatchObject({ ok: true, mic: 'granted', ctx: 'running', failed: null })
    expect(r.steps).toEqual(['stop-buffers', 'mic-stop', 'renew', 'probe-live', 'mic-open', 'unlock', 'start-done', 'wait-running', 'probe', 'listener'])
    const L = logs()
    expect(L[0]).toMatch(/ДО — игровой ctx=нет, ctx интерфейса=interrupted, ctx микрофона=\[interrupted\], дорожки=live\/muted, audioSession=play-and-record\/active/)
    expect(L.find(l => l.includes('перезапуск: renew'))).toMatch(/закрыто 3 \(game, sounds, capture\) → тип play-and-record → новый ctx running за 12 мс/)
    expect(L.at(-1)).toMatch(/ПОСЛЕ — игровой ctx=running.*итог звук жив/)
  })
  it('тап: микрофон координатор НЕ останавливает и НЕ открывает; renew ставит тип auto, тип голоса не пишется', async () => {
    const { order, d, start, p } = setup({ voice: false })
    const r = await p
    expect(d.closeMic).not.toHaveBeenCalled(); expect(d.openMic).not.toHaveBeenCalled(); expect(d.voiceType).not.toHaveBeenCalled()
    expect(d.renew).toHaveBeenCalledWith(expect.objectContaining({ wantType: 'auto', applyType: null }))
    expect(start.mock.calls[0][0].openMic).toBeUndefined()
    expect(order).toContain('legacyMic')
    expect(r.steps).toContain('mic-keep'); expect(r.steps).not.toContain('mic-open'); expect(r.steps).not.toContain('listener')
  })
  it('consume пуст (пометки нет) — всё равно полный путь: renew всегда, причина для старта — «жёсткий перезапуск»', async () => {
    const { d, p } = setup()
    await p
    expect(d.renew).toHaveBeenCalledTimes(1)
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    await restartGameAudio({ voice: true, why: 'тест', start }, { ...d, consume: () => null })
    expect(start.mock.calls[0][0].consume()).toBe('жёсткий перезапуск (тест)')
  })
  it('renew упал — старт всё равно идёт, итог не отклоняется', async () => {
    const d0 = setup(); await d0.p
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    const r = await restartGameAudio({ voice: true, why: 'тест', start }, { ...d0.d, renew: () => { throw new Error('boom') } })
    expect(start).toHaveBeenCalled(); expect(r.steps).toContain('renew')
  })
})

describe('restartGameAudio: проверка, что звук вернулся', () => {
  it('контекст не стал running (interrupted) → пересоздание и разблокировка ещё раз → ждём снова', async () => {
    const { d, p } = setup({ waitStates: ['interrupted', 'running'] })
    const r = await p
    expect(d.recreateCtx).toHaveBeenCalledTimes(1); expect(d.waitRunning).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ ok: true, ctx: 'running' }); expect(r.steps).toContain('wait-running-2')
  })
  it('interrupted насовсем (и после повтора цепочки) → ok false, failed «контекст interrupted», в журнале «ЗВУК НЕ ВЕРНУЛСЯ»', async () => {
    const { p, logs } = setup({ waitStates: ['interrupted', 'interrupted', 'interrupted', 'interrupted'] })
    const r = await p
    expect(r).toMatchObject({ ok: false, failed: 'контекст interrupted' })
    expect(logs().at(-1)).toMatch(/ЗВУК НЕ ВЕРНУЛСЯ \(контекст interrupted\)/)
  })
  it('без жеста и не в голосе второй попытки нет (новый контекст вне жеста iOS не запустит)', async () => {
    const { d, p } = setup({ voice: false, active: false, waitStates: ['suspended'] })
    expect((await p).ok).toBe(false); expect(d.recreateCtx).not.toHaveBeenCalled()
  })
  it('running, но пробный звук не доиграл ни после renew, ни после повторов → ok false, dead, микрофон не открывается', async () => {
    const { p, d } = setup({ probeOk: false })
    const r = await p
    expect(r).toMatchObject({ ok: false, dead: true, mic: 'skipped', failed: 'вывод мёртв после renew (3 попыток): время контекста стоит' })
    expect(d.openMic).not.toHaveBeenCalled()
  })
  it('нет Web Audio (state null) — проверять нечего, ok по пробе', async () => {
    const r = await setup({ waitStates: [null] }).p
    expect(r.ok).toBe(true)
  })
  it('микрофон не дали — итог несёт mic, решение за вызывающим', async () => {
    const r = await setup({ startResult: { mic: 'denied' } }).p
    expect(r.mic).toBe('denied')
  })
  it('старт звука упал — итог не отклоняется (mic unavailable)', async () => {
    const d0 = setup()
    await d0.p
    const r = await restartGameAudio({ voice: true, start: () => { throw new Error('boom') } }, { ...d0.d, waitRunning: async () => ({ state: null, tries: 0, ms: 0 }) })
    expect(r.mic).toBe('unavailable')
  })
})

describe('waitCtxRunning: повтор resume и statechange', () => {
  it('resume «съеден» первые два раза — повторяем каждые RETRY_MS, пока не running', async () => {
    vi.useFakeTimers()
    const c = fakeCtx('interrupted', { resumeTo: null })
    let n = 0
    c.resume = function () { n += 1; if (n >= 3) this.state = 'running'; return Promise.resolve() }
    const p = waitCtxRunning(() => c, { retryMs: 100, maxMs: 1000, now: () => Date.now() })
    await vi.advanceTimersByTimeAsync(250)
    const r = await p
    vi.useRealTimers()
    expect(r.state).toBe('running'); expect(n).toBe(3)
  })
  it('так и не running — отдаёт состояние по таймауту', async () => {
    vi.useFakeTimers()
    const c = fakeCtx('interrupted', { resumeTo: null })
    const p = waitCtxRunning(() => c, { retryMs: 100, maxMs: 500, now: () => Date.now() })
    await vi.advanceTimersByTimeAsync(700)
    const r = await p
    vi.useRealTimers()
    expect(r.state).toBe('interrupted'); expect(r.tries).toBeGreaterThanOrEqual(5)
  })
})
