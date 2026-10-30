import { describe, it, expect, vi, beforeEach } from 'vitest'

// Звук тапа «Начать» (wordLaneStart.js): тип сессии → микрофон → ждём, пока iOS уляжется → будим звук; повторный прогрев после прерывания
const calls = vi.hoisted(() => [])
const rec = name => vi.fn((...a) => { calls.push(name); return a })
vi.mock('./wordLaneVoice.js', () => ({ unlockVoice: rec('unlockVoice'), prepareTrack: rec('prepareTrack'), rewakeTrack: rec('rewakeTrack') }))
vi.mock('./wordLaneNotes.js', () => ({ unlockNotes: rec('unlockNotes'), releaseNotes: rec('releaseNotes') }))
vi.mock('./wordLaneClips.js', () => ({ prepareWords: vi.fn(() => { calls.push('prepareWords'); return Promise.resolve(true) }), prepareClips: rec('prepareClips'), rewakeClips: rec('rewakeClips') }))
vi.mock('./wordLaneAudio.js', () => ({ playSpan: s => s, clipsFor: () => ({ start: 0, end: 1 }) }))
vi.mock('./wordLaneLib.js', () => ({ libItems: () => [] }))
vi.mock('./wordLaneCatLines.js', () => ({ linesItems: () => [], lineKey: id => `line:${id}` }))
vi.mock('../../word-audio/wordAudioPlayer.js', () => ({ rewarmWordElements: rec('rewarmWords') }))
vi.mock('../../../../shared/lib/primedAudio.js', () => ({ primeAudio: rec('primeAudio') }))
vi.mock('../../../../shared/lib/sounds.js', () => ({ preloadSounds: rec('preloadSounds'), unlockAudio: rec('unlockAudio'), onAudioInterrupted: () => () => {}, soundCtxState: () => null }))

const { startGameAudio, wakeGameAudio, rewakeGameAudio, WORDS_WAIT_MS } = await import('./wordLaneStart.js')

const cfg = { chunks: ['learn'], confusers: [], hasAudio: true, clips: [{ start: 0, end: 1 }] }
beforeEach(() => { calls.length = 0; vi.useRealTimers() })

function deps(over = {}) {
  const warm = {
    begin: vi.fn(() => calls.push('warm.begin')), markSelf: vi.fn(() => calls.push('warm.markSelf')),
    settle: vi.fn(() => { calls.push('warm.settle'); return Promise.resolve({ interrupts: 1, waitedMs: 300, ctx: 'running' }) }),
    onRewarm: vi.fn(fn => { calls.push('warm.onRewarm'); warm.fn = fn }),
    rewarmOnGesture: vi.fn(why => calls.push(`warm.rewarmOnGesture:${why.slice(0, 9)}`)),
  }
  return {
    warm,
    session: { begin: vi.fn(() => calls.push('session.begin')) },
    hold: { parkNow: vi.fn(() => calls.push('hold.parkNow')) },
    openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('granted') }),
    wake: vi.fn(() => { calls.push('wake'); return Promise.resolve(true) }),
    rewake: vi.fn(() => calls.push('rewake')),
    ...over,
  }
}

