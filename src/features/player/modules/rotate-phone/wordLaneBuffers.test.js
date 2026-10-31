import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prepareWords, playWordSlot, hasWordSlot, wordSlotInfo, releaseClips, wordBufferMs } from './wordLaneClips.js'
import { startCatLine } from './wordLaneCatSay.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { lineReadiness } from './wordLaneLineGate.js'
import { bufferOfUrl } from './wordLaneFetch.js'
import { setVoiceRate, setLessonMuted } from '../../lessonVolume.js'
import { makeFakeWebAudio } from '../../../../shared/lib/fakeWebAudio.js'
import { getGameCtx, gameCtxState } from '../../../../shared/lib/gameAudioCtx.js'

// Основной путь звука игры: AudioBuffer через Web Audio. «Подготовлен» = декодирован (слотов <audio> и пробуждения тишиной нет), старт мгновенный, рот кота — по факту старта, громкость — gain,
// запасной <audio> — когда буфера нет (декодирование не вышло / файл длиннее 20 с / скорость голоса не 1× / Web Audio выключен)
let fake, audios, n
const u = name => `https://r2/${name}-${n++}-${Math.random()}.mp3`
const stubAudio = (playImpl = () => Promise.resolve()) => vi.stubGlobal('Audio', class { constructor(src) { this.src = src; this.paused = true; audios.push(this) } setAttribute() {} play() { this.played = (this.played ?? 0) + 1; return playImpl() } pause() {} load() {} removeAttribute() {} })
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

beforeEach(() => {
  n = 0; audios = []
  fake = makeFakeWebAudio()
  vi.stubGlobal('AudioContext', fake.Ctx)
  vi.stubGlobal('window', { OfflineAudioContext: fake.Offline })
  vi.stubGlobal('localStorage', store())
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL() {} })
  Blob.prototype.arrayBuffer ??= () => Promise.resolve(new ArrayBuffer(8))
  stubAudio()
})
afterEach(() => { releaseClips(); setVoiceRate(1); setLessonMuted(false); vi.unstubAllGlobals() })

describe('подготовка: «подготовлен» = «декодирован»', () => {
  it('ни одного <audio>, ни одного пробуждения тишиной; буфер лежит рядом с замером голоса; готово — когда декодированы все', async () => {
    const a = u('a'), b = u('b')
    expect(await prepareWords([{ key: "i'm", url: a }, { key: 'trying', url: b }])).toBe(true)
    expect(audios).toHaveLength(0)
    expect(fake.decodes).toBe(2) // один decodeAudioData на файл: и замер голоса, и буфер
    expect(bufferOfUrl(a)).toBeTruthy()
    expect(hasWordSlot("i'm")).toBe(true)
    expect(wordSlotInfo("i'm")).toMatchObject({ exists: true, hasUrl: true, prepared: true, buffer: true, ms: 1200, wokeAt: 0, wokeErr: null })
    expect(wordBufferMs("i'm")).toBe(1200)
    expect(wordBufferMs("i'm", 1.5)).toBe(800) // скорость голоса укорачивает звук
    expect(wordBufferMs('нет такого')).toBe(0)
    expect(wordSlotInfo('нет такого')).toMatchObject({ exists: false, prepared: false })
  })

  it('повторная подготовка (пауза → «Продолжить») без сети и декодирования: буферы остаются, если release был с keepBuffers', async () => {
    const a = u('a')
    await prepareWords([{ key: 'try', url: a }])
    const fetches = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    vi.stubGlobal('fetch', fetches)
    releaseClips({ keepBuffers: true })
    expect(hasWordSlot('try')).toBe(true)
    expect(await prepareWords([{ key: 'try', url: a }])).toBe(true)
    expect(fetches).not.toHaveBeenCalled()
    expect(fake.decodes).toBe(1)
    releaseClips() // полный release: буферы и контекст отпущены
    expect(hasWordSlot('try')).toBe(false)
    expect(fake.ctxs.every(c => c.closed)).toBe(true)
  })

  it('«готово» не ждёт никаких пробуждений: даже если бы play() <audio> висел вечно — слотов нет', async () => {
    stubAudio(() => new Promise(() => {}))
    await expect(prepareWords([{ key: 'one', url: u('one') }])).resolves.toBe(true)
  })
})

