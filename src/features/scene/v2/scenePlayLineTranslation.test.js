import { describe, it, expect, vi } from 'vitest'
import { makeScenePlayLine, speakTranslationFallback } from './scenePlayLine.js'
import { createDirector } from './directorCore.js'

// Последовательность «оригинал → перевод» одной реплики: все комбинации voice,
// отмена, откаты, рот закрыт во время перевода, once («Ещё раз»), подкачка.
const TR = 'https://r2/0-tr.mp3'
const base = {
  characters: { a: { voice: { pitch: 1, rate: 1 } }, b: { voice: { pitch: 1.3, rate: 1 } } },
  options: { loop: false },
  timeline: [
    { who: 'a', text: 'Hi there.', translation: 'Привет.', audioUrl: 'https://r2/0.mp3', wordTimings: [{ word: 'Hi', start: 0, end: 0.3 }], translationAudioUrl: TR },
    { who: 'b', text: 'Yo.', translation: 'Йо.', audioUrl: 'https://r2/1.mp3' },  // перевод без файла
    { who: 'a', text: 'Bye.', audioUrl: 'https://r2/2.mp3' },                    // без перевода
  ],
}

function harness(o = {}, sceneOpts = {}) {
  const log = []
  const el = () => ({ m: 'closed', getAttribute() { return this.m }, setAttribute(k, v) { this.m = v } })
  const els = { a: el(), b: el() }
  const cache = { store: {}, resolve: vi.fn(u => cache.store[u] ?? null), pin: vi.fn(), prefetch: vi.fn() }
  const phases = []
  let audioCbs = null, speechCbs = null, trCbs = null
  const playAudio = vi.fn((line, _el, cbs) => {
    log.push(`audio:${line.text}:${cbs.src ?? 'url'}:m${cbs.muted ? 1 : 0}:r${cbs.rate}`)
    audioCbs = cbs
    cbs.applyMouth('open') // как mouthSync при старте слова
    return () => log.push(`audio-cancel:${line.text}`)
  })
  const speak = vi.fn((text, voice, cbs) => { log.push(`speech:${text}:s${cbs.sound ? 1 : 0}`); speechCbs = cbs; return () => log.push(`speech-cancel:${text}`) })
  const speakTranslation = vi.fn((text, voice, cbs) => { log.push(`tr-speech:${text}:s${cbs.sound ? 1 : 0}:r${voice.rate}`); trCbs = cbs; return () => log.push(`tr-speech-cancel:${text}`) })
  const opts = { sound: true, rate: 1, lowPower: false, audioSrcOf: null, voice: null, ...o }
  const scene = { ...base, options: { ...base.options, ...sceneOpts } }
  const timers = { setInterval: () => 1, clearInterval: () => {}, setTimeout: (fn) => { fn(); return 1 }, clearTimeout: () => {} }
  const player = makeScenePlayLine({
    scene, opts: () => opts, getMouthEl: who => els[who], setMode: () => {}, setPhase: p => phases.push(p), cache, getAudio: () => ({}),
    allowed: () => true, speak, speakTranslation, playAudio, timers,
  })
  return { scene, player, log, els, cache, phases, playAudio, speak, speakTranslation, opts, audio: () => audioCbs, speech: () => speechCbs, tr: () => trCbs }
}

