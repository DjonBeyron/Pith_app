import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { openGameMic, getGameMic, closeGameMic, GAME_MIC_CONSTRAINTS, gameMicConstraints, isMicProcessingOn, setMicProcessingOn, describeGameMic, MIC_PROCESSING_KEY } from './gameMic.js'
import { confirmMicBeforeStart } from './micAccess.js'
import GameMicBlock from '../../features/admin/speech/GameMicBlock.jsx'

// Хрип голоса Пита и нот: открытый микрофон с эхо/шумоподавлением системы переводит звук страницы в «коммуникационный» режим (iOS — голосовая обработка, Android Chrome — то же).
// Игра открывает поток один раз в тапе «Начать» на ЛЮБОЙ платформе и БЕЗ обработки; тумблер в «Голосе» включает обработку для сравнения на телефоне.
const ANDROID = 'Mozilla/5.0 (Linux; Android 11; SM-A505F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'

const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const fakeStream = (settings = { echoCancellation: false, noiseSuppression: false, autoGainControl: true, sampleRate: 48000 }) => {
  const t = { readyState: 'live', enabled: true, stop() { this.readyState = 'ended' }, getSettings: () => settings }
  return { t, getTracks: () => [t] }
}

afterEach(() => { closeGameMic(); vi.unstubAllGlobals() })

describe('микрофон игры: по умолчанию без системной обработки', () => {
  it('ограничения по умолчанию: эхо и шумодав выключены, автоусиление включено, моно', () => {
    const c = gameMicConstraints(memStore())
    expect(c).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 })
    expect(GAME_MIC_CONSTRAINTS).toMatchObject({ echoCancellation: false, noiseSuppression: false })
  })

  it('тумблер: флаг pithy_mic_processing_v1 включает эхо и шумодав (автоусиление и моно остаются), снятие флага возвращает чистый микрофон', () => {
    const store = memStore()
    expect(isMicProcessingOn(store)).toBe(false)
    setMicProcessingOn(true, store)
    expect(store.m[MIC_PROCESSING_KEY]).toBe('1')
    expect(isMicProcessingOn(store)).toBe(true)
    expect(gameMicConstraints(store)).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 })
    setMicProcessingOn(false, store)
    expect(MIC_PROCESSING_KEY in store.m).toBe(false)
    expect(gameMicConstraints(store).echoCancellation).toBe(false)
  })

  it('нет localStorage (приватный режим) — обработка выключена, ничего не бросает', () => {
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(isMicProcessingOn(broken)).toBe(false)
    expect(() => setMicProcessingOn(true, broken)).not.toThrow()
    expect(gameMicConstraints(broken).echoCancellation).toBe(false)
  })

  it('поток открывается с текущим значением тумблера: выкл — без обработки, вкл — с обработкой', async () => {
    const store = memStore()
    vi.stubGlobal('localStorage', store)
    const gum = vi.fn().mockImplementation(async () => fakeStream())
    vi.stubGlobal('navigator', { userAgent: ANDROID, mediaDevices: { getUserMedia: gum } })
    await openGameMic()
    expect(gum).toHaveBeenLastCalledWith({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
    closeGameMic()
    setMicProcessingOn(true, store)
    await openGameMic()
    expect(gum).toHaveBeenLastCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  })
})

