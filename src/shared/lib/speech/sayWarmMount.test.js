import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRuntime, FREE_AFTER_MS } from '../vosk/voskRuntime.js'
import { createSayRecognizer } from './sayRecognizer.js'
import { startPanelWarm } from './sayPanelWarm.js'
import { WAIT_MS } from './sayVoskWait.js'

// Интеграционный путь «монтирование панели → прогрев → готово» на подставных кэше / движке / микрофоне (настоящие: runtime, распознаватель, выбор движка, ожидание «Только Vosk»).
// Причины, по которым на телефоне владельца прогрев не доходил до конца (разбор — PROJECT.md):
//  H1. прогрев стоял ЗА perm.refresh() (Permissions API): если ответ не приходит, acquire не вызывался вовсе («кэш ещё не проверен», «библиотека не загружена», users = 0);
//  H2. панель открыта в режиме «Только системное» → warm() был пустышкой; админ переключил на «Только Vosk» → clearBroken() ничего не грел (владельцев 0) — пока панель не откроют заново.
const never = () => new Promise(() => {})
function setup({ mode = { v: 'auto' }, runtimeOver = {}, perm } = {}) {
  let now = 1000
  const model = { id: 'model' }
  const d = {
    url: () => 'https://x/m.tar.gz', peek: vi.fn(async () => ({ size: 5 })), read: vi.fn(async () => ({ blob: { size: 5 }, size: 5 })),
    load: vi.fn(async (_b, onStage) => { onStage?.('lib'); await Promise.resolve(); onStage?.('model'); return { model, libMs: 1, modelMs: 1 } }),
    unload: vi.fn(), busy: vi.fn(() => () => {}), now: () => now, log: vi.fn(), mode: () => mode.v, ...runtimeOver,
  }
  const runtime = createVoskRuntime(d)
  const sys = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => false }
  const vosk = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), isAudioActive: () => false, isRunning: () => false }
  const rec = createSayRecognizer({ createSystem: () => sys, onView: vi.fn(), runtime, getMode: () => mode.v, createVosk: () => vosk, record: vi.fn(), log: vi.fn(), now: () => now, attempts: { begin() {}, view() {}, userStop() {} } })
  const perms = perm ?? { decide: () => ({ action: 'listen' }), refresh: async () => 'granted' }
  return { d, runtime, rec, sys, vosk, mode, perms, advance: ms => { now += ms; return vi.advanceTimersByTimeAsync(ms) } }
}

describe('монтирование панели → прогрев → готово', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('обычный путь: панель смонтирована → модель из кэша в памяти → следующий тап выбирает Vosk', async () => {
    const t = setup()
    const stop = startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })
    await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ cached: true, loaded: true, stage: 'ready' })
    expect(t.rec.choose({ phrase: 'Hello there' })).toEqual({ engine: 'vosk', reason: 'ready' })
    stop(); await t.advance(FREE_AFTER_MS + 1)
    expect(t.d.unload).toHaveBeenCalledTimes(1)
  })

  it('H1: Permissions API не отвечает (refresh висит вечно) — прогрев всё равно идёт, не ждёт ответа', async () => {
    const t = setup({ perm: { decide: () => ({ action: 'listen' }), refresh: () => never() } })
    startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })
    await t.runtime.whenReady()
    expect(t.runtime.info()).toMatchObject({ users: 1, acquires: 1, trigger: 'panel' })
    expect(t.runtime.snapshot().loaded).toBe(true)
  })

  it('запасной режим сразу (Firefox / «не могу говорить» / отказ) — Vosk не греется; query позже сказал «запрещено» — прогрев отпускается и панель уходит в запасной режим', async () => {
    const a = setup({ perm: { decide: () => ({ action: 'fallback', reason: 'browser' }), refresh: async () => 'unavailable' } })
    const onFallbackA = vi.fn()
    startPanelWarm({ perm: a.perms, warm: why => a.rec.warm(why), onFallback: onFallbackA })
    await vi.advanceTimersByTimeAsync(10)
    expect(a.d.peek).not.toHaveBeenCalled(); expect(a.runtime.info().acquires).toBe(0)
    expect(onFallbackA).toHaveBeenCalledWith({ action: 'fallback', reason: 'browser' })
    let denied = false
    const b = setup({ perm: { decide: () => (denied ? { action: 'fallback', reason: 'denied' } : { action: 'listen' }), refresh: async () => { denied = true; return 'denied' } } })
    const onFallbackB = vi.fn()
    startPanelWarm({ perm: b.perms, warm: why => b.rec.warm(why), onFallback: onFallbackB })
    await vi.advanceTimersByTimeAsync(10)
    expect(onFallbackB).toHaveBeenCalledWith({ action: 'fallback', reason: 'denied' }); expect(b.runtime.info().users).toBe(0)
  })

  it('H2: панель открыта в «Только системное», админ переключил на «Только Vosk» — модель греется сразу (без перезахода)', async () => {
    const mode = { v: 'system' }
    const t = setup({ mode })
    startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })
    await t.runtime.whenReady()
    expect(t.d.peek).not.toHaveBeenCalled(); expect(t.runtime.snapshot().loaded).toBe(false)
    mode.v = 'vosk'; t.runtime.clearBroken(); await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ loaded: true, stage: 'ready' })
  })

  it('StrictMode (монтирование → размонтирование → монтирование): модель грузится один раз', async () => {
    const t = setup()
    startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })()
    startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })
    await t.runtime.whenReady()
    expect(t.d.load).toHaveBeenCalledTimes(1); expect(t.runtime.info().users).toBe(1)
  })

  it('урок держит модель, панель открылась позже — второй загрузки нет, панель закрыли — модель остаётся до выхода из урока', async () => {
    const t = setup()
    const lesson = t.rec.warm('lesson'); await t.runtime.whenReady()
    const stopPanel = startPanelWarm({ perm: t.perms, warm: why => t.rec.warm(why), onFallback: vi.fn() })
    stopPanel(); await t.advance(FREE_AFTER_MS * 2)
    expect(t.d.load).toHaveBeenCalledTimes(1); expect(t.d.unload).not.toHaveBeenCalled()
    lesson(); await t.advance(FREE_AFTER_MS + 1)
    expect(t.d.unload).toHaveBeenCalledTimes(1)
  })
})

