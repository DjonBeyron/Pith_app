import { describe, it, expect, vi } from 'vitest'
import { makeScenePlayLine, nextAudioUrls, nextAudioUrl } from './scenePlayLine.js'

// Реплика-шаблон с segments в режиссёре: цепочка частей, откат на синтез всей строки (en-US), перевод, отмена
const part = (text, n, extra = {}) => ({ text, audioUrl: `https://r2/${n}.mp3`, wordTimings: [{ word: text, start: 0.1, end: 0.5 }], ...extra })
const full = { who: 'a', text: 'Can I have cheese, please?', translation: 'Можно мне сыр?', segments: [part('Can I have', 1), { ...part('cheese', 2), word: true }, part(', please?', 3)] }
const missing = { ...full, segments: [full.segments[0], { text: 'cheese', word: true }, full.segments[2]] }
const plain = { who: 'a', text: 'Hello there.', audioUrl: 'https://r2/p.mp3' }
const scene = { characters: { a: { voice: { pitch: 1, rate: 1 } } }, options: { loop: false }, timeline: [full, plain] }

function harness(over = {}, o = {}) {
  const log = []
  const el = { m: 'closed', getAttribute() { return this.m }, setAttribute(k, v) { this.m = v } }
  const cache = { store: {}, resolve: vi.fn(u => cache.store[u] ?? null), pin: vi.fn(), prefetch: vi.fn() }
  let chainCbs = null, speechCbs = null
  const cancelChain = vi.fn()
  const playChain = vi.fn((plan, audio, cbs) => { chainCbs = cbs; log.push(`chain:${plan.parts.map(p => p.text).join('|')}:m${cbs.muted ? 1 : 0}:r${cbs.rate}`); return cancelChain })
  const playAudio = vi.fn(line => { log.push(`audio:${line.text}`); return () => {} })
  const speak = vi.fn((text, voice, cbs) => { log.push(`speech:${text}:${cbs.lang}`); speechCbs = cbs; return () => log.push('speech-cancel') })
  const speakTranslation = vi.fn((text, voice, cbs) => { log.push(`tr:${text}`); cbs.onEnd?.(); return () => {} })
  const opts = { sound: true, rate: 1, lowPower: false, audioSrcOf: null, ...o }
  const logFallback = vi.fn(); const onFallback = vi.fn()
  const player = makeScenePlayLine({
    scene: { ...scene, ...over }, opts: () => opts, getMouthEl: () => el, setMode: () => {}, cache, getAudio: () => ({ id: 'main' }), getSpare: () => ({ id: 'spare' }),
    allowed: () => true, speak, speakTranslation, playAudio, playChain, logFallback, onFallback, timers: { setInterval: () => 1, clearInterval: () => {} },
  })
  return { player, log, cache, playChain, speak, speakTranslation, logFallback, onFallback, chain: () => chainCbs, speech: () => speechCbs, cancelChain, el }
}

