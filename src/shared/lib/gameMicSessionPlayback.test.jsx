import { describe, it, expect, vi } from 'vitest'
import { AUDIO_SESSION_KEY } from './gameAudioSettings.js'
import { createGameAudioSession } from './gameMicSession.js'

// Режим сессии 'playback' (v3.3.210): тип playback ставится один раз после открытия микрофона и держится весь сеанс игры (gameMicSession.afterMic)
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] } } }
const mk = (mode, type = 'auto') => {
  const n = { audioSession: { type } }, note = vi.fn()
  return { n, note, ses: createGameAudioSession({ nav: n, store: memStore(mode ? { [AUDIO_SESSION_KEY]: mode } : {}), note }) }
}

describe("режим сессии 'playback'", () => {
  it('begin ставит play-and-record (для getUserMedia), afterMic — playback один раз на весь сеанс; повторный begin (сцена), фазы и закрытие микрофона его не трогают; end возвращает прежний', () => {
    const { n, note, ses } = mk('playback', 'ambient')
    ses.begin(); expect(n.audioSession.type).toBe('play-and-record')
    ses.afterMic(); expect(n.audioSession.type).toBe('playback')
    ses.afterMic(); ses.begin(); ses.phase('speak'); ses.phase('listen'); ses.micClosed(); ses.micOpening()
    expect(n.audioSession.type).toBe('playback')
    expect(note.mock.calls.map(c => c[1].why)).toEqual(['begin', 'mic-ready'])
    ses.end(); expect(n.audioSession.type).toBe('ambient')
    ses.begin(); expect(n.audioSession.type).toBe('play-and-record') // новая игра — снова с play-and-record
  })
  it('afterMic в остальных режимах — no-op (play-and-record, auto, phases)', () => {
    for (const m of ['play-and-record', 'auto', 'phases']) { const { n, ses } = mk(m, 'ambient'); ses.begin(); const t = n.audioSession.type; ses.afterMic(); expect(n.audioSession.type).toBe(t) }
  })
  it('умолчание (ключа нет) — playback весь сеанс; begin при уже поставленном playback (renew на «Продолжить» сбросил тип в auto) возвращает playback, а не play-and-record; закрытие потока (micGone) снимает удержание', () => {
    const { n, note, ses } = mk(null, 'ambient')
    ses.begin(); ses.afterMic(); expect(n.audioSession.type).toBe('playback')
    n.audioSession.type = 'auto'                       // renewAudioSession: тип сброшен снаружи
    ses.begin(); expect(n.audioSession.type).toBe('playback')
    expect(note.mock.calls.map(c => c[1].why)).toEqual(['begin', 'mic-ready', 'begin-again'])
    ses.micGone(); n.audioSession.type = 'auto'
    ses.begin(); expect(n.audioSession.type).toBe('play-and-record') // поток закрыт — до нового getUserMedia снова запись
    ses.afterMic(); expect(n.audioSession.type).toBe('playback')
  })
  it('пауза → «Продолжить»: end возвращает тип; renew ставит auto и зовёт begin (play-and-record), затем openGameMic зовёт afterMic — снова playback', () => {
    const { n, ses } = mk(null, 'ambient')
    ses.begin(); ses.afterMic(); expect(n.audioSession.type).toBe('playback')
    ses.end(); expect(n.audioSession.type).toBe('ambient')               // пауза (endGameAudio)
    n.audioSession.type = 'auto'; ses.begin()                            // restartGameAudio → renewAudioSession → applyType = begin
    expect(n.audioSession.type).toBe('play-and-record')
    ses.begin(); ses.afterMic(); expect(n.audioSession.type).toBe('playback') // startBody: begin, затем микрофон открыт
  })
  it('afterMic до begin (игра не начата) — ничего не делает', () => {
    const { n, ses } = mk('playback', 'ambient'); ses.afterMic()
    expect(n.audioSession.type).toBe('ambient')
  })
})
