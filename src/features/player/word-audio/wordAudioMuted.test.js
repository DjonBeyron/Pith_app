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
const { playWord, stopWord, setWordAudioMuted, releaseWordAudio } = await import('./wordAudioPlayer.js')
const { holdSilence, holdSoundQuiet, _resetSoundQuiet } = await import('../../../shared/lib/soundQuiet.js')

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

describe('stopWord и смена слова', () => {
  beforeEach(() => { releaseWordAudio(); plays.length = 0 })

  it('слово без озвучки (null) не останавливает прежнее само — это делает stopWord', () => {
    expect(playWord('keep', { onEnded: () => plays.push('ended') })).toBe(true)
    expect(playWord(null)).toBe(false)
    expect(plays).toEqual(['https://audio.test/keep.mp3'])
    stopWord()
    expect(plays).toEqual(['https://audio.test/keep.mp3', 'ended'])
  })

  it('новое слово глушит предыдущее (onEnded прежнего зовётся)', () => {
    const ended = []
    playWord('keep', { onEnded: () => ended.push(1) })
    playWord('keep')
    expect(ended).toEqual([1])
  })
})

describe('озвучка молчит, пока идёт запись голоса / открыта вкладка «Голос» (soundQuiet.js)', () => {
  beforeEach(() => { releaseWordAudio(); plays.length = 0; _resetSoundQuiet() })

  it('holdSilence: тап по слову ничего не играет; после снятия — снова звучит', () => {
    const release = holdSilence('admin-voice')
    expect(playWord('keep')).toBe(false)
    expect(plays).toHaveLength(0)
    release()
    expect(playWord('keep')).toBe(true)
    expect(plays).toHaveLength(1)
  })

  it('окно записи модуля (holdSoundQuiet) тоже глушит озвучку; stopWord безопасен', () => {
    const release = holdSoundQuiet()
    expect(playWord('keep')).toBe(false)
    stopWord()
    release()
    expect(plays).toHaveLength(0)
  })
})
