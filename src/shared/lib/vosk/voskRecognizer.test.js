import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRecognizer, voskErrorCode, SAY_AUTOSTOP_MS, SAY_FULL_MS, SAY_MAX_MS, SAY_SILENCE_MS, SAY_STOP_FORCE_MS, SAY_CHUNK } from './voskRecognizer.js'
import { createRmsLevel } from './sayVoskLevel.js'
import { startListening } from './voskEngine.js'
import { readSayData } from '../speech/sayPhraseData.js'

// Адаптер «Vosk как распознаватель» на подставном движке (listen) — без настоящей модели, микрофона и воркера
const data = readSayData({ phrase: "I'm trying", keywords: 'trying' })
const w = (word, conf = 0.9) => ({ word, conf, start: 0, end: 1 })

function make(over = {}) {
  const views = []
  const handle = { stop: vi.fn(), cancel: vi.fn() }
  const ctl = { cb: null, opts: null, grammar: null, model: null, reject: null, resolve: null }
  const listen = vi.fn((model, grammar, cb, opts) => {
    Object.assign(ctl, { cb, opts, grammar, model })
    return new Promise((res, rej) => { ctl.resolve = () => res(handle); ctl.reject = rej })
  })
  const level = createRmsLevel()
  const onFail = vi.fn()
  const runtime = { getModel: () => ({ id: 'm' }) }
  const rec = createVoskRecognizer({ runtime, level, listen, onFail, onView: v => views.push(v), getSession: () => 'play-and-record', ...over })
  const last = () => views.at(-1)
  const ready = async () => { ctl.resolve(); await Promise.resolve(); await Promise.resolve(); ctl.cb.onReady({ micMs: 5 }) }
  return { rec, views, handle, ctl, listen, level, onFail, last, ready }
}

