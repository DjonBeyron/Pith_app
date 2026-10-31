import { describe, it, expect, vi, afterEach } from 'vitest'
import { openGameMic, getGameMic, closeGameMic, parkGameMic, reopenGameMic, hasGameMic, isGameMicTaken, isGameMicParked, describeGameMic } from './gameMic.js'
import { createMicHold, PARK_MIN_MS } from './gameMicHold.js'
import { createGameAudioSession } from './gameMicSession.js'
import { readMicHoldMode, writeMicHoldMode, MIC_HOLD_KEY, MIC_HOLD_MODES } from './gameAudioSettings.js'

// Режим «микрофон только в фазе ученика» (pithy_game_mic_hold_v1 = 'close', приём «Сказать фразу»): поток закрывается на время речи Пита и диктора и открывается заново к очереди ученика
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const mkStream = () => { const t = { readyState: 'live', enabled: true, muted: false, stop() { this.readyState = 'ended' } }; return { t, getTracks: () => [t], getAudioTracks: () => [t] } }
const nextTick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

afterEach(() => { closeGameMic(); vi.unstubAllGlobals() })

describe('настройка', () => {
  it("'close' — допустимое значение, читается и пишется; мусор — по умолчанию", () => {
    expect(MIC_HOLD_MODES).toContain('close')
    const s = memStore()
    writeMicHoldMode('close', s)
    expect(s.m).toEqual({ [MIC_HOLD_KEY]: 'close' })
    expect(readMicHoldMode(s)).toBe('close')
    writeMicHoldMode('enabled-false', s) // значение по умолчанию (режим B) ключ снимает
    expect(s.m).toEqual({})
    writeMicHoldMode('none', s)
    expect(s.m).toEqual({ [MIC_HOLD_KEY]: 'none' })
  })
})

describe('gameMic: закрыть поток на время речи и открыть заново', () => {
  it('parkGameMic останавливает треки, поток исчезает (hasGameMic = false), reopenGameMic открывает новый; пока открывается, getGameMic отдаёт обещание потока', async () => {
    const first = mkStream(), second = mkStream()
    let resolveGum
    const gum = vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(r => { resolveGum = r }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } })
    expect(await openGameMic()).toBe('granted')
    expect(parkGameMic()).toEqual({ parked: true, wasTaken: false })
    expect(first.t.readyState).toBe('ended')
    expect(hasGameMic()).toBe(false)
    expect(isGameMicParked()).toBe(true)
    expect(getGameMic()).toBeNull() // закрыт и ещё не открывается
    expect(describeGameMic()).toMatchObject({ open: false, parked: true })

    const reopened = reopenGameMic()
    const promised = getGameMic()
    expect(typeof promised.then).toBe('function') // распознаватель дождётся потока, а не откроет свой с обработкой
    expect(reopenGameMic()).toBe(reopened) // повторный вызов — тот же промис
    resolveGum(second)
    expect(await reopened).toBe('granted')
    expect(await promised).toBe(second)
    expect(getGameMic()).toBe(second)
    expect(isGameMicParked()).toBe(false)
    expect(gum).toHaveBeenCalledTimes(2)
  })

  it('повторное открытие не удалось (отказ без жеста) — обещание даёт null (движок откроет свой), parked остаётся, ответ — denied', async () => {
    const first = mkStream()
    const gum = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } })
    await openGameMic(); parkGameMic()
    const r = reopenGameMic()
    const promised = getGameMic()
    expect(await r).toBe('denied')
    expect(await promised).toBeNull()
    expect(isGameMicParked()).toBe(true)
  })

  it('поток держит распознаватель (getGameMic брал его): force=false его не закрывает; force=true закрывает и сообщает wasTaken', async () => {
    const s = mkStream()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(s) } })
    await openGameMic()
    expect(isGameMicTaken()).toBe(false)
    expect(getGameMic()).toBe(s)
    expect(isGameMicTaken()).toBe(true)
    expect(parkGameMic({ force: false })).toEqual({ parked: false, wasTaken: true })
    expect(s.t.readyState).toBe('live')
    expect(parkGameMic({ force: true })).toEqual({ parked: true, wasTaken: true })
    expect(s.t.readyState).toBe('ended')
  })

  it('поток закрывается во время окна, пока идёт открытие: parkGameMic просит закрыть позже (pending)', async () => {
    const first = mkStream()
    let resolveGum
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(r => { resolveGum = r })) } })
    await openGameMic(); parkGameMic()
    const r = reopenGameMic()
    expect(parkGameMic()).toEqual({ parked: false, wasTaken: false, pending: true })
    resolveGum(mkStream()); await r
  })

  it('конец игры (closeGameMic) во время повторного открытия: новый поток сразу закрывается — микрофон не остаётся включённым', async () => {
    const first = mkStream(), late = mkStream()
    let resolveGum
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(r => { resolveGum = r })) } })
    await openGameMic(); parkGameMic()
    const r = reopenGameMic()
    closeGameMic()
    resolveGum(late)
    expect(await r).toBe('unavailable')
    expect(late.t.readyState).toBe('ended')
    expect(hasGameMic()).toBe(false)
  })
})

