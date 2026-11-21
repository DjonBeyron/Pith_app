import { describe, it, expect, vi, beforeEach } from 'vitest'

// Хроника режима запуска «[start-mode]» в startGameAudio (v3.3.336): снимки стоят РЯДОМ с шагами старта и не меняют их порядок — session.begin → openMic → unlockCtx по-прежнему синхронно в тапе, до первого await;
// снимок — синхронный вызов, старт его не ждёт. «Тапаю» (без микрофона) — только тап и ответ «off».
const calls = vi.hoisted(() => { const m = new Map(); globalThis.localStorage ??= { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; return [] })
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

const { startGameAudio } = await import('./wordLaneStart.js')
const { TAP_KEY } = await import('./wordLaneHudSettings.js')

const race = { chunks: ['learn'], confusers: [], hasAudio: false, plan: { game: 'race' } }
beforeEach(() => { calls.length = 0; localStorage.removeItem(TAP_KEY) })

function deps(over = {}) {
  const warm = { begin: vi.fn(), markSelf: vi.fn(), settle: vi.fn(() => { calls.push('settle'); return Promise.resolve({ interrupts: 0, waitedMs: 250, ctx: 'running', activation: true }) }), onRewarm: vi.fn(), rewarmOnGesture: vi.fn() }
  const modeLog = { begin: vi.fn(() => calls.push('log:тап')), mark: vi.fn(l => calls.push(`log:${l}`)), afterMic: vi.fn(m => calls.push(`log:afterMic ${m}`)), micAnswer: vi.fn(), cancel: vi.fn() }
  return {
    warm, modeLog, session: { begin: vi.fn(() => calls.push('session.begin')) }, hold: { parkNow: vi.fn(() => calls.push('hold.parkNow')) },
    openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('granted') }), unlockCtx: vi.fn(() => calls.push('unlockCtx')), wake: vi.fn(() => Promise.resolve(true)), rewake: vi.fn(),
    gate: vi.fn(() => Promise.resolve({ by: 'first', ok: 1, total: 1, firstN: 1, ms: 1, missing: [] })), ensureCtx: vi.fn(() => Promise.resolve({ state: 'running', recreated: false, ms: 1 })),
    trace: { begin: vi.fn(), mark: vi.fn(), setNeedsTap: vi.fn(), sinceTap: () => 100 }, install: vi.fn(), consume: () => null, recreateCtx: vi.fn(), prefetch: vi.fn(), chron: { step: vi.fn() },
    ...over,
  }
}

describe('хроника режима запуска в startGameAudio', () => {
  it('«Гонка» голосом: снимки рядом с шагами, порядок шагов прежний; синхронная часть тапа — до первого await', async () => {
    const d = deps(), onLineReady = vi.fn(() => calls.push('onLineReady'))
    const p = startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true, onLineReady }, d)
    expect(calls).toEqual(['log:тап', 'session.begin', 'log:после begin (тип поставлен)', 'openMic', 'log:getUserMedia вызван', 'unlockCtx']) // всё это — синхронно в жесте
    await p
    const steps = calls.filter(c => !c.startsWith('log:'))
    expect(steps.slice(0, 3)).toEqual(['session.begin', 'openMic', 'unlockCtx']); expect(steps.indexOf('hold.parkNow')).toBeLessThan(steps.indexOf('settle'))
    const at = s => { const i = calls.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
    expect(at('log:afterMic granted')).toBeLessThan(at('hold.parkNow')) // сразу после ответа микрофона
    expect(at('settle')).toBeLessThan(at('log:сессия улеглась (settle): 250 мс, прерываний 0'))
    expect(at('log:первая реплика разрешена (onLineReady)') + 1).toBe(at('onLineReady'))
    expect(d.modeLog.begin).toHaveBeenCalledTimes(1); expect(d.modeLog.afterMic).toHaveBeenCalledTimes(1)
  })
  it('«Тапаю»: тип сессии не ставится, микрофон не открывается — в хронике только тап, ответ «off» и settle', async () => {
    const d = deps()
    await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: false }, d)
    expect(d.session.begin).not.toHaveBeenCalled(); expect(d.openMic).not.toHaveBeenCalled()
    expect(calls.filter(c => c.startsWith('log:') && !c.includes('onLineReady'))).toEqual(['log:тап', 'log:afterMic off', 'log:сессия улеглась (settle): 250 мс, прерываний 0'])
  })
  it('без подмены работает настоящая хроника: старт проходит, результат прежний', async () => {
    const { gameStartModeLog } = await import('../../../../shared/lib/gameStartModeLog.js')
    const d = deps({ modeLog: undefined })
    const r = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true }, d)
    expect(r.mic).toBe('granted'); expect(gameStartModeLog.last()).toMatchObject({ mic: 'granted' }); expect(gameStartModeLog.pending()).toBeGreaterThan(0)
    expect(gameStartModeLog.cancel('тест')).toBeGreaterThan(0)
  })
})