describe('scenePlayLine — оригинал → перевод', () => {
  it('voice по умолчанию (original, без перевода): только оригинал, фаза original → null', () => {
    const h = harness()
    const onEnd = vi.fn()
    h.player.playLine(h.scene.timeline[0], 0, { onEnd })
    expect(h.log).toEqual(['audio:Hi there.:url:m0:r1'])
    expect(h.cache.prefetch).toHaveBeenCalledWith('https://r2/1.mp3')
    expect(h.cache.prefetch).not.toHaveBeenCalledWith(TR) // перевод выключен — не качаем
    h.audio().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(h.phases).toEqual(['original', null])
  })

  it('original + translation: после файла оригинала — файл перевода (рот закрыт, фаза translation), затем onEnd; перевод подкачивается', () => {
    const h = harness({}, { voice: { original: true, translation: true } })
    const onEnd = vi.fn()
    h.player.playLine(h.scene.timeline[0], 0, { onEnd })
    expect(h.cache.prefetch).toHaveBeenCalledWith(TR)
    expect(h.els.a.m).toBe('open')
    h.audio().onEnd()
    expect(onEnd).not.toHaveBeenCalled()
    expect(h.log).toEqual(['audio:Hi there.:url:m0:r1', 'audio:Привет.:url:m0:r1'])
    expect(h.els.a.m).toBe('closed') // диктор говорит — рот кота закрыт
    expect(h.cache.pin).toHaveBeenLastCalledWith(TR)
    expect(h.phases).toEqual(['original', 'translation'])
    h.audio().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(h.phases.at(-1)).toBeNull()
  })

  it('original=false: оригинал без звука (muted), рот двигается, длится как обычно; затем перевод со звуком', () => {
    const h = harness({}, { voice: { original: false, translation: true } })
    h.player.playLine(h.scene.timeline[0], 0, { onEnd() {} })
    expect(h.log).toEqual(['audio:Hi there.:url:m1:r1'])
    expect(h.els.a.m).toBe('open')
    h.audio().onEnd()
    expect(h.log.at(-1)).toBe('audio:Привет.:url:m0:r1')
    // реплика без файла и без звука оригинала — таймер (speak c sound=false), рот циклом
    const h2 = harness({}, { voice: { original: false, translation: false } })
    h2.player.playLine({ who: 'b', text: 'No file.' }, 1, { onEnd() {} })
    expect(h2.log).toEqual(['speech:No file.:s0'])
    expect(h2.els.b.m).toBe('open')
  })

  it('оба выключены: оригинал немой, перевода нет — реплика заканчивается после оригинала', () => {
    const h = harness({}, { voice: { original: false, translation: false } })
    const onEnd = vi.fn()
    h.player.playLine(h.scene.timeline[0], 0, { onEnd })
    expect(h.log).toEqual(['audio:Hi there.:url:m1:r1'])
    h.audio().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(h.log).toHaveLength(1)
  })

  it('переопределение opts().voice главнее options сцены', () => {
    const h = harness({ voice: { translation: true } })
    h.player.playLine(h.scene.timeline[0], 0, { onEnd() {} })
    h.audio().onEnd()
    expect(h.log[1]).toBe('audio:Привет.:url:m0:r1')
    const h2 = harness({ voice: { translation: false } }, { voice: { translation: true } })
    const onEnd = vi.fn()
    h2.player.playLine(h2.scene.timeline[0], 0, { onEnd })
    h2.audio().onEnd()
    expect(onEnd).toHaveBeenCalled()
    expect(h2.log).toHaveLength(1)
  })

  it('перевод без файла → синтез ru-RU со скоростью сцены; файл перевода не завёлся (onFail) → тоже синтез', () => {
    const h = harness({ rate: 1.5 }, { voice: { translation: true } })
    const onEnd = vi.fn()
    h.player.playLine(h.scene.timeline[1], 1, { onEnd })
    h.audio().onEnd()
    expect(h.log.at(-1)).toBe('tr-speech:Йо.:s1:r1.5')
    h.tr().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    const h2 = harness({}, { voice: { translation: true } })
    h2.player.playLine(h2.scene.timeline[0], 0, { onEnd() {} })
    h2.audio().onEnd()
    h2.audio().onFail()
    expect(h2.log.slice(1)).toEqual(['audio:Привет.:url:m0:r1', 'tr-speech:Привет.:s1:r1'])
  })

  it('«без звука»: оба файла muted; перевод без файла — запасной вариант получает sound=false (пропустит)', () => {
    const h = harness({ sound: false }, { voice: { translation: true } })
    h.player.playLine(h.scene.timeline[0], 0, { onEnd() {} })
    h.audio().onEnd()
    expect(h.log).toEqual(['audio:Hi there.:url:m1:r1', 'audio:Привет.:url:m1:r1'])
    const h2 = harness({ sound: false }, { voice: { translation: true } })
    h2.player.playLine(h2.scene.timeline[1], 1, { onEnd() {} })
    h2.audio().onEnd()
    expect(h2.log.at(-1)).toBe('tr-speech:Йо.:s0:r1')
  })

  it('реплика без translation при включённом переводе — только оригинал', () => {
    const h = harness({}, { voice: { translation: true } })
    const onEnd = vi.fn()
    h.player.playLine(h.scene.timeline[2], 2, { onEnd })
    h.audio().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(h.log).toEqual(['audio:Bye.:url:m0:r1'])
  })

  it('cancel во время перевода гасит перевод (и не трогает уже законченный оригинал), рот закрыт, фаза null; onEnd не зовётся', () => {
    const h = harness({}, { voice: { translation: true } })
    const onEnd = vi.fn()
    const cancel = h.player.playLine(h.scene.timeline[0], 0, { onEnd })
    h.audio().onEnd()
    cancel()
    expect(h.log.slice(2)).toEqual(['audio-cancel:Hi there.', 'audio-cancel:Привет.'])
    expect(h.els.a.m).toBe('closed')
    expect(h.phases.at(-1)).toBeNull()
    expect(onEnd).not.toHaveBeenCalled()
    // отмена посреди оригинала — перевод даже не начинается
    const h2 = harness({}, { voice: { translation: true } })
    const c2 = h2.player.playLine(h2.scene.timeline[0], 0, { onEnd })
    c2()
    expect(h2.log).toEqual(['audio:Hi there.:url:m0:r1', 'audio-cancel:Hi there.'])
    h2.audio().onEnd() // поздний конец оригинала после отмены — перевод не стартует
    expect(h2.log).toHaveLength(2)
  })

  it('once («Ещё раз» в задании): только оригинал со звуком, перевод не играет даже при voice.translation и original=false', () => {
    const h = harness({}, { voice: { original: false, translation: true } })
    const d = createDirector({ timeline: h.scene.timeline, playLine: h.player.playLine })
    d.playOnce(0)
    expect(h.log).toEqual(['audio:Hi there.:url:m0:r1'])
    h.audio().onEnd()
    expect(d.getState()).toMatchObject({ status: 'paused', index: 0 })
    expect(h.log).toHaveLength(1)
    // обычная игра той же сцены — немой оригинал и перевод
    d.play()
    expect(h.log.at(-1)).toBe('audio:Hi there.:url:m1:r1')
    h.audio().onEnd()
    expect(h.log.at(-1)).toBe('audio:Привет.:url:m0:r1')
  })

  it('режиссёр: после перевода идёт следующая реплика', () => {
    const h = harness({}, { voice: { translation: true } })
    const d = createDirector({ timeline: h.scene.timeline, playLine: h.player.playLine })
    d.play()
    h.audio().onEnd(); h.audio().onEnd()
    expect(d.getState().index).toBe(1)
    expect(h.log.at(-1)).toBe('audio:Yo.:url:m0:r1')
  })
})

describe('speakTranslationFallback', () => {
  it('без звука — конец сразу, синтез не трогается; без русского голоса — тоже', () => {
    const onEnd = vi.fn()
    const cancel = speakTranslationFallback('Привет.', { pitch: 1, rate: 1 }, { sound: false, onEnd })
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(typeof cancel).toBe('function')
    const onEnd2 = vi.fn()
    speakTranslationFallback('Привет.', { pitch: 1, rate: 1 }, { sound: true, onEnd: onEnd2 }) // в node нет speechSynthesis → нет голоса
    expect(onEnd2).toHaveBeenCalledTimes(1)
  })
})
