import { describe, it, expect, vi, beforeEach } from 'vitest'

// Разложение старта игры (wordLaneStart.js): что готовится к старту, что докачивается фоном, и что скачивание начинается в самом тапе — параллельно микрофону и ожиданию аудиосессии
const calls = vi.hoisted(() => [])
const rec = name => vi.fn((...a) => { calls.push(name); return a })
vi.mock('./wordLaneVoice.js', () => ({ prepareTrack: rec('prepareTrack'), rewakeTrack: rec('rewakeTrack') }))
vi.mock('./wordLaneNotes.js', () => ({ unlockNotes: rec('unlockNotes'), releaseNotes: rec('releaseNotes') }))
vi.mock('./wordLaneClips.js', () => ({ prepareWords: vi.fn(items => { calls.push(`prepareWords:${items.length}`); return Promise.resolve(true) }), prepareClips: rec('prepareClips'), rewakeClips: rec('rewakeClips') }))
vi.mock('./wordLaneAudio.js', () => ({ playSpan: s => s, clipsFor: () => ({ start: 0, end: 1 }) }))
vi.mock('./wordLaneLib.js', () => ({ libItems: texts => texts.map(t => ({ key: t, url: `https://r2/${t}.mp3` })) }))
vi.mock('../../word-audio/wordAudioPlayer.js', () => ({ rewarmWordElements: rec('rewarmWords') }))
vi.mock('../../../../shared/lib/primedAudio.js', () => ({ primeAudio: rec('primeAudio') }))
vi.mock('../../../../shared/lib/sounds.js', () => ({ preloadSounds: rec('preloadSounds'), unlockAudio: rec('unlockAudio'), onAudioInterrupted: () => () => {}, soundCtxState: () => null }))

const { startGameAudio, wakeGameAudio, wordsPlan } = await import('./wordLaneStart.js')
const { prepareWords } = await import('./wordLaneClips.js')

const lines = Object.fromEntries(['rh_start', 'rh_read_why', 'your_turn', 'well_done', 'rh_done'].map(id => [id, { text: id, url: `https://r2/${id}.mp3`, duration: 2, words: null }]))
const cfg = { chunks: ["I'm", 'trying', 'to learn'], confusers: [[], [], []], extraWords: ['learn'], hasAudio: false, clips: null }
beforeEach(() => { calls.length = 0; vi.clearAllMocks() })

describe('wordsPlan: что готовить к старту, что фоном', () => {
  it('обычная игра (нет cfg.firstLines): все реплики нужны к старту, фона нет — как раньше', () => {
    const p = wordsPlan({ cfg, lines })
    expect(p.late).toEqual([])
    expect(p.now.map(x => x.key)).toEqual(expect.arrayContaining(["I'm", 'trying', 'to learn', 'learn', 'line:rh_start', 'line:your_turn', 'line:well_done']))
    expect(p.now).toHaveLength(4 + 5)
  })
  it('репетиция: слова и реплики первых стадий — к старту, остальные реплики — фоном', () => {
    const p = wordsPlan({ cfg: { ...cfg, firstLines: ['rh_start', 'rh_read_why'] }, lines })
    expect(p.now.map(x => x.key)).toEqual(['line:rh_start', 'line:rh_read_why', "I'm", 'trying', 'to learn', 'learn']) // реплики первых стадий — ПЕРВЫМИ: заговорит Пит, куски диктора понадобятся позже
    expect(p.late.map(x => x.key).sort()).toEqual(['line:rh_done', 'line:well_done', 'line:your_turn'])
  })
  it('реплика без озвучки (нет url) не готовится вовсе', () => {
    const p = wordsPlan({ cfg: { ...cfg, firstLines: ['rh_start'] }, lines: { ...lines, rh_start: { text: 'x', url: null } } })
    expect(p.now.map(x => x.key)).not.toContain('line:rh_start')
  })
})

describe('wakeGameAudio: нужное к старту ждём, фон — после него', () => {
  it('prepareWords вызывается дважды: сначала нужное, потом фоновые реплики с after = «нужное готово»', () => {
    const ready = wakeGameAudio({ cfg: { ...cfg, firstLines: ['rh_start'] }, audioSrc: null, lines })
    expect(calls.filter(c => c.startsWith('prepareWords'))).toEqual(['prepareWords:5', 'prepareWords:4'])
    const [, lateOpts] = [prepareWords.mock.calls[1][0], prepareWords.mock.calls[1][1]]
    expect(lateOpts.after).toBeInstanceOf(Promise)
    return ready
  })
  it('нечего откладывать — один вызов', () => {
    wakeGameAudio({ cfg, audioSrc: null, lines })
    expect(prepareWords).toHaveBeenCalledTimes(1)
  })
  it('игра стартует, не дожидаясь фоновых реплик: итог wakeGameAudio — только нужное', async () => {
    let lateDone = false
    prepareWords.mockImplementationOnce(() => Promise.resolve(true)).mockImplementationOnce(() => new Promise(r => setTimeout(() => { lateDone = true; r(true) }, 50)))
    expect(await wakeGameAudio({ cfg: { ...cfg, firstLines: ['rh_start'] }, audioSrc: null, lines })).toBe(true)
    expect(lateDone).toBe(false)
  })
})

