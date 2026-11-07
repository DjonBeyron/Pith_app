import { describe, it, expect, vi, beforeEach } from 'vitest'

// Старт игры после фона (wordLaneStart.startGameAudio): полное обновление аудиосессии (gameAudioRenew.js) ДО типа сессии и микрофона, когда renewNeed даёт причину; иначе — прежний путь
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

const { startGameAudio } = await import('./wordLaneStart.js')
const cfg = { chunks: ['learn'], confusers: [], hasAudio: false, clips: [] }
beforeEach(() => { calls.length = 0 })

function deps(over = {}) {
  return {
    warm: { begin: () => calls.push('warm.begin'), markSelf: () => {}, settle: () => Promise.resolve({ interrupts: 0, waitedMs: 0, ctx: 'running' }), onRewarm: () => {}, rewarmOnGesture: () => {} },
    session: { begin: vi.fn(() => calls.push('session.begin')) },
    hold: { parkNow: () => {} }, trace: { begin: () => {}, mark: () => {}, setNeedsTap: () => {} }, install: () => calls.push('install'),
    openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('granted') }),
    unlockCtx: () => calls.push('unlockCtx'), wake: () => { calls.push('wake'); return Promise.resolve(true) }, rewake: () => {}, prefetch: () => {},
    gate: () => Promise.resolve({ by: 'all', ok: 0, total: 0, firstN: 0, ms: 0 }), ensureCtx: () => Promise.resolve({ state: 'running', recreated: false, ms: 0 }),
    consume: () => 'focus после 556 с в фоне', recreateCtx: vi.fn(() => calls.push('recreateCtx')),
    renew: vi.fn(async ({ applyType }) => { calls.push('renew'); applyType?.(); calls.push('renew:done'); return { ok: true, state: 'running' } }),
    armCheck: vi.fn(() => calls.push('armCheck')),
    ...over,
  }
}

describe('startGameAudio: обновление аудиосессии после фона', () => {
  it('причина есть (фон 556 с): renew (тип голоса внутри, после закрытия) → проверка вывода → тип сессии ещё раз → микрофон → контекст; recreateCtx не нужен', async () => {
    const d = deps({ needRenew: vi.fn(() => 'фон 556 с') })
    const p = startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(calls).toEqual(['install', 'renew', 'session.begin', 'renew:done']) // старт ждёт renew: микрофон и контекст — только после
    await p
    expect(calls.slice(0, 8)).toEqual(['install', 'renew', 'session.begin', 'renew:done', 'armCheck', 'warm.begin', 'session.begin', 'openMic'])
    expect(d.needRenew).toHaveBeenCalledWith({ suspect: 'focus после 556 с в фоне' })
    expect(d.renew).toHaveBeenCalledWith(expect.objectContaining({ reason: 'фон 556 с', wantType: null, applyType: expect.any(Function) }))
    expect(d.recreateCtx).not.toHaveBeenCalled()
  })
  it('пальцами (mic: false): renew с типом auto, без записи типа голоса', async () => {
    const d = deps({ needRenew: () => 'живы контексты старше ухода в фон: sounds' })
    await startGameAudio({ cfg, audioSrc: null, lines: null, mic: false }, d)
    expect(d.renew).toHaveBeenCalledWith(expect.objectContaining({ wantType: 'auto', applyType: null }))
    expect(d.session.begin).not.toHaveBeenCalled(); expect(d.openMic).not.toHaveBeenCalled()
  })
  it('повтор при «звук не пошёл» — renew с той же причиной и типом', async () => {
    const d = deps({ needRenew: () => 'фон 30 с' })
    await startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    await d.armCheck.mock.calls[0][0].renew()
    expect(d.renew).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'звук не пошёл: фон 30 с', applyType: expect.any(Function) }))
  })
  it('причины нет, но пометка «после фона» есть: прежний путь — свежий игровой контекст синхронно в тапе, без renew', () => {
    const d = deps({ needRenew: () => null })
    startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(calls.slice(0, 5)).toEqual(['install', 'recreateCtx', 'warm.begin', 'session.begin', 'openMic'])
    expect(d.renew).not.toHaveBeenCalled(); expect(d.armCheck).not.toHaveBeenCalled()
  })
  it('renewed («Продолжить» уже обновил сессию): ни renew, ни recreateCtx; причина не спрашивается', () => {
    const d = deps({ needRenew: vi.fn(() => 'фон 556 с'), renewed: true })
    startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(d.needRenew).not.toHaveBeenCalled(); expect(d.renew).not.toHaveBeenCalled(); expect(d.recreateCtx).not.toHaveBeenCalled()
    expect(calls.slice(0, 3)).toEqual(['install', 'warm.begin', 'session.begin'])
  })
  it('renew упал — старт всё равно идёт', async () => {
    const d = deps({ needRenew: () => 'x', renew: vi.fn(() => Promise.reject(new Error('boom'))) })
    await expect(startGameAudio({ cfg, audioSrc: null, lines: null }, d)).resolves.toMatchObject({ mic: 'granted' })
  })
})
