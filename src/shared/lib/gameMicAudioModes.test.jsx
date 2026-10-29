import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import {
  AUDIO_SESSION_KEY, MIC_HOLD_KEY, readAudioSessionMode, writeAudioSessionMode, readMicHoldMode, writeMicHoldMode,
} from './gameAudioSettings.js'
import { createGameAudioSession } from './gameMicSession.js'
import { createMicHold, HOLD_CHECK_MS } from './gameMicHold.js'
import { setGameAudioSink, gameAudioNote } from './gameAudioSink.js'
import { describeGameMic, closeGameMic } from './gameMic.js'
import GameMicBlock from '../../features/admin/speech/GameMicBlock.jsx'

// Режимы для проверки на iPhone: тип аудиосессии и глушение дорожки микрофона на время речи Пита/диктора (A/B в Админ → «Голос»)
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const nav = (type = 'auto') => ({ audioSession: { type } })
const track = (over = {}) => ({ enabled: true, muted: false, readyState: 'live', ...over })
const streamOf = (...tracks) => ({ getAudioTracks: () => tracks, getTracks: () => tracks })
const timers = () => { const q = []; return { q, setTimer: (fn, ms) => { q.push({ fn, ms }); return q.length }, clearTimer: id => { if (q[id - 1]) q[id - 1].fn = null }, run: () => { q.splice(0).forEach(t => t.fn?.()) } } }

afterEach(() => { setGameAudioSink(null); closeGameMic(); vi.unstubAllGlobals() })

describe('настройки режимов читаются из localStorage', () => {
  it('по умолчанию: аудиосессия play-and-record, микрофон не трогаем; незнакомое значение = по умолчанию', () => {
    const s = memStore()
    expect(readAudioSessionMode(s)).toBe('play-and-record')
    expect(readMicHoldMode(s)).toBe('none')
    expect(readAudioSessionMode(memStore({ [AUDIO_SESSION_KEY]: 'мусор' }))).toBe('play-and-record')
    expect(readMicHoldMode(memStore({ [MIC_HOLD_KEY]: 'мусор' }))).toBe('none')
  })
  it('значения читаются и пишутся; значение по умолчанию ключ снимает; битое хранилище не роняет', () => {
    const s = memStore()
    writeAudioSessionMode('phases', s); writeMicHoldMode('enabled-false', s)
    expect(s.m).toEqual({ [AUDIO_SESSION_KEY]: 'phases', [MIC_HOLD_KEY]: 'enabled-false' })
    expect(readAudioSessionMode(s)).toBe('phases')
    expect(readMicHoldMode(s)).toBe('enabled-false')
    writeAudioSessionMode('play-and-record', s); writeMicHoldMode('none', s); writeAudioSessionMode('auto', s)
    expect(s.m).toEqual({ [AUDIO_SESSION_KEY]: 'auto' })
    const broken = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') }, removeItem() { throw new Error('private') } }
    expect(readAudioSessionMode(broken)).toBe('play-and-record')
    expect(() => writeMicHoldMode('enabled-false', broken)).not.toThrow()
  })
})