describe('микрофон игры: один поток на игру на любой платформе', () => {
  it.each([['Android', ANDROID], ['iPhone', IPHONE], ['десктоп', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120']])('%s: тап «Начать» открывает поток один раз, повторы и ступени берут тот же', async (_n, userAgent) => {
    const s = fakeStream()
    const gum = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('localStorage', memStore())
    vi.stubGlobal('navigator', { userAgent, mediaDevices: { getUserMedia: gum } })
    expect(await openGameMic()).toBe('granted')
    expect(await openGameMic()).toBe('granted')
    expect(getGameMic()).toBe(s) // распознаватель каждой ступени получает его готовым (opts.stream) — своего getUserMedia с обработкой не открывает
    expect(getGameMic()).toBe(s)
    expect(gum).toHaveBeenCalledTimes(1)
  })

  it('экран «Начать» игры и «Скажи вслух» просит микрофон через openGameMic на всех платформах (не только iPhone)', () => {
    const mod = readFileSync(new URL('../../features/player/modules/rotate-phone/RotatePhoneModule.jsx', import.meta.url), 'utf8')
    expect(mod).toContain('openGameMic(),')
    expect(mod).not.toMatch(/micNeedsHold|ensureMicAccess/)
    const say = readFileSync(new URL('../../features/learn/say-aloud/SayAloudOverlay.jsx', import.meta.url), 'utf8')
    expect(say).toContain('const asked = openGameMic()')
    expect(say).not.toMatch(/micNeedsHold|ensureMicAccess/)
  })

  it('Android: подтверждение перед уроком только проверяет доступ (поток не держится до игры), но и оно без эхо/шумоподавления', async () => {
    const s = fakeStream()
    const gum = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('localStorage', memStore())
    vi.stubGlobal('navigator', { userAgent: ANDROID, mediaDevices: { getUserMedia: gum } }) // Permissions API нет → state 'unknown' → ensureMicAccess
    expect(await confirmMicBeforeStart({ timeoutMs: 50 })).toBe('granted')
    expect(gum).toHaveBeenCalledWith({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
    expect(s.t.readyState).toBe('ended')
    expect(getGameMic()).toBeNull()
  })

  it('«Сказать фразу» не затронута: её распознаватель по-прежнему открывает свой поток сам (с обработкой), общий движок без изменений', () => {
    const engine = readFileSync(new URL('./vosk/voskEngine.js', import.meta.url), 'utf8')
    expect(engine).toContain('getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })')
    expect(engine).toContain('opts.stream ?? null')
  })
})

describe('describeGameMic — для отладочной выгрузки', () => {
  it('до открытия: ограничения, которые попросим, платформа, настроек нет', () => {
    vi.stubGlobal('localStorage', memStore())
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const d = describeGameMic()
    expect(d.constraints).toEqual(GAME_MIC_CONSTRAINTS)
    expect(d.settings).toBeNull()
    expect(d.platform).toBe('android')
    expect(d.open).toBe(false)
    expect(d.processing).toBe(false)
  })

  it('после открытия: что реально дал браузер (track.getSettings) и с чем просили; iPhone и обработка вкл', async () => {
    const store = memStore({ [MIC_PROCESSING_KEY]: '1' })
    vi.stubGlobal('localStorage', store)
    const given = { echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 48000 }
    vi.stubGlobal('navigator', { userAgent: IPHONE, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream(given)) } })
    await openGameMic()
    const d = describeGameMic()
    expect(d.platform).toBe('ios')
    expect(d.constraints).toMatchObject({ echoCancellation: true, noiseSuppression: true })
    expect(d.settings).toEqual(given)
    expect(d.open).toBe(true)
    expect(d.processing).toBe(true)
    closeGameMic()
    expect(describeGameMic().settings).toBeNull()
  })
})

describe('админка «Голос»: тумблер обработки микрофона', () => {
  it('блок показывает тумблер (по умолчанию выкл) и подключён во вкладку', () => {
    vi.stubGlobal('localStorage', memStore())
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const html = renderToStaticMarkup(<GameMicBlock />)
    expect(html).toContain('data-testid="mic-processing-toggle"')
    expect(html).toContain('Обработка микрофона системой (эхо/шум): выкл')
    expect(html).toContain('Платформа: android')
    vi.stubGlobal('localStorage', memStore({ [MIC_PROCESSING_KEY]: '1' }))
    expect(renderToStaticMarkup(<GameMicBlock />)).toContain('Обработка микрофона системой (эхо/шум): вкл')
    const tab = readFileSync(new URL('../../features/admin/speech/AdminSpeechTab.jsx', import.meta.url), 'utf8')
    expect(tab).toContain('<GameMicBlock />')
  })
})
