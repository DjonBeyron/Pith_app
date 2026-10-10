import { describe, it, expect, vi } from 'vitest'
import { createSayRecognizer } from './sayRecognizer.js'
import { createVoskRuntime } from '../vosk/voskRuntime.js'
import { createVoskRecognizer } from '../vosk/voskRecognizer.js'
import { createRmsLevel } from '../vosk/sayVoskLevel.js'
import { readSayData } from './sayPhraseData.js'
import { emptyView } from './speechView.js'
import { createLevelSource } from './sayLevelSource.js'

// Композит двух движков: выбор на каждую попытку, общий номер захода, один поток видов, переключение при сбое Vosk, уровень голоса, прогрев
const data = readSayData({ phrase: "I'm trying", keywords: 'trying' })
const READY = { cached: true, loaded: true, loading: false, libReady: true, brokenUntil: 0, brokenWhy: '' }

function make({ snap = READY, mode = 'auto', createVosk } = {}) {
  const views = []
  const sys = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: vi.fn(() => false) }
  let sysView = null
  const vosk = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: vi.fn(() => true), isRunning: vi.fn(() => true) }
  let voskOpts = null
  const runtime = { snapshot: vi.fn(() => snap), acquire: vi.fn(() => vi.fn()), markBroken: vi.fn(), getModel: () => ({}) }
  const record = vi.fn()
  const rec = createSayRecognizer({
    createSystem: onView => { sysView = onView; return sys },
    onView: v => views.push(v), runtime, getMode: () => mode, now: () => 1000, record, log: vi.fn(), level: createRmsLevel({ now: () => 0 }),
    createVosk: createVosk ?? (opts => { voskOpts = opts; return vosk }),
  })
  return { rec, views, sys, vosk, runtime, record, pushSystem: v => sysView(v), pushVosk: v => voskOpts.onView(v), voskOpts: () => voskOpts }
}

