import { describe, it, expect, vi, beforeEach } from 'vitest'

// Библиотека слов — одно слово keep; <audio> — пустышка, считаем запуски
vi.mock('../../../shared/lib/wordAudio/wordAudioApi.js', () => ({
  cachedWordAudio: () => new Map([['keep', { url: 'https://audio.test/keep.mp3' }]]),
}))
const plays = []
class FakeAudio {
  constructor(src) { this.src = src }
  play() { plays.push(this.src); return Promise.resolve() }
  pause() {}
  load() {}
}
globalThis.Audio = FakeAudio
const { playWord, setWordAudioMuted, releaseWordAudio } = await import('./wordAudioPlayer.js')

describe('беззвучный режим повторения глушит озвучку слов', () => {
  beforeEach(() => { releaseWordAudio(); plays.length = 0 })

  it('без беззвучного режима слово играет', () => {
    expect(playWord('keep')).toBe(true)
    expect(plays).toHaveLength(1)
  })

  it('«Не могу слушать»: тап по слову в таблице не звучит; звук вернули — снова звучит', () => {
    setWordAudioMuted(true)
    expect(playWord('keep')).toBe(false)
    expect(plays).toHaveLength(0)
    setWordAudioMuted(false)
    expect(playWord('keep')).toBe(true)
    expect(plays).toHaveLength(1)
  })

  it('выход из урока (release) возвращает звук — режим не «прилипает» к обычному плееру', () => {
    setWordAudioMuted(true)
    releaseWordAudio()
    expect(playWord('keep')).toBe(true)
  })
})
