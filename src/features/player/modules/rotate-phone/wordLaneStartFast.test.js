import { describe, it, expect, vi, beforeEach } from 'vitest'

// Быстрый старт «Гонки» (v3.3.115): реплика race_start НЕ ждёт микрофон. После тапа: resume контекста (≤ FAST_CTX_WAIT_MS, без пересоздания) → буферы (wake) → ворота первых реплик → ready (onLineReady);
// микрофон, settle и повторный прогрев идут параллельно и следом. Обычная игра (cfg без plan.game 'race') остаётся на прежнем порядке mic → settle → ctx → wake → ворота.
const calls = vi.hoisted(() => [])
const rec = name => vi.fn((...a) => { calls.push(name); return a })
vi.mock('./wordLaneVoice.js', () => ({ prepareTrack: rec('prepareTrack'), rewakeTrack: rec('rewakeTrack') }))
vi.mock('./wordLaneNotes.js', () => ({ unlockNotes: rec('unlockNotes'), releaseNotes: rec('releaseNotes') }))
vi.mock('./wordLaneClips.js', () => ({ prepareWords: vi.fn(() => Promise.resolve(true)), prepareClips: rec('prepareClips'), rewakeClips: rec('rewakeClips') }))
vi.mock('./wordLaneAudio.js', () => ({ playSpan: s => s, clipsFor: () => ({ start: 0, end: 1 }) }))
vi.mock('./wordLaneLib.js', () => ({ libItems: () => [] }))
vi.mock('./wordLaneCatLines.js', () => ({ linesItems: () => [], lineKey: id => `line:${id}` }))
vi.mock('../../word-audio/wordAudioPlayer.js', () => ({ rewarmWordElements: rec('rewarmWords') }))
vi.mock('../../../../shared/lib/primedAudio.js', () => ({ primeAudio: rec('primeAudio') }))
vi.mock('../../../../shared/lib/sounds.js', () => ({ preloadSounds: rec('preloadSounds'), unlockAudio: rec('unlockAudio'), onAudioInterrupted: () => () => {}, soundCtxState: () => null }))

const { startGameAudio, FAST_CTX_WAIT_MS } = await import('./wordLaneStart.js')
const { gameCtxState } = await import('../../../../shared/lib/gameAudioCtx.js')

const race = { chunks: ['learn'], confusers: [], hasAudio: false, plan: { game: 'race' } }
const plain = { chunks: ['learn'], confusers: [], hasAudio: false }
beforeEach(() => { calls.length = 0 })

function deps(over = {}) {
  let micDone
  const mic = new Promise(r => { micDone = () => r('granted') })
  const warm = {
    begin: vi.fn(() => calls.push('warm.begin')), markSelf: vi.fn(), settle: vi.fn(() => { calls.push('warm.settle'); return Promise.resolve({ interrupts: 1, waitedMs: 300, ctx: 'running' }) }),
    onRewarm: vi.fn(), rewarmOnGesture: vi.fn(),
  }
  return {
    micDone, warm, session: { begin: vi.fn() }, hold: { parkNow: vi.fn(() => calls.push('hold.parkNow')) },
    openMic: vi.fn(() => { calls.push('openMic'); return mic }), unlockCtx: vi.fn(), wake: vi.fn(() => { calls.push('wake'); return Promise.resolve(true) }), rewake: vi.fn(),
    gate: vi.fn(() => { calls.push('gate'); return Promise.resolve({ by: 'first', ok: 2, total: 9, firstN: 2, ms: 3, missing: [] }) }),
    ensureCtx: vi.fn(() => { calls.push('ensureCtx'); return Promise.resolve({ state: 'running', recreated: false, ms: 5 }) }),
    trace: { begin: vi.fn(), mark: vi.fn((n, d) => calls.push(`mark:${n}${d?.early ? '(early)' : ''}`)), setNeedsTap: vi.fn(), sinceTap: () => 120 },
    install: vi.fn(), consume: () => null, recreateCtx: vi.fn(), prefetch: vi.fn(),
    ...over,
  }
}
const tick = () => new Promise(r => setTimeout(r, 10))