describe('мгновенный старт, громкость, рот по старту', () => {
  it('playWordSlot: источник стартует синхронно (< 50 мс), onStart зовётся в тот же миг, исход «started»', async () => {
    await prepareWords([{ key: 'trying', url: u('t') }])
    getGameCtx().setState('running')
    const onStart = vi.fn(), onResult = vi.fn()
    expect(playWordSlot('trying', onResult, onStart)).toBe(true)
    expect(fake.sources).toHaveLength(1)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0]).toMatchObject({ play: 'started', source: 'buffer' })
    expect(onResult.mock.calls[0][0].ms).toBeLessThan(50)
    expect(fake.sources[0].gain).toBe(1)
  })

  it('«без звука» в уроке: источник идёт с gain 0 (время и рот на месте, звука нет)', async () => {
    await prepareWords([{ key: 'x', url: u('x') }])
    setLessonMuted(true)
    playWordSlot('x')
    expect(fake.sources[0].gain).toBe(0)
  })

  it('реплика кота: рот открывается по факту старта источника; длительность — по буферу, а не по метаданным реплики', async () => {
    const lines = normalizeLines({ lines: { your_turn: { text: 'Теперь твоя очередь', url: u('line'), duration: 2, words: null } } })
    await prepareWords([{ key: 'line:your_turn', url: lines.your_turn.url }])
    const speak = vi.fn(), hold = { holdFor: vi.fn() }, mute = vi.fn()
    const r = startCatLine({ id: 'your_turn', line: lines.your_turn, catApi: { current: { isUp: () => true, peek() {}, speak } }, listenerRef: { current: { mute } }, hold, log: () => {} })
    expect(r).toMatchObject({ ms: 1200, voiced: true }) // файл на 1,2 с, в метаданных 2 с — верим буферу
    expect(speak).toHaveBeenCalledTimes(1) // контекст running → старт и рот в одном синхронном вызове
    expect(speak.mock.calls[0][1]).toBe(1200)
    expect(hold.holdFor).toHaveBeenCalledWith(1200) // окно речи микрофона — по длительности буфера
    expect(fake.sources).toHaveLength(1)
  })

  it('контекст прерван: рот ждёт resume() и открывается только когда источник стартовал', async () => {
    const lines = normalizeLines({ lines: { your_turn: { text: 'Теперь твоя очередь', url: u('line'), duration: 2 } } })
    await prepareWords([{ key: 'line:your_turn', url: lines.your_turn.url }])
    getGameCtx().setState('interrupted')
    const speak = vi.fn()
    startCatLine({ id: 'your_turn', line: lines.your_turn, catApi: { current: { isUp: () => true, peek() {}, speak } }, listenerRef: { current: { mute() {} } }, hold: { holdFor() {} }, log: () => {} })
    expect(speak).not.toHaveBeenCalled()
    await flush()
    expect(speak).toHaveBeenCalledTimes(1)
    expect(fake.sources).toHaveLength(1)
  })

  it('контекст не запустился (resume висит): рот не двигается, причина — в журнале cat-line-silent и в исходе для «[cat-voice]»', async () => {
    vi.useFakeTimers()
    const lines = normalizeLines({ lines: { your_turn: { text: 'Теперь твоя очередь', url: u('line'), duration: 2 } } })
    const p = prepareWords([{ key: 'line:your_turn', url: lines.your_turn.url }])
    await vi.advanceTimersByTimeAsync(50); await p
    fake.resumeMode = 'hang'; getGameCtx().setState('interrupted')
    const speak = vi.fn(), log = vi.fn(), done = vi.fn()
    startCatLine({ id: 'your_turn', line: lines.your_turn, catApi: { current: { isUp: () => true, peek() {}, speak } }, listenerRef: { current: { mute() {} } }, hold: { holdFor() {} }, log, open: () => done })
    await vi.advanceTimersByTimeAsync(400)
    expect(speak).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ play: 'ctx-stuck' }))
    expect(log).toHaveBeenCalledWith('cat-line-silent', { id: 'your_turn', reason: 'ctx-stuck' })
    vi.useRealTimers()
  })
})

