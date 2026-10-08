import { describe, it, expect, beforeEach } from 'vitest'

// <audio> — пустышка; play() успешен, длительность задаём снаружи
let nextDuration = 0.42
let rejectPlay = false
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; this.duration = nextDuration }
  play() { return rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve() }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.Audio = FakeAudio
const { playSound, onSoundPlayed, setSoundsMuted, setSoundFilter } = await import('./sounds.js')
const tick = () => new Promise(r => setTimeout(r, 0))

describe('onSoundPlayed: подписка на старт звука интерфейса (для свечения снизу чата)', () => {
  beforeEach(() => { nextDuration = 0.42; rejectPlay = false; setSoundsMuted(false) })

  it('после успешного play() подписчик получает имя и длительность в секундах', async () => {
    const got = []
    const off = onSoundPlayed((name, dur) => got.push([name, dur]))
    playSound('pin-message')
    await tick()
    expect(got).toEqual([['pin-message', 0.42]])
    off()
  })

  it('длительность ещё не известна (NaN) — приходит 0', async () => {
    nextDuration = NaN
    const got = []
    const off = onSoundPlayed((name, dur) => got.push(dur))
    playSound('lesson-locked')
    await tick()
    expect(got).toEqual([0])
    off()
  })

  it('отписка снимает слушателя; отказ play() и беззвучный режим подписчика не будят', async () => {
    let calls = 0
    const off = onSoundPlayed(() => { calls++ })
    off()
    playSound('xp-gain')
    await tick()
    expect(calls).toBe(0)
    const off2 = onSoundPlayed(() => { calls++ })
    rejectPlay = true
    playSound('level-up')
    await tick()
    expect(calls).toBe(0)
    rejectPlay = false
    setSoundsMuted(true)
    playSound('typing-1')
    await tick()
    expect(calls).toBe(0)
    off2()
  })
})

// Фильтр «пользователь отключил звук» (шестерёнка в шапке урока, lessonPrefs.js)
describe('setSoundFilter: отключённый пользователем звук не играет', () => {
  beforeEach(() => { nextDuration = 0.42; rejectPlay = false; setSoundsMuted(false); setSoundFilter(null) })

  it('без фильтра играет всё (по умолчанию пропускает всё)', async () => {
    const got = []
    const off = onSoundPlayed(name => got.push(name))
    playSound('typing-1')
    await tick()
    expect(got).toEqual(['typing-1'])
    off()
  })

  it('фильтр вернул false — play() не вызывается, свечение не будится; остальные звуки играют', async () => {
    const got = []
    const off = onSoundPlayed(name => got.push(name))
    setSoundFilter(name => name !== 'xp-gain')
    playSound('xp-gain')
    playSound('answer-correct')
    await tick()
    expect(got).toEqual(['answer-correct'])
    off()
  })

  it('setSoundFilter(null) снимает фильтр; не-функция тоже', async () => {
    const got = []
    const off = onSoundPlayed(name => got.push(name))
    setSoundFilter(() => false)
    setSoundFilter('мусор')
    playSound('level-up')
    await tick()
    expect(got).toEqual(['level-up'])
    off()
  })
})