describe('sayRecognizer: движок на каждую попытку', () => {
  it('Vosk готов → попытка идёт на Vosk (с полями шага для грамматики), системный не трогаем; выбор запоминается для админа', () => {
    const t = make()
    const pick = t.rec.choose(data)
    expect(pick).toEqual({ engine: 'vosk', reason: 'ready' })
    t.rec.start({ reference: data.phrase, lang: 'en-US', data, pick })
    expect(t.vosk.start).toHaveBeenCalledWith({ reference: "I'm trying", lang: 'en-US', data })
    expect(t.sys.start).not.toHaveBeenCalled()
    expect(t.record).toHaveBeenCalledWith({ engine: 'vosk', reason: 'ready' }, 1000)
  })

  it('Vosk не готов → тап НЕ ждёт: эта же попытка синхронно идёт на системном (reference + lang как раньше)', () => {
    const t = make({ snap: { ...READY, loaded: false, libReady: false, loading: true } })
    t.rec.start({ reference: 'x', lang: 'en-GB', data })
    expect(t.sys.start).toHaveBeenCalledWith({ reference: 'x', lang: 'en-GB' })
    expect(t.vosk.start).not.toHaveBeenCalled()
    expect(t.record).toHaveBeenCalledWith({ engine: 'system', reason: 'loading' }, 1000)
  })

  it('режим админа: «Только системное» — системное даже при готовом Vosk, прогрев не запускается; «Авто» — прогрев идёт', () => {
    const t = make({ mode: 'system' })
    expect(t.rec.choose(data)).toEqual({ engine: 'system', reason: 'mode-system' })
    t.rec.warm()()
    expect(t.runtime.acquire).not.toHaveBeenCalled()
    const u = make()
    const off = u.rec.warm()
    expect(u.runtime.acquire).toHaveBeenCalledTimes(1); expect(typeof off).toBe('function')
  })

  it('фраза с простым числом идёт на Vosk (слова из numberWords.js), со сложным (десятичное, телефон) — на системное', () => {
    const t = make()
    expect(t.rec.choose(readSayData({ phrase: 'I have 2 cats' }))).toEqual({ engine: 'vosk', reason: 'ready' })
    expect(t.rec.choose(readSayData({ phrase: 'It is 2.5 cats' }))).toEqual({ engine: 'system', reason: 'phrase' })
  })

  it('номер захода общий для обоих движков (иначе sayFlow принял бы итог за уже обработанный); сброс (idle) проходит как есть; чужой движок молчит', () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'system', reason: 'no-model' } })
    t.pushSystem({ ...emptyView, status: 'listening', runNo: 7 })
    t.pushVosk({ ...emptyView, status: 'listening', runNo: 1 }) // Vosk в этой попытке не участвует
    expect(t.views.map(v => v.runNo)).toEqual([1])
    t.rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'vosk', reason: 'ready' } })
    t.pushVosk({ ...emptyView, status: 'done', runNo: 1 }); t.pushSystem({ ...emptyView, status: 'error', runNo: 8 })
    expect(t.views.map(v => v.runNo)).toEqual([1, 2])
    t.pushSystem({ ...emptyView })
    expect(t.views.at(-1).status).toBe('idle')
  })

  it('stop и isAudioActive идут в движок текущей попытки; reset гасит оба и уровень', () => {
    const t = make()
    t.rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'vosk', reason: 'ready' } })
    t.rec.stop(); expect(t.vosk.stop).toHaveBeenCalled(); expect(t.sys.stop).not.toHaveBeenCalled()
    expect(t.rec.isAudioActive()).toBe(true)
    t.rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'system', reason: 'broken' } })
    t.rec.stop(); expect(t.sys.stop).toHaveBeenCalled(); expect(t.rec.isAudioActive()).toBe(false)
    t.rec.reset(); expect(t.sys.reset).toHaveBeenCalled(); expect(t.vosk.reset).toHaveBeenCalled()
  })

  it('уровень голоса: у Vosk — настоящий RMS его потока; у системного движка null (тогда работает прежний источник)', () => {
    const level = createRmsLevel({ now: () => 0 })
    const views = []
    const vosk = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => true, isRunning: vi.fn(() => true) }
    const rec = createSayRecognizer({ createSystem: () => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => false }), onView: v => views.push(v), runtime: { snapshot: () => READY, acquire: vi.fn(), markBroken: vi.fn() }, level, createVosk: () => vosk, record: vi.fn(), log: vi.fn() })
    rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'system', reason: 'no-model' } })
    level.push(0.2, 0)
    expect(rec.level(0)).toBeNull()
    rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'vosk', reason: 'ready' } })
    expect(rec.level(0)).toBeGreaterThan(0)
    vosk.isRunning.mockReturnValue(false)
    expect(rec.level(0)).toBeNull() // попытка кончилась — снова прежний источник
  })

  it('Vosk упал посреди попытки: ошибка в журнал/runtime, ученику — обычная неудача, СЛЕДУЮЩАЯ попытка идёт на системном (и Vosk снова не выбирается 10 мин)', async () => {
    const d = { url: () => 'u', peek: async () => ({}), read: async () => ({ blob: {} }), load: async () => ({ model: { id: 1 }, libMs: 1, modelMs: 1 }), unload: vi.fn(), busy: () => () => {}, now: () => 0, log: vi.fn() }
    const runtime = createVoskRuntime(d)
    runtime.acquire(); await runtime.whenReady()
    const views = []
    const sys = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => false }
    const listen = vi.fn(async () => { throw Object.assign(new Error('mic busy'), { name: 'NotReadableError' }) })
    const rec = createSayRecognizer({ createSystem: () => sys, onView: v => views.push(v), runtime, getMode: () => 'auto', now: () => 0, record: vi.fn(), log: vi.fn(), createVosk: o => createVoskRecognizer({ ...o, listen }) })
    expect(rec.choose(data).engine).toBe('vosk')
    rec.start({ reference: data.phrase, lang: 'en-US', data })
    await Promise.resolve(); await Promise.resolve()
    expect(views.at(-1)).toMatchObject({ status: 'error', error: 'audio-capture' })
    expect(runtime.snapshot()).toMatchObject({ loaded: false }); expect(d.unload).toHaveBeenCalled()
    expect(rec.choose(data)).toEqual({ engine: 'system', reason: 'broken' })
    rec.start({ reference: data.phrase, lang: 'en-US', data })
    expect(sys.start).toHaveBeenCalledTimes(1)
  })

  it('уровень голоса попадает в заменяемый источник эквалайзера (createLevelSource): у Vosk — RMS его потока с первого кадра, на системном — прежний синтетический', () => {
    const level = createRmsLevel({ now: () => 0 })
    const vosk = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => true, isRunning: () => true }
    const rec = createSayRecognizer({ createSystem: () => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => false }), onView: vi.fn(), runtime: { snapshot: () => READY, acquire: vi.fn(), markBroken: vi.fn() }, level, createVosk: () => vosk, record: vi.fn(), log: vi.fn() })
    const synthetic = { ringLevel: () => 0.11 }
    let frame = null
    const source = createLevelSource(t => rec.level(t) ?? synthetic.ringLevel(t), { raf: fn => { frame = fn; return 1 }, caf: vi.fn() })
    const seen = []
    source.subscribe(l => seen.push(Number(l.toFixed(2))))
    rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'system', reason: 'no-model' } })
    frame(16); expect(seen.at(-1)).toBe(0.11) // системное: как раньше
    rec.start({ reference: 'x', lang: 'en-US', data, pick: { engine: 'vosk', reason: 'ready' } })
    frame(32); expect(seen.at(-1)).toBe(0) // Vosk слушает, звука ещё нет — ровно ноль, а не синтетика
    level.push(0.2, 40)
    frame(40); expect(seen.at(-1)).toBeGreaterThan(0.5) // первый же кусок звука поднимает кольца
  })
})