describe('scenePlayLine — реплика с segments', () => {
  it('у всех частей есть файлы → цепочка (не audioUrl целой реплики, не синтез); части подкачиваются, первая закреплена', () => {
    const h = harness({}, { rate: 1.25, sound: false })
    const onEnd = vi.fn()
    h.player.playLine(full, 0, { onEnd })
    expect(h.log).toEqual(['chain:Can I have|cheese|, please?:m1:r1.25'])
    expect(h.speak).not.toHaveBeenCalled()
    for (const n of [1, 2, 3]) expect(h.cache.prefetch).toHaveBeenCalledWith(`https://r2/${n}.mp3`)
    expect(h.cache.prefetch).toHaveBeenCalledWith('https://r2/p.mp3') // следующая реплика
    expect(h.playChain.mock.calls[0][2].spare).toEqual({ id: 'spare' })
  })

  it('srcOf: blob урока → кэш подкачки → null; lowPower пробрасывается', () => {
    const h = harness({}, { audioSrcOf: u => (u.endsWith('1.mp3') ? 'blob:lesson' : null), lowPower: true })
    h.cache.store['https://r2/2.mp3'] = 'blob:cache'
    h.player.playLine(full, 0, { onEnd() {} })
    const cbs = h.playChain.mock.calls[0][2]
    expect(cbs.srcOf('https://r2/1.mp3')).toBe('blob:lesson')
    expect(cbs.srcOf('https://r2/2.mp3')).toBe('blob:cache')
    expect(cbs.srcOf('https://r2/3.mp3')).toBeNull()
    expect(cbs.lowPower).toBe(true)
  })

  it('конец цепочки → перевод (синтез ru), потом onEnd; звук и озвучка перевода включены', () => {
    const h = harness({ options: { voice: { translation: true } } })
    const onEnd = vi.fn()
    h.player.playLine(full, 0, { onEnd })
    h.chain().onEnd()
    expect(h.log.at(-1)).toBe('tr:Можно мне сыр?')   // translationAudioUrl нет — запасной синтез перевода
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('у слова нет озвучки в библиотеке → вся реплика синтезом по всей строке text, английский язык; цепочка не создаётся', () => {
    const h = harness()
    const onEnd = vi.fn()
    h.player.playLine(missing, 0, { onEnd })
    expect(h.playChain).not.toHaveBeenCalled()
    expect(h.log).toEqual(['speech:Can I have cheese, please?:en-US'])
    expect(h.logFallback).toHaveBeenCalledWith(expect.objectContaining({ reason: 'segments-word-no-audio', text: 'cheese', url: '' }))
    expect(h.onFallback).toHaveBeenCalledWith(expect.objectContaining({ reason: 'segments-word-no-audio' }))
    expect(h.el.m).toBe('open') // рот по словам синтеза
    h.speech().onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('цепочка не завелась до начала звука (onFail) → синтез всей строки', () => {
    const h = harness()
    h.player.playLine(full, 0, { onEnd() {} })
    h.chain().onFail('not-allowed')
    expect(h.log.at(-1)).toBe('speech:Can I have cheese, please?:en-US')
    expect(h.onFallback).toHaveBeenCalledWith(expect.objectContaining({ reason: 'not-allowed', kind: 'original', index: 0 }))
  })

  it('отмена реплики останавливает цепочку; поздний onEnd не двигает диалог дальше', () => {
    const h = harness()
    const onEnd = vi.fn()
    const cancel = h.player.playLine(full, 0, { onEnd })
    cancel()
    expect(h.cancelChain).toHaveBeenCalledTimes(1)
    h.chain().onEnd()
    expect(onEnd).not.toHaveBeenCalled()
    expect(h.el.m).toBe('closed')
  })

  it('once («Ещё раз»): цепочка без перевода; обычная реплика по-прежнему идёт файлом, а не цепочкой', () => {
    const h = harness({ options: { voice: { translation: true } } })
    const onEnd = vi.fn()
    h.player.playLine(full, 0, { onEnd, once: true })
    h.chain().onEnd()
    expect(h.speakTranslation).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledTimes(1)
    h.player.playLine(plain, 1, { onEnd })
    expect(h.log.at(-1)).toBe('audio:Hello there.')
    expect(h.playChain).toHaveBeenCalledTimes(1)
  })
})

describe('nextAudioUrls', () => {
  it('следующая реплика-шаблон — файлы её сегментов, обычная — audioUrl; nextAudioUrl — первая ссылка', () => {
    const tl = [plain, full, { who: 'a', text: 'x' }]
    expect(nextAudioUrls(tl, 0, false)).toEqual(['https://r2/1.mp3', 'https://r2/2.mp3', 'https://r2/3.mp3'])
    expect(nextAudioUrls(tl, 1, false)).toEqual([])
    expect(nextAudioUrls(tl, 2, true)).toEqual(['https://r2/p.mp3'])
    expect(nextAudioUrl(tl, 0, false)).toBe('https://r2/1.mp3')
    expect(nextAudioUrl([], 0, false)).toBeNull()
  })
})