describe('voskRecognizer: интерфейс и виды как у speechController', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('start: движок запускается СИНХРОННО в тапе (до любого await), грамматика из полей шага, авто-стоп 2,5 с (вся фраза услышана — 0,8 с), затвор тишины, потолок 20 с, аудиосессия из настройки, кусок 2048', () => {
    const t = make()
    t.rec.start({ reference: data.phrase, lang: 'en-US', data })
    expect(t.listen).toHaveBeenCalledTimes(1) // getUserMedia внутри listen вызывается в этом же стеке — жест не потерян
    expect(JSON.parse(t.ctl.grammar)).toEqual(["i'm trying", 'i am trying', "i'm try", 'i am try', "i'm tried", 'i am tried', "i'm tries", 'i am tries', '[unk]'])
    expect(t.ctl.opts).toMatchObject({ autoStopMs: SAY_AUTOSTOP_MS, completeMs: SAY_FULL_MS, maxMs: SAY_MAX_MS, session: 'play-and-record', chunk: SAY_CHUNK, gate: true })
    expect(t.ctl.opts.isComplete("I'm trying")).toBe(true); expect(t.ctl.opts.isComplete("i'm try")).toBe(false) // «вся фраза услышана» — по эталону
    expect(t.ctl.opts.cleanPartial('I’M [unk]')).toBe("i'm")
    expect([SAY_AUTOSTOP_MS, SAY_FULL_MS, SAY_MAX_MS, SAY_SILENCE_MS, SAY_STOP_FORCE_MS, SAY_CHUNK]).toEqual([2500, 800, 20000, 8000, 2500, 2048])
    expect(t.last()).toMatchObject({ status: 'starting', phase: 'permission', attempt: 1, runNo: 1, reference: "I'm trying", lang: 'en-US' })
    expect(t.rec.isRunning()).toBe(true); expect(t.rec.isAudioActive()).toBe(false)
  })

  it('onReady → listening (аналог audiostart): круг можно останавливать; onLevel кормит источник уровня', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    await t.ready()
    expect(t.last()).toMatchObject({ status: 'listening', phase: 'audio' }); expect(t.rec.isAudioActive()).toBe(true)
    t.ctl.cb.onLevel(0.2)
    expect(t.level.read()).toBeGreaterThan(0)
  })

  it('partial: нижний регистр, апострофы, [unk] убран; повтор того же текста не плодит видов и записей истории; история {t,text}', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    await t.ready()
    await vi.advanceTimersByTimeAsync(300)
    t.ctl.cb.onPartial('I’M [unk]'); t.ctl.cb.onPartial("i'm"); t.ctl.cb.onPartial('')
    const n = t.views.length
    await vi.advanceTimersByTimeAsync(200)
    t.ctl.cb.onPartial("i'm try")
    expect(t.views.length).toBe(n + 1)
    expect(t.last()).toMatchObject({ interim: "i'm try", lastInterim: "i'm try" })
    expect(t.last().history).toEqual([{ t: 300, text: "i'm" }, { t: 500, text: "i'm try" }])
  })

  it('итог: слова ниже порога 0.3 и [unk] не засчитываются; final.text/confidence, alternatives, lastInterim = итог, speechend перед финалом; движок сам освободился — cancel не зовём', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    await t.ready()
    await vi.advanceTimersByTimeAsync(900)
    t.ctl.cb.onPartial("i'm try")
    await vi.advanceTimersByTimeAsync(800)
    t.ctl.cb.onResult("I’m try [unk]", { words: [w("i'm", 0.95), w('try', 0.85), w('[unk]', 1), w('please', 0.1)], afterStopMs: 20, stopBy: 'auto' })
    const v = t.last()
    expect(v).toMatchObject({ status: 'done', error: null, interim: '', lastInterim: "i'm try", usedInterim: false })
    expect(v.final).toEqual({ text: "i'm try", confidence: 0.9 }); expect(v.alternatives).toEqual([v.final])
    expect(v.history.map(h => h.kind ?? (h.final ? 'final' : 'partial'))).toEqual(['partial', 'speechend', 'final'])
    expect(v.history.at(-2).t).toBeLessThan(v.history.at(-1).t)
    expect(t.rec.isRunning()).toBe(false); expect(t.rec.isAudioActive()).toBe(false)
    expect(t.handle.cancel).not.toHaveBeenCalled()
  })

  it('всё распознанное — [unk] или ниже порога → для ученика «не слышу вас»: error no-speech (не успех и не сбой Vosk)', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.ctl.cb.onResult('[unk]', { words: [w('[unk]', 1)] })
    expect(t.last()).toMatchObject({ status: 'error', error: 'no-speech' }); expect(t.onFail).not.toHaveBeenCalled()
    const u = make(); u.rec.start({ reference: 'x', lang: 'en-US', data }); await u.ready()
    u.ctl.cb.onResult('', {}); expect(u.last()).toMatchObject({ status: 'error', error: 'no-speech' })
  })

  it('тишина: ни одного слова SAY_SILENCE_MS после открытия микрофона → сами просим итог; заговорили — таймер тишины снят', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    await vi.advanceTimersByTimeAsync(SAY_SILENCE_MS - 1); expect(t.handle.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2); expect(t.handle.stop).toHaveBeenCalledTimes(1)
    const u = make(); u.rec.start({ reference: 'x', lang: 'en-US', data }); await u.ready()
    await vi.advanceTimersByTimeAsync(3000); u.ctl.cb.onPartial("i'm")
    await vi.advanceTimersByTimeAsync(SAY_SILENCE_MS * 2); expect(u.handle.stop).not.toHaveBeenCalled()
  })

  it('stop() по тапу: просим итог; тап раньше, чем движок вернул управление, запоминается и применяется сразу после', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.rec.stop(); t.rec.stop()
    expect(t.handle.stop).toHaveBeenCalledTimes(1)
    const u = make(); u.rec.start({ reference: 'x', lang: 'en-US', data })
    u.rec.stop(); expect(u.handle.stop).not.toHaveBeenCalled()
    u.ctl.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(u.handle.stop).toHaveBeenCalledTimes(1)
  })

  it('после stop итог не пришёл за 2,5 с → принудительно освобождаем движок (микрофон, контекст, аудиосессия), error vosk-error, Vosk помечается сбойным', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.rec.stop()
    await vi.advanceTimersByTimeAsync(SAY_STOP_FORCE_MS + 1)
    expect(t.handle.cancel).toHaveBeenCalledTimes(1)
    expect(t.last()).toMatchObject({ status: 'error', error: 'vosk-error' })
    expect(t.onFail).toHaveBeenCalledWith('vosk-error', expect.stringContaining('итог не пришёл'))
    expect(t.rec.isRunning()).toBe(false)
  })

  it('ошибки микрофона: отказ → not-allowed (НЕ сбой Vosk, sayFlow уйдёт в запасной режим «отказ»); нет микрофона → audio-capture; прочее → vosk-error (оба — сбой Vosk)', async () => {
    const err = name => Object.assign(new Error(name), { name })
    for (const [name, code, fails] of [['NotAllowedError', 'not-allowed', false], ['NotFoundError', 'audio-capture', true], ['NotReadableError', 'audio-capture', true], ['TypeError', 'vosk-error', true]]) {
      const t = make()
      t.rec.start({ reference: 'x', lang: 'en-US', data })
      t.ctl.reject(err(name)); await Promise.resolve(); await Promise.resolve()
      expect(t.last(), name).toMatchObject({ status: 'error', error: code })
      expect(t.onFail.mock.calls.length > 0, name).toBe(fails)
    }
    expect(voskErrorCode({ name: 'SecurityError' })).toBe('not-allowed'); expect(voskErrorCode(null)).toBe('vosk-error')
  })

  it('ошибка самого движка (acceptWaveform / worker) → vosk-error, движок освобождается принудительно, onFail', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.ctl.cb.onError('acceptWaveform: boom')
    expect(t.last()).toMatchObject({ status: 'error', error: 'vosk-error' }); expect(t.handle.cancel).toHaveBeenCalled(); expect(t.onFail).toHaveBeenCalledWith('vosk-error', 'acceptWaveform: boom')
    t.ctl.cb.onPartial('late'); expect(t.last().interim).toBe('') // поздние события закрытой попытки игнорируются
  })

  it('диалог разрешения висит дольше 30 с → no-start (не сбой Vosk); микрофон, открывшийся позже, закрывается', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    await vi.advanceTimersByTimeAsync(30001)
    expect(t.last()).toMatchObject({ status: 'error', error: 'no-start' }); expect(t.onFail).not.toHaveBeenCalled()
    t.ctl.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(t.handle.cancel).toHaveBeenCalledTimes(1)
  })

  it('reset: попытка отменяется, микрофон освобождается (в т.ч. когда он ещё открывался), вид очищается, старые события игнорируются', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.rec.reset()
    expect(t.handle.cancel).toHaveBeenCalledTimes(1); expect(t.last()).toMatchObject({ status: 'idle' }); expect(t.rec.isRunning()).toBe(false)
    t.ctl.cb.onResult('i am trying', {}); expect(t.last().status).toBe('idle')
    const u = make(); u.rec.start({ reference: 'x', lang: 'en-US', data }); u.rec.reset()
    u.ctl.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(u.handle.cancel).toHaveBeenCalledTimes(1) // getUserMedia успел после сброса — поток тут же закрыт
  })

  it('новый start поверх идущей попытки отменяет прежнюю; номера заходов растут', async () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data }); await t.ready()
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    expect(t.handle.cancel).toHaveBeenCalledTimes(1); expect(t.last().runNo).toBe(2)
  })

  it('модели в памяти нет (выгрузили между выбором и стартом) → vosk-error, onFail; listen не зовётся', () => {
    const t = make({ runtime: { getModel: () => null } })
    t.rec.start({ reference: 'x', lang: 'en-US', data })
    expect(t.listen).not.toHaveBeenCalled(); expect(t.last()).toMatchObject({ status: 'error', error: 'vosk-error' }); expect(t.onFail).toHaveBeenCalled()
  })
})

