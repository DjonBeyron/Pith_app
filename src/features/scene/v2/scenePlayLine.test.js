import { describe, it, expect, vi } from 'vitest'
import { makeScenePlayLine, nextAudioUrl } from './scenePlayLine.js'
import { createDirector } from './directorCore.js'

// Сцена с озвучкой у двух реплик из трёх; аудио/синтез/кэш — подделки
const scene = {
  characters: { a: { voice: { pitch: 1, rate: 1.2 } }, b: { voice: { pitch: 1.3, rate: 1 } } },
  options: { loop: true },
  timeline: [
    { who: 'a', text: 'Раз два', audioUrl: 'https://r2/0.mp3', wordTimings: [{ word: 'Раз', start: 0, end: 0.3 }] },
    { who: 'b', text: 'Три', audioUrl: 'https://r2/1.mp3' },
    { who: 'a', text: 'Четыре пять' },
  ],
}

function harness(o = {}) {
  const log = []
  const els = { a: { m: 'closed', getAttribute() { return this.m }, setAttribute(k, v) { this.m = v } }, b: { m: 'closed', getAttribute() { return this.m }, setAttribute(k, v) { this.m = v } } }
  const cache = { store: {}, resolve: vi.fn(u => cache.store[u] ?? null), pin: vi.fn(), prefetch: vi.fn() }
  const audio = { id: 'audio' }
  let audioCbs = null, speechCbs = null
  const playAudio = vi.fn((line, el, cbs) => { log.push(`audio:${line.text}:${cbs.src ?? 'url'}:m${cbs.muted ? 1 : 0}:r${cbs.rate}`); audioCbs = cbs; return () => log.push(`audio-cancel:${line.text}`) })
  const speak = vi.fn((text, voice, cbs) => { log.push(`speech:${text}:r${voice.rate}:s${cbs.sound ? 1 : 0}`); speechCbs = cbs; return () => log.push(`speech-cancel:${text}`) })
  const opts = { sound: true, rate: 1, lowPower: false, audioSrcOf: null, ...o }
  const player = makeScenePlayLine({
    scene, opts: () => opts, getMouthEl: who => els[who], setMode: () => {}, cache, getAudio: () => audio,
    allowed: () => opts.allowed ?? true, speak, playAudio, timers: { setInterval: () => 1, clearInterval: () => {} },
  })
  return { player, log, els, cache, playAudio, speak, opts, audio: () => audioCbs, speech: () => speechCbs }
}

