import { describe, it, expect, beforeEach, vi } from 'vitest'

// Громкость звуков интерфейса: 1 → путь <audio>; <1 + audioSession → Web Audio
// (GainNode); <1 без audioSession → audio.volume
const created = []
const el = name => created.find(a => a.src.includes(name))   // элементы живут в кэше sounds.js между тестами
const played = name => el(name)?.played ?? 0
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; this.duration = 0.42; this.volume = 1; this.paused = true; created.push(this) }
  play() { this.played = (this.played ?? 0) + 1; return Promise.resolve() }
  pause() {}
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
const graph = []   // созданные источники: { buffer, gain, started }
let decodeCount = 0
class FakeCtx {
  constructor() { this.state = 'running'; this.destination = { id: 'dest' } }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { return Promise.resolve() }
  decodeAudioData() { decodeCount++; return Promise.resolve({ duration: 1.5 }) }
  createGain() { return { gain: { value: 1 }, connect(n) { this.to = n } } }
  createBufferSource() {
    const src = { buffer: null, connect(n) { this.to = n }, start() { this.started = true } }
    graph.push(src)
    return src
  }
}
globalThis.Audio = FakeAudio
globalThis.window = { AudioContext: FakeCtx }
globalThis.document = { documentElement: { classList: { toggle() {} } }, addEventListener() {}, removeEventListener() {} }
globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))

const { playSound, preloadSounds, onSoundPlayed, setSoundsMuted, setSoundVolumes, getSoundVolume, ALL_SOUNDS } = await import('./sounds.js')
const { volumeUnsupported, canGainPlay } = await import('./soundVolume.js')
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const setNav = nav => vi.stubGlobal('navigator', nav)

beforeEach(() => {
  graph.length = 0; decodeCount = 0
  setSoundsMuted(false); setSoundVolumes({})
  setNav({ userAgent: 'Mozilla/5.0 (X11; Linux)', platform: 'Linux', maxTouchPoints: 0 })
})

describe('громкость звуков интерфейса', () => {
  it('нет значения = 1; setSoundVolumes заменяет состояние, ≥1 и мусор отбрасываются', () => {
    expect(getSoundVolume('xp-gain')).toBe(1)
    setSoundVolumes({ 'xp-gain': 0.5, 'level-up': 1, 'pin-message': 'x', 'answer-wrong': 7 })
    expect(getSoundVolume('xp-gain')).toBe(0.5)
    expect(getSoundVolume('level-up')).toBe(1)
    expect(getSoundVolume('pin-message')).toBe(1)
    expect(getSoundVolume('answer-wrong')).toBe(1)
    setSoundVolumes({})
    expect(getSoundVolume('xp-gain')).toBe(1)
    expect(ALL_SOUNDS).toHaveLength(9)
  })

  it('громкость 1 → прежний путь <audio>, Web Audio не трогаем (даже с audioSession)', async () => {
    setNav({ userAgent: 'iPhone', platform: 'iPhone', audioSession: { type: 'auto' } })
    preloadSounds()
    const got = []
    const off = onSoundPlayed((n, d) => got.push([n, d]))
    playSound('message-in')
    await flush()
    expect(played('message-in')).toBe(1)
    expect(el('message-in').volume).toBe(1)
    expect(graph).toHaveLength(0)
    expect(navigator.audioSession.type).toBe('auto')
    expect(got).toEqual([['message-in', 0.42]])
    off()
  })

  it('0.5 + audioSession → Web Audio: источник → GainNode(0.5) → destination, audioSession.type = playback', async () => {
    setNav({ userAgent: 'iPhone', platform: 'iPhone', audioSession: { type: 'auto' } })
    preloadSounds()
    setSoundVolumes({ 'answer-correct': 0.5 })
    const before = played('answer-correct')
    const got = []
    const off = onSoundPlayed((n, d) => got.push([n, d]))
    playSound('answer-correct', 'тест')
    await flush()
    expect(graph).toHaveLength(1)
    const src = graph[0]
    expect(src.started).toBe(true)
    expect(src.buffer).toEqual({ duration: 1.5 })
    expect(src.to.gain.value).toBe(0.5)
    expect(src.to.to).toEqual({ id: 'dest' })
    expect(navigator.audioSession.type).toBe('playback')
    expect(played('answer-correct')).toBe(before)   // <audio> не играл
    expect(got).toEqual([['answer-correct', 1.5]])                       // onSoundPlayed с длительностью буфера
    off()
  })

  it('буфер декодируется один раз и кэшируется; источники создаются на каждый play', async () => {
    setNav({ userAgent: 'iPhone', platform: 'iPhone', audioSession: { type: 'auto' } })
    preloadSounds()
    setSoundVolumes({ 'level-up': 0.3 })
    await flush()
    const n0 = decodeCount
    playSound('level-up'); playSound('level-up')
    await flush()
    expect(decodeCount).toBe(n0)
    expect(graph).toHaveLength(2)
    expect(graph[0]).not.toBe(graph[1])
  })

  it('0.5 без audioSession → <audio>.volume = 0.5; на iPhone — пометка «не регулируется»', async () => {
    setNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)', platform: 'iPhone', maxTouchPoints: 5 })
    expect(canGainPlay()).toBe(false)
    expect(volumeUnsupported()).toBe(true)
    preloadSounds()
    setSoundVolumes({ 'pin-message': 0.5 })
    playSound('pin-message')
    await flush()
    expect(el('pin-message').volume).toBe(0.5)
    expect(played('pin-message')).toBe(1)
    expect(graph).toHaveLength(0)
    setNav({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 })
    expect(volumeUnsupported()).toBe(false)   // Android: <audio>.volume работает
  })

  it('вернули громкость 1 — <audio>.volume снова 1', async () => {
    preloadSounds()
    setSoundVolumes({ 'xp-gain': 0.4 })
    playSound('xp-gain')
    expect(el('xp-gain').volume).toBe(0.4)
    setSoundVolumes({})
    playSound('xp-gain')
    expect(el('xp-gain').volume).toBe(1)
  })

  it('Web Audio не удался (контекст не запускается) — откат на <audio>; беззвучный режим молчит', async () => {
    setNav({ userAgent: 'iPhone', platform: 'iPhone', audioSession: { type: 'auto' } })
    preloadSounds()
    fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 404 }))
    setSoundVolumes({ 'lesson-locked': 0.6 })
    playSound('lesson-locked')
    await flush()
    expect(graph).toHaveLength(0)
    expect(played('lesson-locked')).toBe(1)
    expect(el('lesson-locked').volume).toBe(0.6)
    setSoundsMuted(true)
    playSound('lesson-locked')
    await flush()
    expect(played('lesson-locked')).toBe(1)
    fetch.mockImplementation(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
  })
})