describe('быстрый старт гонки: реплика не ждёт микрофон', () => {
  it('микрофон ещё открывается (промис не завершён), а звук реплик уже готов: ctx → wake → ворота → ready(early) → onLineReady', async () => {
    const d = deps(), onLineReady = vi.fn()
    const p = startGameAudio({ cfg: race, audioSrc: null, lines: null, onLineReady }, d)
    await tick()
    expect(calls).toContain('openMic'); expect(calls).not.toContain('hold.parkNow'); expect(calls).not.toContain('warm.settle') // микрофон не завершился
    expect(calls.filter(c => ['ensureCtx', 'wake', 'gate', 'mark:ready(early)'].includes(c))).toEqual(['ensureCtx', 'wake', 'gate', 'mark:ready(early)'])
    expect(onLineReady).toHaveBeenCalledTimes(1)
    expect(d.ensureCtx).toHaveBeenCalledWith({ why: 'быстрый старт гонки', waitMs: FAST_CTX_WAIT_MS, recreate: false })
    expect(FAST_CTX_WAIT_MS).toBeLessThanOrEqual(300)
    d.micDone()
    const r = await p
    expect(r).toMatchObject({ mic: 'granted', needsTap: false })
    expect(d.gate).toHaveBeenCalledTimes(1) // ворота не ждут второй раз
    expect(d.wake).toHaveBeenCalledTimes(2) // после смены сессии звук будится ещё раз (слоты <audio>, прерывание)
    expect(calls.indexOf('warm.settle')).toBeGreaterThan(calls.indexOf('mark:ready(early)'))
  })
  it('микрофон отказан — быстрый путь уже отработал, итог mic: denied; onLineReady вызван один раз', async () => {
    const d = deps({ openMic: vi.fn(() => Promise.resolve('denied')) }), onLineReady = vi.fn()
    await expect(startGameAudio({ cfg: race, audioSrc: null, lines: null, onLineReady }, d)).resolves.toMatchObject({ mic: 'denied' })
    expect(onLineReady).toHaveBeenCalledTimes(1)
  })
  it('сбой быстрого пути не роняет старт: обычный порядок продолжается', async () => {
    const d = deps({ ensureCtx: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ state: 'running', recreated: false, ms: 1 }) })
    const p = startGameAudio({ cfg: race, audioSrc: null, lines: null }, d); d.micDone()
    await expect(p).resolves.toMatchObject({ mic: 'granted' })
  })
  it('обычная игра (не гонка): прежний порядок, без раннего ready и onLineReady', async () => {
    const d = deps({ openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('granted') }) }), onLineReady = vi.fn()
    await startGameAudio({ cfg: plain, audioSrc: null, lines: null, onLineReady }, d)
    expect(calls.some(c => c.includes('(early)'))).toBe(false); expect(onLineReady).not.toHaveBeenCalled()
    expect(calls.filter(c => ['hold.parkNow', 'warm.settle', 'ensureCtx', 'wake', 'gate'].includes(c))).toEqual(['hold.parkNow', 'warm.settle', 'ensureCtx', 'wake', 'gate'])
  })
  it('источник: контекст открывается заранее в жесте «Начать» (прогрев гонки), ensureGameCtxRunning умеет recreate: false (не оборвать идущую реплику)', async () => {
    const { readFileSync } = await import('node:fs')
    const warm = readFileSync(new URL('../../../pitrace/raceWarm.js', import.meta.url), 'utf8')
    expect(warm).toContain('unlock = unlockGameCtx'); expect(readFileSync(new URL('../../../pitrace/useRaceLaunch.js', import.meta.url), 'utf8')).toContain('prewarm: () => raceWarm.start({ cfg, lines })')
    const { ensureGameCtxRunning } = await import('../../../../shared/lib/gameAudioCtx.js')
    const r = await ensureGameCtxRunning({ why: 'тест', recreate: false, waitMs: 5 })
    expect(r.recreated).toBe(false); expect(gameCtxState()).toBeNull() // Web Audio в тесте нет — ничего не создано
  })
})