describe('scenePlayLine — один путь воспроизведения реплики', () => {
  it('реплика с audioUrl идёт файлом (muted по sound, rate), следующая подкачивается; без audioUrl — синтез', () => {
    const h = harness({ sound: false, rate: 1.5 })
    const onEnd = vi.fn()
    h.player.playLine(scene.timeline[0], 0, { onEnd })
    expect(h.log).toEqual(['audio:Раз два:url:m1:r1.5'])
    expect(h.cache.pin).toHaveBeenCalledWith('https://r2/0.mp3')
    expect(h.cache.prefetch).toHaveBeenCalledWith('https://r2/1.mp3')
    h.audio().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    h.player.playLine(scene.timeline[2], 2, { onEnd })
    expect(h.log.at(-1)).toBe('speech:Четыре пять:r1.7999999999999998:s0')
    expect(h.els.a.m).toBe('open') // рот циклом по словам
    h.speech().onEnd()
    expect(h.els.a.m).toBe('closed')
    expect(onEnd).toHaveBeenCalledTimes(2)
  })

  it('src — blob урока (audioSrcOf) главнее кэша; есть blob у следующей — её не подкачиваем; экономия трафика — тоже', () => {
    const h = harness({ audioSrcOf: u => (u === 'https://r2/0.mp3' ? 'blob:lesson' : u === 'https://r2/1.mp3' ? 'blob:next' : null) })
    h.cache.store['https://r2/0.mp3'] = 'blob:cache'
    h.player.playLine(scene.timeline[0], 0, { onEnd() {} })
    expect(h.log[0]).toBe('audio:Раз два:blob:lesson:m0:r1')
    expect(h.cache.prefetch).not.toHaveBeenCalled()
    const h2 = harness({ allowed: false })
    h2.cache.store['https://r2/1.mp3'] = 'blob:c1'
    h2.player.playLine(scene.timeline[1], 1, { onEnd() {} })
    expect(h2.log[0]).toBe('audio:Три:blob:c1:m0:r1')
    expect(h2.cache.prefetch).not.toHaveBeenCalled()
  })

  it('файл не завёлся (onFail) → синтез ЭТОЙ реплики; cancel глушит и файл, и синтез, рот закрыт', () => {
    const h = harness()
    const onEnd = vi.fn()
    const cancel = h.player.playLine(scene.timeline[1], 1, { onEnd })
    h.audio().onFail()
    expect(h.log).toEqual(['audio:Три:url:m0:r1', 'speech:Три:r1:s1'])
    expect(h.els.b.m).toBe('open')
    cancel()
    expect(h.log.slice(2)).toEqual(['audio-cancel:Три', 'speech-cancel:Три'])
    expect(h.els.b.m).toBe('closed')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('onFail синхронно внутри playAudio (нет элемента) — синтез не теряется при cancel', () => {
    const h = harness()
    h.playAudio.mockImplementationOnce((line, el, cbs) => { cbs.onFail(); return () => h.log.push('audio-cancel') })
    const cancel = h.player.playLine(scene.timeline[0], 0, { onEnd() {} })
    expect(h.speak).toHaveBeenCalledTimes(1)
    cancel()
    expect(h.log.at(-1)).toBe('speech-cancel:Раз два')
  })

  it('playOnce режиссёра («Ещё раз» в задании) идёт тем же playLine с тем же файлом', () => {
    const h = harness()
    const d = createDirector({ timeline: scene.timeline, loop: true, playLine: h.player.playLine })
    d.play()
    expect(h.log).toEqual(['audio:Раз два:url:m0:r1'])
    d.pause()
    d.playOnce(1)
    expect(h.log.slice(1)).toEqual(['audio-cancel:Раз два', 'audio:Три:url:m0:r1'])
    h.audio().onEnd()
    expect(d.getState()).toMatchObject({ status: 'paused', index: 1 })
    expect(h.playAudio).toHaveBeenCalledTimes(2)
  })

  it('nextAudioUrl: следующая, по кругу при loop, null в конце без loop', () => {
    expect(nextAudioUrl(scene.timeline, 0, false)).toBe('https://r2/1.mp3')
    expect(nextAudioUrl(scene.timeline, 1, false)).toBeNull() // у третьей реплики файла нет
    expect(nextAudioUrl(scene.timeline, 2, true)).toBe('https://r2/0.mp3')
    expect(nextAudioUrl(scene.timeline, 2, false)).toBeNull()
    expect(nextAudioUrl([], 0, true)).toBeNull()
  })

  it('откат на синтез/таймер больше не молчаливый: onFallback(null) на старте, { url, reason, kind, index } при отказе + лог', () => {
    const onFallback = vi.fn(); const logFallback = vi.fn()
    let cbs = null
    const player = makeScenePlayLine({
      scene, opts: () => ({ sound: true, rate: 1 }), getMouthEl: () => null, setMode: () => {}, onFallback, logFallback,
      cache: { resolve: () => null, pin() {}, prefetch() {} }, getAudio: () => ({}), allowed: () => false,
      speak: vi.fn(() => () => {}), playAudio: vi.fn((line, el, c) => { cbs = c; return () => {} }), timers: { setInterval: () => 1, clearInterval: () => {} },
    })
    player.playLine(scene.timeline[1], 1, { onEnd() {} })
    expect(onFallback).toHaveBeenCalledWith(null)
    cbs.onFail('media-error-4')
    const info = { url: 'https://r2/1.mp3', src: null, reason: 'media-error-4', kind: 'original', index: 1 }
    expect(onFallback).toHaveBeenLastCalledWith(info)
    expect(logFallback).toHaveBeenCalledWith(info)
    // без причины — 'unknown', чтобы плашка никогда не была пустой
    player.playLine(scene.timeline[0], 0, { onEnd() {} })
    cbs.onFail()
    expect(onFallback.mock.calls.at(-1)[0].reason).toBe('unknown')
  })
})
