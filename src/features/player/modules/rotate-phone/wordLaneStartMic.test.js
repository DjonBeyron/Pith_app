import { describe, it, expect, vi, beforeEach } from 'vitest'

// «Встряхни память»: микрофон ДО входа в игру и «Тапаю» без микрофона (CONCEPT_RACE.md, «Попап внутри игры»). startGameAudio с mic: false (по умолчанию — режим тапа у гонки) не ставит тип сессии записи и не зовёт
// getUserMedia (ответ mic: 'off'); onMic сообщает ответ системы (попап «Разрешите микрофон…» → «Готовлю звук…»); «Гонка» с запущенным контекстом не требует «Тапни, чтобы начать», даже если жест истёк (диалог доступа).
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

const { startGameAudio, wantsMic, micOk, MIC_OFF } = await import('./wordLaneStart.js')
const { gameMicWanted } = await import('../../../../shared/lib/gameMicWant.js')
const { TAP_KEY } = await import('./wordLaneHudSettings.js')

const race = { chunks: ['learn'], confusers: [], hasAudio: false, plan: { game: 'race' } }
const plain = { chunks: ['learn'], confusers: [], hasAudio: false }
beforeEach(() => { calls.length = 0; localStorage.removeItem(TAP_KEY) })

function deps({ mic = 'granted', activation = true, ...over } = {}) {
  const warm = { begin: vi.fn(), markSelf: vi.fn(), settle: vi.fn(() => Promise.resolve({ interrupts: 0, waitedMs: 250, ctx: 'running', activation })), onRewarm: vi.fn(), rewarmOnGesture: vi.fn() }
  return {
    warm, session: { begin: vi.fn(() => calls.push('session.begin')) }, hold: { parkNow: vi.fn(() => calls.push('hold.parkNow')) },
    openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve(mic) }), unlockCtx: vi.fn(() => calls.push('unlockCtx')), wake: vi.fn(() => Promise.resolve(true)), rewake: vi.fn(),
    gate: vi.fn(() => Promise.resolve({ by: 'first', ok: 1, total: 1, firstN: 1, ms: 1, missing: [] })), ensureCtx: vi.fn(() => Promise.resolve({ state: 'running', recreated: false, ms: 1 })),
    trace: { begin: vi.fn(), mark: vi.fn(), setNeedsTap: vi.fn(), sinceTap: () => 100 }, install: vi.fn(), consume: () => null, recreateCtx: vi.fn(), prefetch: vi.fn(),
    ...over,
  }
}

describe('«Тапаю»: микрофон не запрашивается вообще', () => {
  it('mic: false — ни типа сессии записи, ни openMic (getUserMedia), ни parkNow; ответ mic: off — играть можно', async () => {
    const d = deps(), onMic = vi.fn()
    const r = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: false, onMic }, d)
    expect(d.openMic).not.toHaveBeenCalled(); expect(d.session.begin).not.toHaveBeenCalled(); expect(d.hold.parkNow).not.toHaveBeenCalled()
    expect(calls).toContain('unlockCtx') // звук (AudioContext) по-прежнему открывается в жесте
    expect(r.mic).toBe(MIC_OFF); expect(micOk(r.mic)).toBe(true); expect(micOk('denied')).toBe(false); expect(onMic).toHaveBeenCalledWith('off')
    expect(gameMicWanted()).toBe(false) // useGameAudioModes при монтировании игры тоже не поставит play-and-record
  })
  it('по умолчанию: гонка в режиме тапа (pithy_wl_tap_v1) — без микрофона; гонка голосом и обычная игра — с микрофоном', async () => {
    localStorage.setItem(TAP_KEY, '1')
    expect(wantsMic(race)).toBe(false); expect(wantsMic(plain)).toBe(true)
    const d = deps(); await startGameAudio({ cfg: race, audioSrc: null, lines: null }, d); expect(d.openMic).not.toHaveBeenCalled() // «Продолжить» после паузы и «Игра заново» — тоже без микрофона
    localStorage.removeItem(TAP_KEY)
    expect(wantsMic(race)).toBe(true)
    const v = deps(); await startGameAudio({ cfg: race, audioSrc: null, lines: null }, v); expect(v.openMic).toHaveBeenCalledTimes(1); expect(gameMicWanted()).toBe(true)
  })
})

describe('«Говорю»: микрофон в жесте, ответ системы до входа в игру', () => {
  it('тип сессии → getUserMedia синхронно в жесте; onMic получает ответ системы', async () => {
    const d = deps(), onMic = vi.fn()
    const p = startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true, onMic }, d)
    expect(calls.slice(0, 2)).toEqual(['session.begin', 'openMic']) // до первого await
    const r = await p
    expect(onMic).toHaveBeenCalledWith('granted'); expect(r.mic).toBe('granted')
    const no = deps({ mic: 'denied' }), onNo = vi.fn(); const rn = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true, onMic: onNo }, no)
    expect(onNo).toHaveBeenCalledWith('denied'); expect(rn.mic).toBe('denied'); expect(micOk(rn.mic)).toBe(false)
  })
  it('жест истёк (диалог доступа), но контекст гонки запущен — «Тапни, чтобы начать» не нужен; обычной игре — нужен', async () => {
    const run = () => 'running', stuck = () => 'interrupted'
    const d = deps({ activation: false, ctxState: run })
    const r = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true }, d)
    expect(r.needsTap).toBe(false); expect(d.trace.setNeedsTap).not.toHaveBeenCalled(); expect(d.warm.rewarmOnGesture).toHaveBeenCalledTimes(1) // запасной прогрев на касании всё равно взведён
    const p = await startGameAudio({ cfg: plain, audioSrc: null, lines: null }, deps({ activation: false, ctxState: run }))
    expect(p.needsTap).toBe(true)
    const s = await startGameAudio({ cfg: race, audioSrc: null, lines: null, mic: true }, deps({ activation: false, ctxState: stuck }))
    expect(s.needsTap).toBe(true) // контекст не запущен — без касания звук не поднять
  })
})
