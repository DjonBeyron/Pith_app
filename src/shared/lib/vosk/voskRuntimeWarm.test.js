import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRuntime, FREE_AFTER_MS, BROKEN_MS, MAX_AUTO_RETRIES } from './voskRuntime.js'
import { STAGE_TIMEOUT_MS } from './voskWarmStages.js'

// Прогрев как машина состояний: этапы и журнал, таймаут каждого этапа, пауза 1 мин и повтор сам, ручной прогрев, режим «Только системное», владельцы (урок / панель). Всё подставное, на таймерах
const never = () => new Promise(() => {})
function make(over = {}) {
  let t = 1000
  let mode = 'auto'
  const model = { id: 'model' }
  const endBusy = vi.fn()
  const ctl = []
  const d = {
    url: () => 'https://x/model.tar.gz', peek: vi.fn(async () => ({ size: 5 })), read: vi.fn(async () => ({ blob: { size: 5 }, size: 5 })),
    load: vi.fn(async (_blob, onStage, c) => { ctl.push(c); onStage?.('lib'); await Promise.resolve(); onStage?.('model'); return { model, libMs: 7, modelMs: 9 } }),
    unload: vi.fn(), busy: vi.fn(() => endBusy), now: () => t, log: vi.fn(), mode: () => mode, ...over,
  }
  const rt = createVoskRuntime(d)
  return { rt, d, model, endBusy, ctl, setMode: m => { mode = m }, log: d.log, advance: ms => { t += ms; return vi.advanceTimersByTimeAsync(ms) } }
}
const stages = rt => rt.info().trace.map(x => x.stage)

describe('voskRuntime: этапы прогрева', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('до прогрева — idle; при прогрузке проходит checking-cache → importing-lib → loading-model → ready, журнал хранит время и подробности', async () => {
    const { rt } = make()
    expect(rt.snapshot().stage).toBe('idle'); expect(rt.info()).toMatchObject({ stage: 'idle', trace: [], acquires: 0, users: 0 })
    rt.acquire('lesson'); await rt.whenReady()
    expect(stages(rt)).toEqual(['checking-cache', 'importing-lib', 'loading-model', 'ready'])
    expect(rt.snapshot().stage).toBe('ready')
    expect(rt.info()).toMatchObject({ trigger: 'lesson', acquires: 1, holds: { lesson: 1 }, lastAcquire: { why: 'lesson', at: 1000 }, failure: null })
    expect(rt.info().trace[0].note).toContain('при входе в урок')
    expect(rt.info().trace[3].note).toContain('библиотека 7 мс')
  })

  it('модели нет в кэше → этап возвращается в idle с пояснением; снимок stage = idle, cached = false', async () => {
    const { rt } = make({ peek: vi.fn(async () => null) })
    rt.acquire('panel'); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ stage: 'idle', cached: false })
    expect(rt.info().trace.at(-1).note).toContain('нет в кэше')
  })

  it('этапы пишутся в журнал плеера ([say-vosk] добавляет обёртка по умолчанию; здесь — сам текст)', async () => {
    const { rt, log } = make()
    rt.acquire('panel'); await rt.whenReady()
    const text = log.mock.calls.map(c => c[0]).join('\n')
    expect(text).toContain('прогрев: проверяем кэш модели'); expect(text).toContain('прогрев: загружаем библиотеку'); expect(text).toContain('прогрев: готово')
  })
})

