import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  logSound, logElementSound, soundEvents, soundsBefore, soundsAfter, lastSoundAgo, summarizeSounds, fmtSoundsBefore, fmtAudioNote,
  installMediaPlayLog, soundProbe, SOUND_WINDOW_MS, _resetSoundLog,
} from './soundLog.js'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); _resetSoundLog() })
afterEach(() => vi.useRealTimers())

describe('кольцо звуковых событий страницы', () => {
  it('пишет {t, kind, src}; окно «до старта» — ровно 6 с, граница (at − 6000, at]', () => {
    expect(SOUND_WINDOW_MS).toBe(6000)
    logSound('audio-play', 'a', 100_000 - 6000) // ровно на границе — уже не входит
    logSound('unlock-wav', 'wav', 100_000 - 5999)
    logSound('audio-play', 'message-in', 100_000)
    logSound('audio-play', 'после', 100_001) // после старта — «во время записи»
    expect(soundsBefore(100_000).map(e => e.kind)).toEqual(['unlock-wav', 'audio-play'])
    expect(soundsAfter(100_000).map(e => e.src)).toEqual(['после'])
    expect(soundEvents()).toHaveLength(4)
  })

  it('время по умолчанию — Date.now (fake timers); звук пишется и по ходу таймеров', async () => {
    logSound('audio-play', 'x')
    await vi.advanceTimersByTimeAsync(3000)
    logSound('unlock-wav')
    expect(soundsBefore(Date.now()).map(e => e.kind)).toEqual(['audio-play', 'unlock-wav'])
    await vi.advanceTimersByTimeAsync(3500) // первое событие вышло из окна (6,5 с)
    expect(soundsBefore(Date.now()).map(e => e.kind)).toEqual(['unlock-wav'])
  })

  it('lastSoundAgo: сколько мс от последнего звука до старта; нет звуков в окне → null', () => {
    expect(lastSoundAgo(100_000)).toBe(null)
    logSound('audio-play', 'x', 99_660)
    expect(lastSoundAgo(100_000)).toBe(340)
    expect(lastSoundAgo(110_000)).toBe(null)
  })

  it('кольцо ограничено (60 событий), src обрезается', () => {
    for (let i = 0; i < 100; i++) logSound('audio-play', 'x'.repeat(100), 100_000 + i)
    expect(soundEvents()).toHaveLength(60)
    expect(soundEvents()[0].src).toHaveLength(40)
  })
})

describe('сводка и подписи', () => {
  it('«unlock-wav×2, audio-play» — порядок по первому появлению, счётчик только если > 1', () => {
    const ev = [{ kind: 'unlock-wav' }, { kind: 'audio-play' }, { kind: 'unlock-wav' }]
    expect(summarizeSounds(ev)).toBe('unlock-wav×2, audio-play')
    expect(summarizeSounds([])).toBe('')
    expect(summarizeSounds(null)).toBe('')
    expect(summarizeSounds([{ kind: 'audiocontext', src: 'capture' }, { kind: 'audiocontext', src: 'resume' }])).toBe('audiocontext(capture), audiocontext')
  })
  it('fmtSoundsBefore / fmtAudioNote: «звуки до записи: …», «нет», старая запись → пусто', () => {
    expect(fmtSoundsBefore({})).toBe('')
    expect(fmtSoundsBefore({ audioBefore: '' })).toBe('звуки до записи: нет')
    expect(fmtSoundsBefore({ audioBefore: 'unlock-wav×2, audio-play', audioAgo: 340 })).toBe('звуки до записи: unlock-wav×2, audio-play (−340 мс)')
    expect(fmtAudioNote({})).toBe('')
    expect(fmtAudioNote({ audioBefore: 'audio-play', audioAgo: 10, audioDuring: 'audio-play', audioSession: 'auto→play-and-record' }))
      .toBe('звуки до записи: audio-play (−10 мс) · во время записи: audio-play · аудиосессия: auto→play-and-record')
    expect(fmtAudioNote({ audioSession: 'auto' })).toBe('аудиосессия: auto')
  })
  it('soundProbe — адаптер для контроллера', () => {
    logSound('unlock-wav', 'wav', 99_800)
    logSound('audio-play', 'x', 100_050)
    expect(soundProbe.before(100_000)).toEqual({ text: 'unlock-wav', ago: 200 })
    expect(soundProbe.during(100_000)).toBe('audio-play')
  })
})

describe('журнал чужих <audio>/<video>: обёртка HTMLMediaElement.prototype.play', () => {
  const makeProto = () => ({ play() { return Promise.resolve(this.reject ? Promise.reject(new Error('NotAllowed')) : undefined) } })

  it('ставится один раз; uninstall возвращает исходный play; без прототипа — null', () => {
    const proto = makeProto()
    const orig = proto.play
    const off = installMediaPlayLog(proto)
    expect(typeof off).toBe('function')
    expect(proto.play).not.toBe(orig)
    expect(installMediaPlayLog(proto)).toBe(null)
    off()
    expect(proto.play).toBe(orig)
    expect(installMediaPlayLog(null)).toBe(null)
    expect(installMediaPlayLog({})).toBe(null)
  })

  it('удавшийся play() <audio> → audio-play «другой: …», звучащее <video> → video-play; muted игнорируется; результат play() не меняется', async () => {
    const proto = makeProto()
    installMediaPlayLog(proto)
    const r1 = proto.play.call({ tagName: 'AUDIO', currentSrc: 'https://cdn.test/voice.mp3' })
    await r1
    await proto.play.call({ tagName: 'VIDEO', src: 'a/clip.mp4', muted: false })
    await proto.play.call({ tagName: 'VIDEO', src: 'a/loop.mp4', muted: true })
    expect(r1).toBeInstanceOf(Promise)
    expect(soundEvents().map(e => [e.kind, e.src])).toEqual([['audio-play', 'другой: voice.mp3'], ['video-play', 'другой: clip.mp4']])
  })

  it('отказ автозапуска (NotAllowedError) не пишется, но исключение доходит до вызывающего как раньше', async () => {
    const proto = makeProto()
    installMediaPlayLog(proto)
    await expect(proto.play.call({ tagName: 'AUDIO', reject: true, src: 'x.mp3' })).rejects.toThrow('NotAllowed')
    expect(soundEvents()).toHaveLength(0)
  })

  it('элемент, уже записанный явным хуком (<2 с), не дублируется; через 2 с — записывается', async () => {
    const proto = makeProto()
    installMediaPlayLog(proto)
    const el = { tagName: 'AUDIO', src: 'x.mp3' }
    logElementSound('audio-play', 'message-in', el)
    await proto.play.call(el)
    expect(soundEvents()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2100)
    await proto.play.call(el)
    expect(soundEvents()).toHaveLength(2)
  })
})
