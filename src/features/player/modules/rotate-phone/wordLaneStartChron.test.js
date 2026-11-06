import { describe, it, expect, vi } from 'vitest'

// Старт «Гонки» в хронологии «[start]» (raceStartChron.js): getUserMedia вызван / ответил, ворота звука, «Готовлю звук» (начало, почему ждём, сколько ждали). «Готовлю звук» у гонки короче (RACE_SETTLE_QUIET_MS):
// реплики — буферы Web Audio, им нужен только запущенный контекст, а прерванный контекст settle ждёт и так. Обычная игра — прежнее ожидание и без хронологии.
vi.mock('./wordLaneVoice.js', () => ({ prepareTrack: vi.fn(), rewakeTrack: vi.fn() }))
vi.mock('./wordLaneNotes.js', () => ({ unlockNotes: vi.fn(), releaseNotes: vi.fn() }))
vi.mock('./wordLaneClips.js', () => ({ prepareWords: vi.fn(() => Promise.resolve(true)), prepareClips: vi.fn(), rewakeClips: vi.fn() }))
vi.mock('./wordLaneAudio.js', () => ({ playSpan: s => s, clipsFor: () => ({ start: 0, end: 1 }) }))
vi.mock('./wordLaneLib.js', () => ({ libItems: () => [] }))
vi.mock('./wordLaneCatLines.js', () => ({ linesItems: () => [], lineKey: id => `line:${id}` }))
vi.mock('../../word-audio/wordAudioPlayer.js', () => ({ rewarmWordElements: vi.fn() }))
vi.mock('../../../../shared/lib/primedAudio.js', () => ({ primeAudio: vi.fn() }))
vi.mock('../../../../shared/lib/sounds.js', () => ({ preloadSounds: vi.fn(), unlockAudio: vi.fn(), onAudioInterrupted: () => () => {}, soundCtxState: () => null }))

const { startGameAudio } = await import('./wordLaneStart.js')
const { RACE_SETTLE_QUIET_MS } = await import('../../../pitrace/raceStartTrace.js')

const race = { chunks: ['learn'], confusers: [], hasAudio: false, plan: { game: 'race' } }
const plain = { chunks: ['learn'], confusers: [], hasAudio: false }

function deps(over = {}) {
  const steps = [], labels = {}
  return {
    steps,
    labels,
    chron: { step: (name, label) => { steps.push(name); labels[name] = label; return 0 } },
    warm: { begin: vi.fn(), markSelf: vi.fn(), settle: vi.fn(() => Promise.resolve({ interrupts: 0, waitedMs: 121, ctx: 'running', timedOut: false })), onRewarm: vi.fn(), rewarmOnGesture: vi.fn() },
    session: { begin: vi.fn() }, hold: { parkNow: vi.fn() }, openMic: vi.fn(() => Promise.resolve('granted')), unlockCtx: vi.fn(), wake: vi.fn(() => Promise.resolve(true)), rewake: vi.fn(),
    gate: vi.fn(() => Promise.resolve({ by: 'all', ok: 3, total: 3, firstN: 1, ms: 1 })), ensureCtx: vi.fn(() => Promise.resolve({ state: 'running', recreated: false, ms: 0 })),
    trace: { begin: vi.fn(), mark: vi.fn(), setNeedsTap: vi.fn(), sinceTap: () => 10 }, install: vi.fn(), consume: () => null, recreateCtx: vi.fn(), prefetch: vi.fn(), ctxState: () => 'running',
    ...over,
  }
}

describe('старт гонки в хронологии [start]', () => {
  it('«Говорю»: getUserMedia вызван → ворота → ответ → «Готовлю звук» (почему ждём) → улеглась (сколько ждали); тишина 120 мс', async () => {
    const d = deps()
    const r = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true }, d)
    expect(r.mic).toBe('granted')
    expect(d.steps.filter(s => s !== 'gate')).toEqual(['gum', 'mic', 'settle0', 'settle']); expect(d.steps).toContain('gate') // ворота идут параллельно микрофону
    expect(d.warm.settle).toHaveBeenCalledWith({ quietMs: RACE_SETTLE_QUIET_MS })
    expect(d.labels.settle0).toMatch(/«Готовлю звук»: жду, пока аудиосессия уляжется после смены на запись \(iOS может прервать AudioContext\): тишина 120 мс без прерываний, потолок \d+ мс/)
    expect(d.labels.settle).toBe('аудиосессия улеглась за 121 мс: прерываний 0, ctx=running')
    expect(d.labels.mic).toContain('granted — попап «Готовлю звук…»')
  })
  it('«Тапаю»: ни getUserMedia, ни «Готовлю звук» — только ворота звука', async () => {
    const d = deps()
    await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: false }, d)
    expect(d.steps).toEqual(['gate']); expect(d.openMic).not.toHaveBeenCalled()
  })
  it('обычная игра: хронологии нет, ожидание прежнее (по умолчанию gameAudioWarm)', async () => {
    const d = deps()
    await startGameAudio({ cfg: plain, audioSrc: null, lines: null, mic: true }, d)
    expect(d.steps).toEqual([]); expect(d.warm.settle).toHaveBeenCalledWith(undefined)
  })
})