describe('voskRuntime: таймауты этапов → failed с причиной, пауза 1 мин', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('библиотека не подгрузилась за 30 с → failed на этапе importing-lib, сеть «освобождена», Vosk не выбираем 1 мин', async () => {
    const { rt, endBusy, log, advance } = make({ load: vi.fn(() => never()) })
    rt.acquire('lesson')
    await advance(STAGE_TIMEOUT_MS['importing-lib'] - 1)
    expect(rt.snapshot().stage).toBe('importing-lib')
    await advance(2); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ stage: 'failed', loaded: false, loading: false, broken: true })
    expect(rt.info().failure).toMatchObject({ stage: 'importing-lib' }); expect(rt.info().failure.text).toContain('таймаут'); expect(rt.info().failure.text).toContain('30 с')
    expect(endBusy).toHaveBeenCalled()
    expect(log.mock.calls.map(c => c[0]).join('\n')).toContain('ошибка загрузки библиотеки')
  })

  it('модель не загрузилась в память за 60 с → failed на loading-model, у движка просят отмену; запоздавшая модель выгружается, а не остаётся в памяти', async () => {
    let finish
    const load = vi.fn((_b, onStage, c) => { onStage?.('lib'); onStage?.('model'); c.cancel = vi.fn(); return new Promise(r => { finish = () => r({ model: { id: 'late' }, libMs: 1, modelMs: 1 }) }) })
    const { rt, d, ctl, advance } = make({ load })
    rt.acquire('panel'); await advance(10)
    expect(rt.snapshot().stage).toBe('loading-model')
    await advance(STAGE_TIMEOUT_MS['loading-model']); await rt.whenReady()
    expect(rt.info().failure).toMatchObject({ stage: 'loading-model' })
    const c = load.mock.calls[0][2]; expect(c.cancel).toHaveBeenCalled()
    finish(); await advance(1)
    expect(d.unload).toHaveBeenCalledWith({ id: 'late' }); expect(rt.snapshot().loaded).toBe(false); expect(ctl).toEqual([])
  })

  it('кэш не отвечает (peek завис) → failed на checking-cache через 20 с — не «вечное проверяем»', async () => {
    const { rt, advance } = make({ peek: vi.fn(() => never()) })
    rt.acquire('panel')
    await advance(STAGE_TIMEOUT_MS['checking-cache'] + 1); await rt.whenReady()
    expect(rt.info().failure).toMatchObject({ stage: 'checking-cache' }); expect(rt.snapshot().stage).toBe('failed')
  })

  it('ошибка → пауза 1 мин → повтор САМ, пока кто-то держит модель; с готовой моделью счёт сбоев обнуляется', async () => {
    let n = 0
    const load = vi.fn(async (_b, onStage) => { n++; onStage?.('lib'); if (n === 1) throw new Error('Failed to fetch dynamically imported module'); onStage?.('model'); return { model: { id: 'm' }, libMs: 1, modelMs: 1 } })
    const { rt, advance } = make({ load })
    rt.acquire('lesson'); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ stage: 'failed', brokenUntil: 1000 + BROKEN_MS })
    await advance(BROKEN_MS - 100); expect(load).toHaveBeenCalledTimes(1)
    await advance(200); await rt.whenReady()
    expect(load).toHaveBeenCalledTimes(2)
    expect(rt.snapshot()).toMatchObject({ stage: 'ready', loaded: true, broken: false })
    expect(rt.info()).toMatchObject({ failure: null, failures: 0, trigger: 'retry' })
  })

  it('повторы сами не бесконечны (MAX_AUTO_RETRIES подряд), ручной прогрев счёт обнуляет; без владельцев повтора нет', async () => {
    const load = vi.fn(async () => { throw new Error('нет сети') })
    const { rt, advance } = make({ load })
    rt.acquire('lesson'); await rt.whenReady()
    for (let i = 0; i < MAX_AUTO_RETRIES + 3; i++) { await advance(BROKEN_MS + 100); await rt.whenReady() }
    expect(load).toHaveBeenCalledTimes(MAX_AUTO_RETRIES + 1)
    await rt.warmNow('manual')
    expect(load).toHaveBeenCalledTimes(MAX_AUTO_RETRIES + 2)
    const b = make({ load: vi.fn(async () => { throw new Error('x') }) })
    b.rt.acquire('panel')(); await b.rt.whenReady() // панель ушла сразу: повторять некому
    await b.advance(BROKEN_MS * 3)
    expect(b.d.load).toHaveBeenCalledTimes(1)
  })
})

