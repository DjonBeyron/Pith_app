import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Игровой AudioContext открывается в жесте: синхронная часть тапа «Начать» (startGameAudio), повторный прогрев после прерывания (rewakeGameAudio, в жесте или на ближайшем касании), «Продолжить»
vi.mock('./wordLaneVoice.js', () => ({ prepareTrack: vi.fn(), rewakeTrack: vi.fn() }))
vi.mock('./wordLaneNotes.js', () => ({ unlockNotes: vi.fn(), releaseNotes: vi.fn() }))
vi.mock('./wordLanePlateSound.js', () => ({ unlockPlate: vi.fn() }))
vi.mock('./wordLaneClips.js', () => ({ prepareWords: vi.fn(() => Promise.resolve(true)), prepareClips: vi.fn(), rewakeClips: vi.fn() }))
vi.mock('./wordLaneAudio.js', () => ({ playSpan: s => s, clipsFor: () => null }))
vi.mock('../../word-audio/wordAudioPlayer.js', () => ({ rewarmWordElements: vi.fn() }))
vi.mock('../../../../shared/lib/primedAudio.js', () => ({ primeAudio: vi.fn() }))
vi.mock('../../../../shared/lib/sounds.js', () => ({ preloadSounds: vi.fn(), unlockAudio: vi.fn(), onAudioInterrupted: () => () => {}, soundCtxState: () => null }))

const { startGameAudio, wakeGameAudio, rewakeGameAudio } = await import('./wordLaneStart.js')
const { makeFakeWebAudio } = await import('../../../../shared/lib/fakeWebAudio.js')
const { getGameCtx, closeGameCtx } = await import('../../../../shared/lib/gameAudioCtx.js')

let fake
const cfg = { chunks: ['learn'], confusers: [], hasAudio: false }
beforeEach(() => { fake = makeFakeWebAudio({ state: 'suspended' }); vi.stubGlobal('AudioContext', fake.Ctx) })
afterEach(() => { closeGameCtx(); vi.unstubAllGlobals() })

describe('resume игрового контекста в жесте', () => {
  it('тап «Начать»: контекст создан и resume() вызван в СИНХРОННОЙ части startGameAudio (до первого await), сразу после getUserMedia', () => {
    const order = []
    const deps = {
      warm: { begin() {}, markSelf() {}, settle: () => Promise.resolve({ interrupts: 0, waitedMs: 1 }), onRewarm() {}, rewarmOnGesture() {} },
      session: { begin() { order.push('session') } }, hold: { parkNow() {} },
      openMic: () => { order.push('mic'); return Promise.resolve('granted') },
      wake: () => Promise.resolve(true), prefetch: () => Promise.resolve(), trace: { begin() {}, mark() {}, setNeedsTap() {}, sinceTap: () => 0 },
      gate: () => Promise.resolve({ by: 'all', ok: 0, total: 0, firstN: 0, ms: 0, missing: [] }),
    }
    const p = startGameAudio({ cfg, audioSrc: null, lines: null }, deps)
    expect(order).toEqual(['session', 'mic'])
    expect(fake.ctxs).toHaveLength(1)
    expect(fake.ctxs[0].resumes).toBe(1)
    return p
  })

  it('после settle контекст открывается ещё раз (wakeGameAudio): прерванный после смены сессии — resume()', () => {
    const c = getGameCtx(); c.setState('interrupted')
    wakeGameAudio({ cfg, audioSrc: null, lines: null })
    expect(c.resumes).toBe(1)
  })

  it('повторный прогрев после прерывания (rewakeGameAudio — в жесте или на ближайшем касании): resume() прерванного контекста, буферы не пересоздаются', async () => {
    const c = getGameCtx(); c.setState('interrupted')
    rewakeGameAudio({ audioSrc: null })
    expect(c.resumes).toBe(1)
    await Promise.resolve(); await Promise.resolve()
    expect(c.state).toBe('running')
    expect(fake.ctxs).toHaveLength(1) // тот же контекст
  })

  it('«Продолжить» после паузы: startGameAudio снова открывает (resume) уже существующий контекст', () => {
    const c = getGameCtx(); c.setState('suspended')
    startGameAudio({ cfg, audioSrc: null, lines: null }, {
      warm: { begin() {}, markSelf() {}, settle: () => Promise.resolve({}), onRewarm() {}, rewarmOnGesture() {} }, session: { begin() {} }, hold: { parkNow() {} },
      openMic: () => Promise.resolve('granted'), wake: () => Promise.resolve(true), prefetch: () => Promise.resolve(), trace: { begin() {}, mark() {}, setNeedsTap() {}, sinceTap: () => 0 }, gate: () => Promise.resolve({ by: 'all', missing: [] }),
    })
    expect(c.resumes).toBe(1)
    expect(fake.ctxs).toHaveLength(1)
  })
})