describe('startGameAudio: скачивание начинается в тапе', () => {
  const deps = (over = {}) => ({
    warm: { begin: vi.fn(), markSelf: vi.fn(), settle: vi.fn(() => { calls.push('settle'); return Promise.resolve({ interrupts: 0, waitedMs: 300 }) }), onRewarm: vi.fn(), rewarmOnGesture: vi.fn() },
    session: { begin: vi.fn() },
    hold: { parkNow: vi.fn() },
    openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('granted') }),
    wake: vi.fn(() => { calls.push('wake'); return Promise.resolve(true) }),
    rewake: vi.fn(),
    prefetch: vi.fn(items => { calls.push(`prefetch:${items.length}`); return Promise.resolve() }),
    gate: vi.fn(() => Promise.resolve({ by: 'all', ok: 0, total: 0, firstN: 0, ms: 0, missing: [] })),
    ...over,
  })
  it('синхронно в тапе: микрофон, сразу за ним prefetch ВСЕГО набора (нужное — первым) — раньше settle и пробуждения слотов', async () => {
    const d = deps()
    const p = startGameAudio({ cfg: { ...cfg, firstLines: ['rh_start'] }, audioSrc: null, lines }, d)
    expect(calls).toEqual(['openMic', 'prefetch:9'])
    await p
    expect(calls.indexOf('prefetch:9')).toBeLessThan(calls.indexOf('settle'))
    expect(calls.indexOf('prefetch:9')).toBeLessThan(calls.indexOf('wake'))
  })
  it('весь набор качается одним списком, нужное к старту стоит в нём первым (реплики первых стадий, затем куски)', async () => {
    const d = deps()
    await startGameAudio({ cfg: { ...cfg, firstLines: ['rh_start'] }, audioSrc: null, lines }, d)
    expect(d.prefetch).toHaveBeenCalledTimes(1)
    const keys = d.prefetch.mock.calls[0][0].map(x => x.key)
    expect(keys.slice(0, 2)).toEqual(['line:rh_start', "I'm"])
    expect(keys).toHaveLength(9)
  })
  it('ворота получают весь набор и firstCount (реплики первых стадий + кусок первой ступени)', async () => {
    const d = deps()
    await startGameAudio({ cfg: { ...cfg, firstLines: ['rh_start', 'rh_read_why'] }, audioSrc: null, lines }, d)
    expect(d.gate.mock.calls[0][0]).toMatchObject({ firstCount: 3 })
    expect(d.gate.mock.calls[0][0].items).toHaveLength(9)
  })
  it('старт не ждёт скачивания: settle и пробуждение идут, даже если prefetch ещё качает', async () => {
    const d = deps({ prefetch: vi.fn(() => new Promise(() => {})) }) // скачивание ещё идёт, а ворота (отдельно) решили открыться
    const r = await startGameAudio({ cfg, audioSrc: null, lines }, d)
    expect(r.mic).toBe('granted')
    expect(d.wake).toHaveBeenCalledTimes(1)
  })
})

describe('startGameAudio: настоящие ворота (wordLaneGate.js)', () => {
  it('тап ждёт первые N файлов (реплики первых стадий + кусок первой ступени, минимум 5), остальные докачиваются фоном; отметка ready — gate: first', async () => {
    const { settle, clearSettled } = await import('./wordLaneSettled.js')
    clearSettled()
    const marks = []
    const prefetch = vi.fn(items => { items.slice(0, 5).forEach(i => settle(i.url, 'ok')); return Promise.resolve() }) // готовы первые пять, хвост ещё качается
    const d = {
      warm: { begin: vi.fn(), markSelf: vi.fn(), settle: vi.fn(() => Promise.resolve({ interrupts: 0, waitedMs: 1 })), onRewarm: vi.fn(), rewarmOnGesture: vi.fn() }, session: { begin: vi.fn() }, hold: { parkNow: vi.fn() },
      openMic: vi.fn(() => Promise.resolve('granted')), wake: vi.fn(() => Promise.resolve(true)), rewake: vi.fn(), prefetch, unlockCtx: vi.fn(),
      trace: { begin: vi.fn(), mark: (n, data) => marks.push([n, data]), setNeedsTap: vi.fn(), sinceTap: () => 0 },
    }
    await startGameAudio({ cfg: { ...cfg, firstLines: ['rh_start', 'rh_read_why'] }, audioSrc: null, lines }, d)
    const ready = marks.find(m => m[0] === 'ready')[1]
    expect(ready).toMatchObject({ words: 'ready', gate: 'first', done: 5, total: 9, firstN: 5 })
    clearSettled()
  })
})