describe('тип аудиосессии: ставится в начале игры и возвращается в конце', () => {
  const mk = (mode, type = 'auto') => {
    const n = nav(type); const note = vi.fn()
    const store = memStore(mode ? { [AUDIO_SESSION_KEY]: mode } : {})
    return { n, note, ses: createGameAudioSession({ nav: n, store, note }) }
  }
  it('по умолчанию (play-and-record): begin ставит тип, повторный begin ничего не делает, end возвращает прежний; события audio-session', () => {
    const { n, note, ses } = mk(null, 'ambient')
    ses.begin(); ses.begin()
    expect(n.audioSession.type).toBe('play-and-record')
    expect(note).toHaveBeenCalledTimes(1)
    expect(note).toHaveBeenCalledWith('audio-session', { mode: 'play-and-record', why: 'begin', requested: 'play-and-record', ok: true, as: 'play-and-record', prev: 'ambient', supported: true })
    ses.phase('speak')                                   // не 'phases' — игнорируется
    expect(n.audioSession.type).toBe('play-and-record')
    ses.end(); ses.end()
    expect(n.audioSession.type).toBe('ambient')
    expect(note).toHaveBeenLastCalledWith('audio-session', expect.objectContaining({ why: 'end', requested: 'ambient', ok: true, as: 'ambient' }))
    expect(note).toHaveBeenCalledTimes(2)
  })
  it("'auto': тип не трогаем ни в начале, ни по фазам, ни в конце; в журнал уходит только факт", () => {
    const { n, note, ses } = mk('auto', 'ambient')
    ses.begin(); ses.phase('speak'); ses.end()
    expect(n.audioSession.type).toBe('ambient')
    expect(note).toHaveBeenCalledTimes(1)
    expect(note).toHaveBeenCalledWith('audio-session', expect.objectContaining({ mode: 'auto', requested: null, ok: true, as: 'ambient' }))
  })
  it("'phases': playback на время речи, play-and-record на очередь ученика, в конце — прежний; в журнале каждая смена", () => {
    const { n, note, ses } = mk('phases')
    ses.begin()
    expect(n.audioSession.type).toBe('play-and-record')
    ses.phase('speak'); expect(n.audioSession.type).toBe('playback')
    ses.phase('speak'); expect(note).toHaveBeenCalledTimes(2)       // тот же тип — не шумим
    ses.phase('listen'); expect(n.audioSession.type).toBe('play-and-record')
    ses.end()
    expect(n.audioSession.type).toBe('auto')
    expect(note.mock.calls.map(c => c[1].why)).toEqual(['begin', 'phase:speak', 'phase:listen', 'end'])
    ses.phase('speak'); expect(n.audioSession.type).toBe('auto')    // игра закончилась — фазы игнорируются
  })
  it('нет navigator.audioSession: всё no-op, в журнал — supported:false, describe не падает', () => {
    const note = vi.fn()
    const ses = createGameAudioSession({ nav: {}, store: memStore({ [AUDIO_SESSION_KEY]: 'phases' }), note })
    expect(() => { ses.begin(); ses.phase('speak'); ses.end() }).not.toThrow()
    expect(note).toHaveBeenCalledWith('audio-session', expect.objectContaining({ ok: false, supported: false, as: null }))
    expect(ses.describe()).toMatchObject({ supported: false, type: null })
  })
  it('отказ браузера (set бросает) не роняет игру: ok:false, прежний тип не «возвращаем»', () => {
    const n = { audioSession: Object.defineProperty({}, 'type', { get: () => 'auto', set() { throw new Error('nope') } }) }
    const note = vi.fn()
    const ses = createGameAudioSession({ nav: n, store: memStore(), note })
    ses.begin(); ses.end()
    expect(note).toHaveBeenCalledTimes(1)
    expect(note.mock.calls[0][1]).toMatchObject({ requested: 'play-and-record', ok: false })
  })
})

describe('глушение дорожки на время речи (окно речи со счётчиком вложенности)', () => {
  const mk = (mode, { tracks = [track()], phase = vi.fn() } = {}) => {
    const t = timers(); const note = vi.fn()
    const stream = streamOf(...tracks)
    const hold = createMicHold({ getStream: () => stream, session: { phase }, store: memStore(mode ? { [MIC_HOLD_KEY]: mode } : {}), note, setTimer: t.setTimer, clearTimer: t.clearTimer })
    return { hold, t, note, tracks, phase, stream }
  }
  it("по умолчанию ('none') дорожки не трогаются, но окно речи переключает фазу аудиосессии", () => {
    const m = mk(null)
    m.hold.begin()
    expect(m.tracks[0].enabled).toBe(true)
    expect(m.hold.active()).toBe(false)
    expect(m.phase).toHaveBeenLastCalledWith('speak')
    m.hold.end()
    expect(m.phase).toHaveBeenLastCalledWith('listen')
    expect(m.note).not.toHaveBeenCalled()
  })
  it("'enabled-false': begin выключает, end возвращает прежнее значение; вложенность считается — включает только последний end", () => {
    const m = mk('enabled-false')
    m.hold.begin(); m.hold.begin()
    expect(m.tracks[0].enabled).toBe(false)
    expect(m.hold.active()).toBe(true)
    expect(m.hold.depth).toBe(2)
    m.hold.end()
    expect(m.tracks[0].enabled).toBe(false)               // диктор ещё говорит
    m.hold.end()
    expect(m.tracks[0].enabled).toBe(true)
    expect(m.hold.active()).toBe(false)
    m.hold.end()                                           // лишний end безопасен
    expect(m.hold.depth).toBe(0)
    expect(m.note.mock.calls.map(c => [c[0], c[1].on])).toEqual([['mic-hold', true], ['mic-hold', false]])
    expect(m.note.mock.calls[0][1]).toMatchObject({ mode: 'enabled-false', enabled: false, muted: false, readyState: 'live', tracks: 1 })
  })
  it('дорожка, которая была выключена до окна, выключенной и остаётся (возвращаем прежнее, а не true)', () => {
    const m = mk('enabled-false', { tracks: [track({ enabled: false })] })
    m.hold.begin(); m.hold.end()
    expect(m.tracks[0].enabled).toBe(false)
  })
  it('после возврата через HOLD_CHECK_MS дорожка проверяется: жива — тихо (в журнал mic-hold с muted/readyState), умерла или muted — зовётся обработчик «оглохшего» микрофона', () => {
    const ok = mk('enabled-false'); const dead = vi.fn()
    ok.hold.setDeadHandler(dead)
    ok.hold.begin(); ok.hold.end()
    expect(ok.t.q.at(-1).ms).toBe(HOLD_CHECK_MS)
    ok.t.run()
    expect(dead).not.toHaveBeenCalled()
    expect(ok.note).toHaveBeenLastCalledWith('mic-hold', expect.objectContaining({ check: true, enabled: true, muted: false, readyState: 'live', dead: false }))

    const bad = mk('enabled-false'); const onDead = vi.fn()
    bad.hold.setDeadHandler(onDead)
    bad.hold.begin(); bad.tracks[0].readyState = 'ended'; bad.hold.end(); bad.t.run()
    expect(onDead).toHaveBeenCalledWith('ended')
    expect(bad.note).toHaveBeenLastCalledWith('mic-hold', expect.objectContaining({ check: true, readyState: 'ended', dead: true }))

    const muted = mk('enabled-false'); const onMuted = vi.fn()
    muted.hold.setDeadHandler(onMuted)
    muted.hold.begin(); muted.hold.end(); muted.tracks[0].muted = true; muted.t.run()
    expect(onMuted).toHaveBeenCalledWith('live/muted')
  })
  it('поток закрыт до проверки — проверять нечего; новое окно речи отменяет отложенную проверку', () => {
    const m = mk('enabled-false'); const dead = vi.fn()
    m.hold.setDeadHandler(dead)
    m.hold.begin(); m.hold.end()
    m.stream.getAudioTracks = () => []                    // поток закрыт
    m.t.run()
    expect(dead).not.toHaveBeenCalled()
    const n = mk('enabled-false')
    n.hold.begin(); n.hold.end(); n.hold.begin()
    n.t.run()
    expect(n.note.mock.calls.filter(c => c[1].check)).toHaveLength(0)
  })
  it('holdFor(ms) держит окно ровно столько и закрывается один раз; reset (конец игры) закрывает всё и возвращает enabled', () => {
    const m = mk('enabled-false')
    const close = m.hold.holdFor(1500)
    expect(m.t.q[0].ms).toBe(1500)
    expect(m.tracks[0].enabled).toBe(false)
    m.t.q[0].fn()
    expect(m.tracks[0].enabled).toBe(true)
    close(); expect(m.hold.depth).toBe(0)
    m.hold.holdFor(5000); m.hold.begin()
    expect(m.hold.depth).toBe(2)
    m.hold.reset()
    expect(m.hold.depth).toBe(0)
    expect(m.tracks[0].enabled).toBe(true)
    expect(m.hold.active()).toBe(false)
  })
  it('нет потока — окно открывается без падения, причина в журнале', () => {
    const t = timers(); const note = vi.fn()
    const hold = createMicHold({ getStream: () => null, session: { phase() {} }, store: memStore({ [MIC_HOLD_KEY]: 'enabled-false' }), note, setTimer: t.setTimer, clearTimer: t.clearTimer })
    hold.begin(); hold.end()
    expect(note).toHaveBeenCalledWith('mic-hold', expect.objectContaining({ on: true, why: 'no-stream', tracks: 0 }))
  })
})