describe('gameMicHold в режиме close', () => {
  const mk = (mode = 'close', { parkResult = { parked: true, wasTaken: false } } = {}) => {
    const calls = []
    const note = vi.fn()
    const park = vi.fn(opts => { calls.push(`park${opts?.force ? '(force)' : ''}`); return typeof parkResult === 'function' ? parkResult(opts) : parkResult })
    const reopen = vi.fn(() => { calls.push('reopen'); return Promise.resolve('granted') })
    const session = { phase: vi.fn(p => calls.push(`phase:${p}`)), micClosed: vi.fn(() => calls.push('micClosed')), micOpening: vi.fn(() => calls.push('micOpening')) }
    const hold = createMicHold({ getStream: () => null, session, store: memStore({ [MIC_HOLD_KEY]: mode }), note, park, reopen, setTimer: () => { calls.push('timer'); return 1 }, clearTimer: () => {} })
    return { hold, calls, note, park, reopen, session }
  }

  it('окно диктора: поток закрывается (тип сессии → auto), в конце окна — тип play-and-record ДО повторного открытия; сеанса слушателя не было — слушатель не перезапускается', async () => {
    const m = mk(); const reopened = vi.fn()
    m.hold.setReopenHandler(reopened)
    m.hold.begin({ dictor: true })
    expect(m.calls).toEqual(['phase:speak', 'park(force)', 'micClosed'])
    expect(m.note).toHaveBeenCalledWith('mic-hold', expect.objectContaining({ on: true, mode: 'close', parked: true }))
    m.hold.end()
    expect(m.calls.slice(3)).toEqual(['phase:listen', 'micOpening', 'reopen']) // сначала тип, потом getUserMedia
    await nextTick()
    expect(reopened).not.toHaveBeenCalled()
    expect(m.note).toHaveBeenLastCalledWith('mic-hold', expect.objectContaining({ on: false, mode: 'close', reopened: 'granted', wasTaken: false }))
  })

  it('реплика Пита закрыла поток, который держал распознаватель: после повторного открытия зовётся обработчик «перезапустить слушателя» (один раз); на ступени диктора слушателя нет — не зовётся', async () => {
    const m = mk('close', { parkResult: { parked: true, wasTaken: true } }); const reopened = vi.fn()
    m.hold.setReopenHandler(reopened)
    m.hold.holdFor(2000)
    m.hold.reset(); m.hold.begin({ dictor: true }); m.hold.end() // ступень диктора: отдельная проверка ниже
    await nextTick()
    expect(reopened).toHaveBeenCalledTimes(0) // reset() закрыл окно без повторного открытия, ступень диктора слушателя не перезапускает
    const n = mk('close', { parkResult: { parked: true, wasTaken: true } }); const again = vi.fn()
    n.hold.setReopenHandler(again)
    n.hold.begin({ ms: 2000 }); n.hold.end()
    await nextTick()
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('вложенные окна: поток закрывается один раз, открывается, когда закрылось последнее', () => {
    const m = mk()
    m.hold.begin({ dictor: true }); m.hold.begin({ ms: 2000 })
    m.hold.end()
    expect(m.reopen).not.toHaveBeenCalled()
    m.hold.end()
    expect(m.reopen).toHaveBeenCalledTimes(1)
    expect(m.park).toHaveBeenCalledTimes(1)
  })

  it('реплика Пита (holdFor): короче PARK_MIN_MS не закрывает; длиннее закрывает без force (поток распознавателя не трогаем); окно диктора — с force', () => {
    const m = mk()
    m.hold.holdFor(PARK_MIN_MS - 1)
    expect(m.park).not.toHaveBeenCalled()
    m.hold.reset()
    const n = mk()
    n.hold.holdFor(PARK_MIN_MS)
    expect(n.park).toHaveBeenCalledWith({ force: false })
    const d = mk()
    d.hold.begin({ dictor: true })
    expect(d.park).toHaveBeenCalledWith({ force: true })
  })

  it('поток держит распознаватель — реплика Пита его не закрывает, в журнале причина; повторного открытия нет', () => {
    const m = mk('close', { parkResult: { parked: false, wasTaken: true } })
    m.hold.holdFor(2000)
    expect(m.note).toHaveBeenCalledWith('mic-hold', expect.objectContaining({ mode: 'close', parked: false, why: 'recognizer-holds' }))
    m.hold.reset()
    expect(m.reopen).not.toHaveBeenCalled()
  })

  it('конец игры (reset) при закрытом потоке: заново не открываем', () => {
    const m = mk()
    m.hold.begin({ dictor: true })
    m.hold.reset()
    expect(m.reopen).not.toHaveBeenCalled()
    expect(m.hold.depth).toBe(0)
  })

  it('parkNow — закрыть сразу после открытия на старте игры (вне окна речи); в режиме none ничего не делает', () => {
    const m = mk()
    m.hold.parkNow()
    expect(m.park).toHaveBeenCalledWith({ force: true })
    const n = mk('none')
    n.hold.parkNow(); n.hold.begin({ dictor: true }); n.hold.end()
    expect(n.park).not.toHaveBeenCalled()
    expect(n.reopen).not.toHaveBeenCalled()
  })

  it('окно речи открылось, пока поток ещё открывался: park просит «позже» (pending), и после открытия поток закрывается снова', async () => {
    let resolveReopen
    let pendingNow = false
    const m = mk('close', { parkResult: () => (pendingNow ? { parked: false, wasTaken: false, pending: true } : { parked: true, wasTaken: false }) })
    m.reopen.mockImplementation(() => new Promise(r => { resolveReopen = r }))
    m.hold.begin({ dictor: true }); m.hold.end() // закрыли → открываем (ответ придёт позже)
    pendingNow = true
    m.hold.begin({ dictor: true })               // новое окно, пока открывается
    expect(m.park).toHaveBeenCalledTimes(2)
    pendingNow = false
    resolveReopen('granted'); await nextTick()
    expect(m.park).toHaveBeenCalledTimes(3)      // после открытия закрыли ещё раз
    expect(m.note).toHaveBeenCalledWith('mic-hold', expect.objectContaining({ on: true, mode: 'close', parked: true }))
    m.hold.end()
    expect(m.reopen).toHaveBeenCalledTimes(2)    // и вернули в конце второго окна
  })

  it('режимы none и enabled-false поток не закрывают (прежнее поведение)', () => {
    for (const mode of ['none', 'enabled-false']) {
      const m = mk(mode)
      m.hold.begin({ dictor: true }); m.hold.holdFor(3000); m.hold.reset()
      expect(m.park).not.toHaveBeenCalled()
      expect(m.reopen).not.toHaveBeenCalled()
    }
  })
})

describe('gameMicSession: micClosed / micOpening (только режим close)', () => {
  const mkSes = mode => {
    const n = { audioSession: { type: 'auto' } }; const note = vi.fn()
    const ses = createGameAudioSession({ nav: n, store: memStore(mode ? { pithy_game_audio_session_v1: mode } : {}), note })
    return { n, ses, note }
  }
  it("по умолчанию: открытие микрофона → play-and-record, закрытие → auto; журнал mic-open / mic-closed", () => {
    const { n, ses, note } = mkSes()
    ses.begin()
    ses.micClosed(); expect(n.audioSession.type).toBe('auto')
    ses.micOpening(); expect(n.audioSession.type).toBe('play-and-record')
    expect(note.mock.calls.map(c => c[1].why)).toEqual(['begin', 'mic-closed', 'mic-open'])
  })
  it("режимы 'auto' (не трогаем) и 'phases' (ведёт phase) — no-op; до begin — тоже", () => {
    const a = mkSes('auto'); a.ses.begin(); a.ses.micOpening(); a.ses.micClosed()
    expect(a.n.audioSession.type).toBe('auto')
    const p = mkSes('phases'); p.ses.begin(); p.ses.micClosed()
    expect(p.n.audioSession.type).toBe('play-and-record')
    const z = mkSes(); z.ses.micOpening()
    expect(z.n.audioSession.type).toBe('auto')
  })
})