describe('запасной путь <audio>', () => {
  it('скорость голоса урока не 1×: у элемента тон сохраняется — слоты создаются и будятся, играет элемент; «готово» не ждёт их пробуждения', async () => {
    setVoiceRate(0.75)
    stubAudio(() => new Promise(() => {})) // пробуждение никогда не завершится
    const a = u('a')
    await expect(prepareWords([{ key: 'try', url: a }])).resolves.toBe(true)
    expect(audios).toHaveLength(1)
    expect(audios[0].played).toBe(1) // play тишины в жесте
    expect(bufferOfUrl(a)).toBeTruthy() // буфер тоже есть: если элемент не пригодится
  })

  it('скорость 1×, но декодирование не вышло: слот <audio> создаётся запасным, звук подставляется, играет он', async () => {
    fake.failDecode = true
    const a = u('a')
    await prepareWords([{ key: 'try', url: a }])
    await flush()
    expect(bufferOfUrl(a)).toBeNull()
    expect(audios).toHaveLength(1)
    expect(hasWordSlot('try')).toBe(true)
    expect(wordSlotInfo('try').buffer).toBeUndefined()
    const onStart = vi.fn()
    expect(playWordSlot('try', null, onStart)).toBe(true)
    expect(onStart).toHaveBeenCalled()
    expect(fake.sources).toHaveLength(0)
    expect(audios[0].played).toBeGreaterThanOrEqual(2)
  })

  it('файл длиннее 20 с остаётся на <audio>', async () => {
    fake.decodeSeconds = 25
    const a = u('long')
    await prepareWords([{ key: 'long', url: a }])
    await flush()
    expect(bufferOfUrl(a)).toBeNull()
    expect(audios).toHaveLength(1)
  })

  it('Web Audio выключен (pithy_game_web_audio_v1 = off): прежний путь — слоты будятся в жесте, буферов нет', async () => {
    localStorage.setItem('pithy_game_web_audio_v1', 'off')
    const a = u('a')
    const ready = prepareWords([{ key: 'try', url: a }])
    expect(audios).toHaveLength(1)
    expect(audios[0].played).toBe(1)
    await ready
    expect(bufferOfUrl(a)).toBeNull()
    expect(fake.decodes).toBe(1) // файл декодируется только ради замера голоса (где слово звучит) — буфером он не станет
  })
})

describe('готовность реплики (wordLaneLineGate) для буфера', () => {
  const trace = { inWindow: () => true, warmed: () => true }
  it('буфер декодирован и контекст не прерван — готово; interrupted — ждём resume(); суспенд не ждём (resume сделает старт звука)', async () => {
    const lines = normalizeLines({ lines: { your_turn: { text: 'x', url: u('l'), duration: 1 } } })
    await prepareWords([{ key: 'line:your_turn', url: lines.your_turn.url }])
    const gate = () => lineReadiness('your_turn', { trace, warm: { status: () => ({ lastInterruptAt: 0 }) } })
    expect(gameCtxState()).toBeNull()
    expect(gate()).toEqual({ ready: true, why: null })
    getGameCtx().setState('interrupted')
    expect(gate()).toMatchObject({ ready: false, why: expect.stringContaining('interrupted') })
    getGameCtx().setState('suspended')
    expect(gate().ready).toBe(true)
  })
})