describe('режим «Только Vosk»: тап ждёт прогрев и не уходит на системное', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const data = { phrase: 'Hello there', lang: 'en-US' }

  it('Авто и Vosk готов/не готов — ждать не нужно (null): прежнее поведение, системное — запасное', async () => {
    const t = setup({ mode: { v: 'auto' } })
    expect(t.rec.waitVosk(data, vi.fn())).toBeNull()
    t.rec.warm(); await t.runtime.whenReady()
    expect(t.rec.waitVosk(data, vi.fn())).toBeNull()
    const v = setup({ mode: { v: 'vosk' } }); v.rec.warm(); await v.runtime.whenReady()
    expect(v.rec.waitVosk(data, vi.fn())).toBeNull() // «Только Vosk», но уже готов — обычная попытка на Vosk
    const s = setup({ mode: { v: 'system' } })
    expect(s.rec.waitVosk(data, vi.fn())).toBeNull()
    const phrase = setup({ mode: { v: 'vosk' } })
    expect(phrase.rec.waitVosk({ phrase: 'It is 2.5 cats' }, vi.fn())).toBeNull() // фраза не для Vosk — ждать бессмысленно
  })

  it('не готов: запускается прогрев, плашка показывает этап с секундами, готово → «нажмите ещё раз»; системное не стартует', async () => {
    let finish
    const t = setup({ mode: { v: 'vosk' }, runtimeOver: { load: vi.fn((_b, onStage) => { onStage?.('lib'); return new Promise(r => { finish = () => { onStage?.('model'); r({ model: { id: 'm' }, libMs: 1, modelMs: 1 }) } }) }) } })
    const notes = []
    const cancel = t.rec.waitVosk(data, n => notes.push(n))
    expect(typeof cancel).toBe('function')
    await t.advance(0) // этап «библиотека» уже начался
    await t.advance(4000)
    expect(notes.at(-1).text).toContain('Vosk ещё не готов'); expect(notes.at(-1).text).toContain('загружаем библиотеку (4 с)')
    finish(); await t.advance(10)
    expect(notes.at(-1).text).toContain('Vosk готов — нажмите на микрофон ещё раз')
    expect(t.sys.start).not.toHaveBeenCalled(); expect(t.vosk.start).not.toHaveBeenCalled()
    expect(t.rec.waitVosk(data, vi.fn())).toBeNull() // второй тап — обычная попытка на Vosk
  })

  it('ошибка загрузки → причина в плашке, системное НЕ запускается; паузу после сбоя тап снимает (админ проверяет именно Vosk)', async () => {
    const t = setup({ mode: { v: 'vosk' }, runtimeOver: { load: vi.fn(async () => { throw new Error('Failed to fetch dynamically imported module') }) } })
    t.runtime.markBroken('vosk-error: x')
    const notes = []
    t.rec.waitVosk(data, n => notes.push(n))
    await t.advance(10)
    const last = notes.at(-1)
    expect(last.text).toContain('Vosk не включился'); expect(last.text).toContain('Failed to fetch dynamically imported module'); expect(last.text).toContain('Системное НЕ запускаю')
    expect(t.d.load).toHaveBeenCalledTimes(1) // markBroken не вызывал загрузку, тап — вызвал вопреки паузе
    expect(t.sys.start).not.toHaveBeenCalled()
  })

  it('модели нет в кэше → понятная причина сразу; не уложились в 20 с → причина с этапом', async () => {
    const a = setup({ mode: { v: 'vosk' }, runtimeOver: { peek: vi.fn(async () => null) } })
    const notesA = []
    a.rec.waitVosk(data, n => notesA.push(n)); await a.advance(10)
    expect(notesA.at(-1).text).toContain('модели Vosk нет в кэше телефона')
    const b = setup({ mode: { v: 'vosk' }, runtimeOver: { load: vi.fn((_b, onStage) => { onStage?.('lib'); return never() }) } })
    const notesB = []
    b.rec.waitVosk(data, n => notesB.push(n))
    await b.advance(WAIT_MS + 5)
    expect(notesB.at(-1).text).toContain('не успел за 20 с')
  })

  it('cancel() гасит плашку: после отмены новых строк нет', async () => {
    const t = setup({ mode: { v: 'vosk' }, runtimeOver: { load: vi.fn((_b, onStage) => { onStage?.('lib'); return never() }) } })
    const notes = []
    const cancel = t.rec.waitVosk(data, n => notes.push(n))
    await t.advance(2000); cancel()
    const n = notes.length
    await t.advance(10000)
    expect(notes.length).toBe(n)
  })
})