describe('события уходят в приёмник отладки', () => {
  it('gameAudioNote → приёмник; без приёмника и при его падении — тихо', () => {
    const got = []
    expect(() => gameAudioNote('mic-hold', { on: true })).not.toThrow()
    setGameAudioSink((k, d) => got.push([k, d]))
    gameAudioNote('audio-session', { as: 'playback' })
    expect(got).toEqual([['audio-session', { as: 'playback' }]])
    setGameAudioSink(() => { throw new Error('boom') })
    expect(() => gameAudioNote('x')).not.toThrow()
  })
})

describe('админка «Голос» → «Микрофон игры»: два селектора', () => {
  it('показывает варианты, выбранные значения и текущий navigator.audioSession.type; без API — пометка', () => {
    vi.stubGlobal('localStorage', memStore({ [AUDIO_SESSION_KEY]: 'phases', [MIC_HOLD_KEY]: 'enabled-false' }))
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone)', audioSession: { type: 'playback' } })
    const html = renderToStaticMarkup(<GameMicBlock />)
    expect(html).toContain('data-testid="audio-session-mode"')
    expect(html).toContain('data-testid="mic-hold-mode"')
    for (const t of ['Запись и воспроизведение', 'Авто (не трогать)', 'Переключать по фазам', 'Не трогать', 'Выключать дорожку']) expect(html).toContain(t)
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="phases"|data-value="phases"[^>]*aria-checked="true"|aria-checked="true" class="aspChip aspChipOn" data-value="phases"/)
    expect(html).toContain('navigator.audioSession.type сейчас: playback')
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 11)' })
    expect(renderToStaticMarkup(<GameMicBlock />)).toContain('нет API')
  })
  it('describeGameMic отдаёт режимы и состояние дорожек для отладочной выгрузки; блок подключён во вкладку', () => {
    vi.stubGlobal('localStorage', memStore({ [MIC_HOLD_KEY]: 'enabled-false' }))
    expect(describeGameMic()).toMatchObject({ audioSessionMode: 'play-and-record', micHoldMode: 'enabled-false', tracks: null })
    expect(readFileSync(new URL('../../features/admin/speech/AdminSpeechTab.jsx', import.meta.url), 'utf8')).toContain('<GameMicBlock />')
  })
})