// Вся цепочка на настоящем startListening с подставными микрофоном / AudioContext / распознавателем
describe('voskRecognizer + voskEngine: попытка целиком', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('тап → уровень с первого куска → авто-стоп 2,5 с (слова не все) → итог; микрофон, AudioContext и аудиосессия освобождены; второго getUserMedia нет', async () => {
    const handlers = {}
    const rec = { on: (n, f) => { handlers[n] = f }, setWords: vi.fn(), acceptWaveform: vi.fn(), remove: vi.fn(), retrieveFinalResult: vi.fn(() => { setTimeout(() => handlers.result({ result: { text: "i'm try", result: [w("i'm", 0.9), w('try', 0.8)] } }), 30) }) }
    const track = { stop: vi.fn() }
    const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
    let ctx
    class Ctx { constructor() { this.sampleRate = 16000; this.destination = {}; this.close = vi.fn(async () => {}); ctx = this } createScriptProcessor() { return proc } createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } } }
    const audioSession = { type: 'auto' }
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }))
    vi.stubGlobal('window', { AudioContext: Ctx })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, audioSession })
    const level = createRmsLevel()
    const views = []
    const r = createVoskRecognizer({ runtime: { getModel: () => ({ KaldiRecognizer: function () { return rec } }) }, level, listen: startListening, onView: v => views.push(v), getSession: () => 'play-and-record' })
    r.start({ reference: data.phrase, lang: 'en-US', data })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(audioSession.type).toBe('play-and-record') // до getUserMedia, в том же тапе
    await vi.advanceTimersByTimeAsync(50)
    expect(views.at(-1).status).toBe('listening')
    proc.onaudioprocess({ inputBuffer: { duration: 0.128, getChannelData: () => Float32Array.from([0.4, -0.4, 0.4, -0.4]) } })
    expect(level.read()).toBeGreaterThan(0) // эквалайзер получает реальный уровень с первого же куска
    handlers.partialresult({ result: { partial: "i'm try" } })
    await vi.advanceTimersByTimeAsync(2300)
    expect(rec.retrieveFinalResult).not.toHaveBeenCalled() // медленная речь: 2,3 с паузы — ещё не конец
    await vi.advanceTimersByTimeAsync(500)
    expect(rec.retrieveFinalResult).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(50)
    expect(views.at(-1)).toMatchObject({ status: 'done', final: { text: "i'm try" } })
    expect(track.stop).toHaveBeenCalled(); expect(ctx.close).toHaveBeenCalledTimes(1); expect(rec.remove).toHaveBeenCalled()
    expect(audioSession.type).toBe('auto'); expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(level.read()).toBe(0)
  })
})
