import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Порядок жеста звука на iOS: жест на видео не должен трогать аудио сцен (тихий wav + speechSynthesis.speak), это делает жест на сцене.
// Окружение node: navigator/document/window — заглушки.
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID = 'Mozilla/5.0 (Linux; Android 11; SM-A505F) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'

let plays, speaks, mod
function stubEnv(ua) {
  plays = []
  speaks = []
  const mk = () => ({ setAttribute() {}, style: {}, remove() {}, pause() {}, play() { plays.push(1); return Promise.resolve() } })
  vi.stubGlobal('navigator', { userAgent: ua, platform: 'iPhone', maxTouchPoints: 5 })
  vi.stubGlobal('document', { createElement: mk, body: { appendChild() {} } })
  const synth = { cancel() {}, speak: u => speaks.push(u), getVoices: () => [] }
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t } })
}
async function load() {
  vi.resetModules()
  mod = await import('./sceneAudioUnlock.js')
}

afterEach(() => vi.unstubAllGlobals())

describe('аудио сцен и жест на видео (iOS)', () => {
  beforeEach(() => stubEnv(IOS))

  it('по умолчанию переключатель выключен, на iOS открытие отложено', async () => {
    await load()
    expect(mod.SCENE_AUDIO_EAGER_UNLOCK).toBe(false)
    expect(mod.sceneUnlockDeferred()).toBe(true)
  })

  it('жест на видео на iOS не играет тихий wav и не зовёт speechSynthesis', async () => {
    await load()
    expect(mod.unlockSceneAudioFromVideoGesture()).toBe(false)
    expect(plays.length).toBe(0)
    expect(speaks.length).toBe(0)
    expect(mod.sceneAudioUnlocked()).toBe(false)
  })

  it('до жеста на сцене слайду-сцене нужен свой жест, после unlockSceneAudio — нет, подписчики уведомлены', async () => {
    await load()
    const seen = vi.fn()
    mod.subscribeSceneAudio(seen)
    expect(mod.sceneNeedsOwnGesture()).toBe(true)
    mod.unlockSceneAudio()
    expect(plays.length).toBeGreaterThan(0)
    expect(speaks.length).toBe(0) // синтез устройства выключен (SCENE_DEVICE_SYNTH) — speechSynthesis не трогаем вовсе
    expect(mod.sceneNeedsOwnGesture()).toBe(false)
    expect(seen).toHaveBeenCalled()
  })
})

describe('вне iOS жест на видео открывает аудио сцен как раньше', () => {
  it('Android: unlockSceneAudioFromVideoGesture играет wav (speak не зовёт — синтез выключен)', async () => {
    stubEnv(ANDROID)
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 })
    await load()
    expect(mod.sceneUnlockDeferred()).toBe(false)
    expect(mod.unlockSceneAudioFromVideoGesture()).toBe(true)
    expect(plays.length).toBeGreaterThan(0)
    expect(speaks.length).toBe(0)
    expect(mod.sceneNeedsOwnGesture()).toBe(false)
  })
})