describe('voskRuntime: ручной прогрев, ожидание, режимы, владельцы', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('warmNow (кнопка «Прогреть сейчас») снимает паузу и грузит сразу, даже если владельцев нет; потом модель уходит через 30 с', async () => {
    const { rt, d, advance } = make({ load: vi.fn(async () => { throw new Error('x') }) })
    rt.acquire('panel'); await rt.whenReady()
    expect(rt.snapshot().broken).toBe(true)
    d.load.mockImplementation(async (_b, onStage) => { onStage?.('lib'); onStage?.('model'); return { model: { id: 'ok' }, libMs: 1, modelMs: 1 } })
    await rt.warmNow('manual')
    expect(rt.snapshot()).toMatchObject({ loaded: true, broken: false, stage: 'ready' }); expect(rt.info().trigger).toBe('manual')
    const solo = make()
    await solo.rt.warmNow('manual')
    expect(solo.rt.snapshot().loaded).toBe(true)
    await solo.advance(FREE_AFTER_MS + 1)
    expect(solo.d.unload).toHaveBeenCalledTimes(1)
    await advance(1)
  })

  it('warmNow("manual") перезапускает зависший прогрев; прежний, запоздав, ничего не портит (модель не дублируется)', async () => {
    let first = true
    const load = vi.fn((_b, onStage) => {
      onStage?.('lib')
      if (first) { first = false; return never() }
      onStage?.('model'); return Promise.resolve({ model: { id: 'second' }, libMs: 1, modelMs: 1 })
    })
    const { rt, endBusy, advance } = make({ load })
    rt.acquire('panel'); await advance(5000)
    await rt.warmNow('manual')
    expect(load).toHaveBeenCalledTimes(2); expect(endBusy).toHaveBeenCalled()
    expect(rt.getModel()).toEqual({ id: 'second' })
    await advance(STAGE_TIMEOUT_MS['importing-lib'] * 2)
    expect(rt.snapshot()).toMatchObject({ loaded: true, stage: 'ready' }) // таймер зависшего прогрева не сбил готовую модель
  })

  it('warmNow("tap") идущий прогрев не трогает (не сбрасывает прогресс)', async () => {
    const { rt, d } = make()
    rt.acquire('panel'); rt.warmNow('tap'); await rt.whenReady()
    expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('whenSettled: готово → ok; ошибка → причина простым текстом; нет модели; не успел → timeout с текущим этапом', async () => {
    const a = make(); a.rt.acquire('panel')
    expect(await a.rt.whenSettled(20000)).toEqual({ ok: true })
    const b = make({ load: vi.fn(async () => { throw new Error('Модель не загрузилась') }) })
    b.rt.acquire('panel'); const r = await b.rt.whenSettled(20000)
    expect(r).toMatchObject({ ok: false, reason: 'failed' }); expect(r.text).toContain('ошибка'); expect(r.text).toContain('Модель не загрузилась')
    const c = make({ peek: vi.fn(async () => null) }); c.rt.acquire('panel')
    expect(await c.rt.whenSettled(20000)).toMatchObject({ ok: false, reason: 'no-model' })
    const e = make({ load: vi.fn((_b, onStage) => { onStage?.('lib'); return never() }) }); e.rt.acquire('panel')
    const p = e.rt.whenSettled(5000); await e.advance(5001)
    expect(await p).toMatchObject({ ok: false, reason: 'timeout' })
  })

  it('«Только системное»: владелец считается, но библиотека и кэш не трогаются; режим сменили → clearBroken греет сразу (раньше панель, открытая в «system», не грелась никогда)', async () => {
    const { rt, d, setMode } = make()
    setMode('system')
    rt.acquire('panel'); await rt.whenReady()
    expect(d.peek).not.toHaveBeenCalled(); expect(d.load).not.toHaveBeenCalled(); expect(rt.info()).toMatchObject({ users: 1, acquires: 1, mode: 'system' })
    setMode('vosk'); rt.clearBroken(); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ loaded: true, stage: 'ready' }); expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('владельцы по видам: урок + панель; ушла панель — модель живёт, ушёл и урок — выгрузка через 30 с; повторный вход в урок до этого ничего не грузит заново', async () => {
    const { rt, d, advance } = make()
    const lesson = rt.acquire('lesson'); const panel = rt.acquire('panel'); await rt.whenReady()
    expect(rt.info().holds).toEqual({ lesson: 1, panel: 1 })
    panel(); await advance(FREE_AFTER_MS * 2)
    expect(d.unload).not.toHaveBeenCalled()
    lesson(); await advance(FREE_AFTER_MS - 1)
    expect(d.unload).not.toHaveBeenCalled()
    const again = rt.acquire('lesson'); await advance(FREE_AFTER_MS * 2)
    expect(d.unload).not.toHaveBeenCalled(); expect(d.load).toHaveBeenCalledTimes(1)
    again(); again(); await advance(FREE_AFTER_MS + 1)
    expect(d.unload).toHaveBeenCalledTimes(1); expect(rt.info().holds).toEqual({ lesson: 0, panel: 0 }); expect(rt.snapshot().stage).toBe('idle')
  })

  it('info() отдаёт копию журнала (диагностика его не портит)', async () => {
    const { rt } = make()
    rt.acquire('panel'); await rt.whenReady()
    rt.info().trace.length = 0
    expect(rt.info().trace.length).toBeGreaterThan(0)
  })
})