describe('startGameAudio: порядок в жесте', () => {
  it('синхронно (до первого await): отслеживание прерываний, тип сессии, getUserMedia; звук ещё не будится', () => {
    const d = deps()
    const p = startGameAudio({ cfg, audioSrc: 'a.mp3', lines: null }, d)
    expect(calls).toEqual(['warm.begin', 'session.begin', 'openMic'])
    expect(d.wake).not.toHaveBeenCalled()
    return p
  })

  it('дальше: микрофон открыт → (закрытие в режиме close) → «своё» окно → ждём, пока уляжется → будим звук → регистрируем повторный прогрев; итог { mic, settled }', async () => {
    const d = deps()
    const r = await startGameAudio({ cfg, audioSrc: 'a.mp3', lines: null }, d)
    expect(calls).toEqual(['warm.begin', 'session.begin', 'openMic', 'hold.parkNow', 'warm.markSelf', 'warm.settle', 'warm.onRewarm', 'wake'])
    expect(r).toMatchObject({ mic: 'granted', settled: { interrupts: 1, waitedMs: 300 } })
    expect(d.wake).toHaveBeenCalledWith({ cfg, audioSrc: 'a.mp3', lines: null })
  })

  it('жест истёк, пока открывался микрофон (диалог доступа): звук всё равно будится, и повторный прогрев ждёт ближайшего касания', async () => {
    const d = deps()
    d.warm.settle = vi.fn(() => { calls.push('warm.settle'); return Promise.resolve({ interrupts: 0, activation: false }) })
    await startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(d.wake).toHaveBeenCalledTimes(1)
    expect(d.warm.rewarmOnGesture).toHaveBeenCalledTimes(1)
    const ok = deps()
    await startGameAudio({ cfg, audioSrc: null, lines: null }, ok)
    expect(ok.warm.rewarmOnGesture).not.toHaveBeenCalled() // жест жив (settle вернул activation: undefined) — лишнего прогрева нет
  })

  it('микрофон отказан — звук всё равно будится (игра пойдёт в ручном режиме)', async () => {
    const d = deps({ openMic: vi.fn(() => { calls.push('openMic'); return Promise.resolve('denied') }) })
    const r = await startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(r.mic).toBe('denied')
    expect(d.wake).toHaveBeenCalledTimes(1)
  })

  it('прерывание после старта: зарегистрированный прогрев зовёт rewake с записью автора', async () => {
    const d = deps()
    await startGameAudio({ cfg, audioSrc: 'a.mp3', lines: null }, d)
    d.warm.fn('прерывание')
    expect(d.rewake).toHaveBeenCalledWith({ audioSrc: 'a.mp3' })
  })

  it('озвучка кусков грузится дольше WORDS_WAIT_MS — игра не ждёт дольше; сбой пробуждения не роняет старт', async () => {
    vi.useFakeTimers()
    const d = deps({ wake: vi.fn(() => new Promise(() => {})) })
    let done = null
    startGameAudio({ cfg, audioSrc: null, lines: null }, d).then(r => { done = r })
    await vi.advanceTimersByTimeAsync(WORDS_WAIT_MS - 10)
    expect(done).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(done).toMatchObject({ mic: 'granted' })
    vi.useRealTimers()
    const bad = deps({ wake: vi.fn(() => { throw new Error('boom') }) })
    await expect(startGameAudio({ cfg, audioSrc: null, lines: null }, bad)).resolves.toMatchObject({ mic: 'granted' })
  })
})

describe('startGameAudio: хронология и «Тапни, чтобы начать»', () => {
  const marks = d => d.trace.mark.mock.calls.map(c => c[0])
  const withTrace = over => deps({ trace: { begin: vi.fn(() => calls.push('trace.begin')), mark: vi.fn(), setNeedsTap: vi.fn() }, ...over })

  it('хронология идёт от тапа: trace.begin — первым, дальше mic → settle → wake → ready; прогрев «готов» только после ожидания озвучки', async () => {
    const d = withTrace()
    const p = startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(calls[0]).toBe('trace.begin')
    const r = await p
    expect(marks(d)).toEqual(['mic', 'settle', 'wake', 'ready'])
    expect(d.trace.mark).toHaveBeenCalledWith('mic', { mic: 'granted' })
    expect(d.trace.mark).toHaveBeenCalledWith('ready', { words: 'ready' })
    expect(r.needsTap).toBe(false)
  })

  it('озвучка кусков не успела за WORDS_WAIT_MS — ready с words: timeout (игра не ждёт дольше), сбой пробуждения — wake ok: false', async () => {
    vi.useFakeTimers()
    const d = withTrace({ wake: vi.fn(() => new Promise(() => {})) })
    startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    await vi.advanceTimersByTimeAsync(WORDS_WAIT_MS + 20)
    expect(d.trace.mark).toHaveBeenCalledWith('ready', { words: 'timeout' })
    vi.useRealTimers()
    const bad = withTrace({ wake: vi.fn(() => { throw new Error('boom') }) })
    await startGameAudio({ cfg, audioSrc: null, lines: null }, bad)
    expect(bad.trace.mark).toHaveBeenCalledWith('wake', { ok: false, error: 'boom' })
  })

  it('жест истёк до прогрева (settled.activation === false): needsTap, отметка tap-wait, прогрев ждёт касания; игра открывается после тапа', async () => {
    const d = withTrace()
    d.warm.settle = vi.fn(() => Promise.resolve({ interrupts: 0, waitedMs: 900, activation: false }))
    const r = await startGameAudio({ cfg, audioSrc: null, lines: null }, d)
    expect(r.needsTap).toBe(true)
    expect(d.warm.rewarmOnGesture).toHaveBeenCalledTimes(1)
    expect(d.trace.setNeedsTap).toHaveBeenCalledWith(true)
    expect(marks(d)).toContain('tap-wait')
    expect(d.trace.mark).toHaveBeenCalledWith('settle', expect.objectContaining({ activation: false, waitedMs: 900 }))
  })
})

