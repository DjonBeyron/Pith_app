import { describe, it, expect, beforeEach, vi } from 'vitest'

// <audio> грузится по сети: play() не резолвится, пока «файл не придёт»; readyState/networkState — как у браузера в этот момент
const h = vi.hoisted(() => ({ downloading: true, resolvePlay: null, paused: 0 }))
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; this.duration = 0.4; this.volume = 1; this.paused = true; this.readyState = h.downloading ? 1 : 4; this.networkState = h.downloading ? 2 : 1 }
  play() {
    this.paused = false
    return new Promise((res, rej) => { h.resolvePlay = res; this.abort = () => rej(new Error('AbortError')) })
  }
  pause() { this.paused = true; h.paused++; this.abort?.() }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.Audio = FakeAudio
const { playSound, onSoundPlayed, setSoundsMuted, soundStats, SOUND_STALE_MS } = await import('./sounds.js')

describe('звук интерфейса, не успевший загрузиться по слабой сети, пропускается, а не «догоняет»', () => {
  beforeEach(() => { vi.useFakeTimers(); h.downloading = true; h.paused = 0; setSoundsMuted(false) })

  it('файл ещё качается и за SOUND_STALE_MS не стартовал — пауза, подписчик не будится, пропуск считается', async () => {
    const got = []
    const off = onSoundPlayed(n => got.push(n))
    const before = soundStats().stale
    playSound('answer-wrong')
    vi.advanceTimersByTime(SOUND_STALE_MS + 5)
    await vi.advanceTimersByTimeAsync(0)
    expect(h.paused).toBe(1)
    expect(soundStats().stale).toBe(before + 1)
    h.resolvePlay?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(got).toEqual([]) // звук так и не прозвучал «потом»
    off()
  })

  it('успел стартовать до порога — играет как обычно, таймер ничего не пропускает', async () => {
    const got = []
    const off = onSoundPlayed(n => got.push(n))
    const before = soundStats().stale
    playSound('typing-1')
    vi.advanceTimersByTime(SOUND_STALE_MS - 50)
    h.resolvePlay()
    await vi.advanceTimersByTimeAsync(0)
    vi.advanceTimersByTime(500)
    expect(got).toEqual(['typing-1'])
    expect(soundStats().stale).toBe(before)
    expect(h.paused).toBe(0)
    off()
  })

  it('элемент не качается по сети (готов или холодный старт iOS) — под пропуск не попадает', async () => {
    h.downloading = false
    const got = []
    const off = onSoundPlayed(n => got.push(n))
    playSound('message-in')
    vi.advanceTimersByTime(SOUND_STALE_MS * 3)
    h.resolvePlay()
    await vi.advanceTimersByTimeAsync(0)
    expect(got).toEqual(['message-in'])
    expect(h.paused).toBe(0)
    off()
  })
})
