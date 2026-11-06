import { describe, it, expect, vi } from 'vitest'
import { restartGameAudio } from './gameAudioRestart.js'
import { waitCtxRunning } from './gameAudioCheck.js'

// Координатор жёсткого перезапуска звука по «Продолжить» (gameAudioRestart.js): порядок шагов в жесте, все контексты закрываются, в голосе микрофон останавливается и открывается заново,
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
    closeCtx: vi.fn(() => { order.push('closeCtx'); cur = null }),
    recreateCtx: vi.fn(() => { order.push('recreateCtx'); cur = ctx; return cur }),
    unlockCtx: vi.fn(() => { order.push('unlockCtx'); return Promise.resolve(cur?.state ?? null) }),
    stopBuffers: vi.fn(() => order.push('stopBuffers')), started: () => 0,
    uiState: () => 'interrupted', resetUi: vi.fn(() => { order.push('resetUi'); return { was: 'interrupted', now: 'running' } }),
    captures: () => ['interrupted'], closeCaptures: vi.fn(() => { order.push('closeCaptures'); return 1 }),
    micLine: () => 'live/muted', closeMic: vi.fn(() => order.push('closeMic')), openMic: vi.fn(() => { order.push('openMic'); return Promise.resolve('granted') }),
    consume: () => 'пауза: hidden', session: () => 'play-and-record/active', active: () => active,
    waitRunning: vi.fn(async get => { order.push('waitRunning'); const s = waits ? waits.shift() : get()?.state ?? null; return { state: s, tries: 1, ms: 10 } }),
    probe: vi.fn(async () => { order.push('probe'); return probeOk ? { ok: true, ms: 50 } : { ok: false, ms: 1500, why: 'время контекста стоит' } }),
    log: vi.fn(), note: vi.fn(), now: () => 0,
  }
  // прежний старт звука (startGameAudio): consume → recreateCtx → тип сессии → openMic → unlock, синхронно
  const start = vi.fn(deps => { order.push('start'); if (deps.consume()) deps.recreateCtx('x'); order.push('session'); const mic = deps.openMic ? deps.openMic() : (order.push('legacyMic'), Promise.resolve('granted')); return mic.then(m => ({ ...startResult, mic: startResult.mic ?? m })) })
  const p = restartGameAudio({ voice, why: 'тест', start }, d)
  return { d, start, p, order, logs: () => d.log.mock.calls.map(c => c[0]) }
}

describe('restartGameAudio: порядок в жесте', () => {
  it('голос: оборвать источники → закрыть ВСЕ контексты (захват Vosk, игровой, интерфейса) → остановить дорожки → старт (новый контекст, сессия, микрофон) → разблокировка — синхронно', () => {
    const { order, start } = setup()
    expect(order).toEqual(['stopBuffers', 'closeCaptures', 'closeCtx', 'resetUi', 'closeMic', 'start', 'recreateCtx', 'session', 'openMic', 'unlockCtx'])
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ openMic: expect.any(Function), recreateCtx: expect.any(Function), consume: expect.any(Function) }))
  })
  it('голос: итог ok, шаги по порядку, журнал «ДО» и «ПОСЛЕ» с состоянием каждого контекста и дорожек', async () => {
    const { p, logs } = setup()
    const r = await p
    expect(r).toMatchObject({ ok: true, mic: 'granted', ctx: 'running', failed: null })
    expect(r.steps).toEqual(['stop-buffers', 'close-contexts', 'ui-ctx', 'mic-stop', 'ctx-new', 'mic-open', 'unlock', 'start-done', 'wait-running', 'probe', 'listener'])
    const L = logs()
    expect(L[0]).toMatch(/ДО — игровой ctx=нет, ctx интерфейса=interrupted, ctx микрофона=\[interrupted\], дорожки=live\/muted, audioSession=play-and-record\/active/)
    expect(L.at(-1)).toMatch(/ПОСЛЕ — игровой ctx=running.*итог звук жив/)
  })
  it('тап: микрофон координатор НЕ останавливает и НЕ открывает (openMic в старт не передаётся — поток как при первом старте)', async () => {
    const { order, d, start, p } = setup({ voice: false })
    expect(d.closeMic).not.toHaveBeenCalled(); expect(d.openMic).not.toHaveBeenCalled()
    expect(start.mock.calls[0][0].openMic).toBeUndefined()
    expect(order).toContain('legacyMic')
    const r = await p
    expect(r.steps).toContain('mic-keep'); expect(r.steps).not.toContain('mic-open'); expect(r.steps).not.toContain('listener')
  })
  it('consume пуст (пометки нет) — всё равно пересоздаём контекст: перезапуск жёсткий всегда', () => {
    const { d } = setup()
    expect(d.recreateCtx).toHaveBeenCalledTimes(1)
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    restartGameAudio({ voice: true, why: 'тест', start }, { ...d, consume: () => null })
    expect(start.mock.calls[0][0].consume()).toBe('жёсткий перезапуск (тест)')
  })
})

describe('restartGameAudio: проверка, что звук вернулся', () => {
  it('контекст не стал running (interrupted) → пересоздание и разблокировка ещё раз → ждём снова', async () => {
    const { d, p } = setup({ waitStates: ['interrupted', 'running'] })
    const r = await p
    expect(d.recreateCtx).toHaveBeenCalledTimes(2); expect(d.waitRunning).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ ok: true, ctx: 'running' }); expect(r.steps).toContain('wait-running-2')
  })
  it('interrupted насовсем → ok false, failed «контекст interrupted», в журнале «ЗВУК НЕ ВЕРНУЛСЯ»', async () => {
    const { p, logs } = setup({ waitStates: ['interrupted', 'interrupted'] })
    const r = await p
    expect(r).toMatchObject({ ok: false, failed: 'контекст interrupted' })
    expect(logs().at(-1)).toMatch(/ЗВУК НЕ ВЕРНУЛСЯ \(контекст interrupted\)/)
  })
  it('без жеста и не в голосе второй попытки нет (новый контекст вне жеста iOS не запустит)', async () => {
    const { d, p } = setup({ voice: false, active: false, waitStates: ['suspended'] })
    expect((await p).ok).toBe(false); expect(d.recreateCtx).toHaveBeenCalledTimes(1)
  })
  it('running, но пробный звук не доиграл → ok false с причиной', async () => {
    const r = await setup({ probeOk: false }).p
    expect(r).toMatchObject({ ok: false, failed: 'пробный звук: время контекста стоит' })
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