describe('RotatePhoneModule: «Тапни, чтобы начать»', () => {
  it('needsTap → фаза tap с RotateTapHint (портал поверх игры), касание: прогрев в жесте, если слушатель касаний ещё не сработал, и только потом фаза game', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./RotatePhoneModule.jsx', import.meta.url), 'utf8')
    expect(src).toContain('const { mic, needsTap } = await startGameAudio({ cfg, audioSrc, lines })')
    expect(src).toContain("setPhase(needsTap ? 'tap' : 'game')")
    expect(src).toContain("{phase === 'tap' && <RotateTapHint onTap={tapped} />}")
    expect(src).toContain('if (gameAudioWarm.status().armed) gameAudioWarm.rewarm(')
    expect(src.indexOf('gameAudioWarm.rewarm(')).toBeLessThan(src.indexOf("gameStartTrace.mark('hint-tap'"))
    const hint = readFileSync(new URL('./RotateTapHint.jsx', import.meta.url), 'utf8')
    expect(hint).toContain('Тапни, чтобы начать')
    expect(hint).toContain('createPortal')
    expect(hint).toContain('onClick={onTap}')
    expect(readFileSync(new URL('../../../../styles/player/modules/rotate-phone.css', import.meta.url), 'utf8')).toMatch(/\.rotateTapHint \{[^}]*position: fixed; inset: 0; z-index: 10001/)
  })
})

describe('wakeGameAudio / rewakeGameAudio: что будится', () => {
  it('первый прогрев: синтезатор, слоты слов, запись автора и её клипы, ноты, прогретый элемент, слова урока, звуки интерфейса — и возвращает промис готовности слов', async () => {
    const ready = wakeGameAudio({ cfg, audioSrc: 'a.mp3', lines: null })
    expect(calls).toEqual(['unlockVoice', 'prepareWords', 'prepareTrack', 'prepareClips', 'unlockNotes', 'primeAudio', 'rewarmWords', 'preloadSounds', 'unlockAudio'])
    await expect(ready).resolves.toBe(true)
  })

  it('без записи автора запасной путь и клипы не готовятся', () => {
    wakeGameAudio({ cfg: { ...cfg, hasAudio: false }, audioSrc: null, lines: null })
    expect(calls).not.toContain('prepareTrack')
    expect(calls).not.toContain('prepareClips')
  })

  it('повторный прогрев: элементы пересоздаются, а сеть не трогается (prepareWords/prepareClips не зовутся); мяу/ноты — release и снова unlock', () => {
    rewakeGameAudio({ audioSrc: 'a.mp3' })
    expect(calls).toEqual(['unlockVoice', 'rewakeClips', 'rewakeTrack', 'releaseNotes', 'unlockNotes', 'primeAudio', 'rewarmWords', 'preloadSounds', 'unlockAudio'])
    calls.length = 0
    rewakeGameAudio({ audioSrc: null })
    expect(calls).not.toContain('rewakeTrack')
  })
})
