import { describe, it, expect, vi, afterEach } from 'vitest'
import { micNeedsHold, confirmMicBeforeStart } from './micAccess.js'
import { openGameMic, getGameMic, setGameMicActive, closeGameMic } from './gameMic.js'

const track = () => ({ readyState: 'live', enabled: true, stop() { this.readyState = 'ended' } })
const fakeStream = () => { const t = track(); return { t, getTracks: () => [t] } }

afterEach(() => { closeGameMic(); vi.unstubAllGlobals() })

describe('iPhone: разрешение не запоминается — один поток на всю игру', () => {
  it('micNeedsHold: iPhone, iPad и iPadOS (притворяется Mac с тачем) — да; Android и десктоп — нет', () => {
    expect(micNeedsHold({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true)
    expect(micNeedsHold({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' })).toBe(true)
    expect(micNeedsHold({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(micNeedsHold({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(micNeedsHold({ userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A505F) Chrome/120' })).toBe(false)
    expect(micNeedsHold(null)).toBe(false)
  })

  it('на iPhone предварительный запрос перед стартом урока не делается (он не доживёт до игры)', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', mediaDevices: { getUserMedia: vi.fn() } })
    expect(await confirmMicBeforeStart()).toBe('deferred')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('поток открывается один раз (повторный вызов — тот же, без второго getUserMedia), по умолчанию выключен, включается по требованию', async () => {
    const s = fakeStream()
    const gum = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } })
    expect(await openGameMic()).toBe('granted')
    expect(await openGameMic()).toBe('granted')
    expect(gum).toHaveBeenCalledTimes(1)
    expect(getGameMic()).toBe(s)
    expect(s.t.enabled).toBe(false)
    setGameMicActive(true); expect(s.t.enabled).toBe(true)
    setGameMicActive(false); expect(s.t.enabled).toBe(false)
  })

  it('закрытие игры останавливает треки; оборвавшийся поток не отдаётся (распознаватель откроет сам)', async () => {
    const s = fakeStream()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(s) } })
    await openGameMic()
    s.t.readyState = 'ended'
    expect(getGameMic()).toBeNull()
    s.t.readyState = 'live'
    closeGameMic()
    expect(s.t.readyState).toBe('ended')
    expect(getGameMic()).toBeNull()
  })

  it('отказ и отсутствие микрофона не бросают', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) } })
    expect(await openGameMic()).toBe('denied')
    vi.stubGlobal('navigator', {})
    expect(await openGameMic()).toBe('unavailable')
  })

  it('распознаватель берёт готовый поток и не останавливает его; игра отдаёт его слушателю и выключает треки между ступенями', async () => {
    const { readFileSync } = await import('node:fs')
    const engine = readFileSync(new URL('./vosk/voskEngine.js', import.meta.url), 'utf8')
    expect(engine).toContain('opts.stream ?? null')
    expect(engine).toContain('if (own) stream.getTracks().forEach(tr => tr.stop())')
    expect(engine).toContain('releaseCapture({ stream: own ? stream : null')
    const flow = readFileSync(new URL('../../features/player/modules/rotate-phone/useWordLaneFlow.js', import.meta.url), 'utf8')
    expect(flow).toContain('getStream: getGameMic')
    expect(flow).toContain('setGameMicActive(true)')
    expect(flow).toContain('closeGameMic()')
    const mod = readFileSync(new URL('../../features/player/modules/rotate-phone/RotatePhoneModule.jsx', import.meta.url), 'utf8')
    expect(mod).toContain('micNeedsHold() ? openGameMic() : ensureMicAccess()')
  })
})
