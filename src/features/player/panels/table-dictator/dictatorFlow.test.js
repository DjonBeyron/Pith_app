import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Конец аудио и проверка ответа диктанта (вынесены из TableDictatorPanel.jsx)
vi.mock('./dictatorPostAudio.js', () => ({ schedulePostAudioCheck: vi.fn() }))
const { schedulePostAudioCheck } = await import('./dictatorPostAudio.js')
const { onDictatorEnded, runDictatorCheck } = await import('./dictatorFlow.js')

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); globalThis.cancelAnimationFrame = vi.fn() })
afterEach(() => vi.useRealTimers())

// Формат как у evaluateDictator (dictatorCheck.js): токены ответа и собранные ячейки-строки
const cellTok = { type: 'cell' }

function checkCtx(over = {}) {
  let result = null
  return {
    checkOut: null, timers: { current: [] }, answer: 'I am', tokens: [cellTok, cellTok],
    assembled: ['I', 'am'], extrasAssembled: [],
    closeTriggerRef: { current: null }, closeVariantRef: { current: null },
    distractors: [{ id: 'd1', text: 'is' }], setResult: v => { result = v }, getResult: () => result,
    xpAmount: 5, xpFiredRef: { current: false }, panelRef: { current: null },
    onXpEarned: vi.fn(), checkDelay: 1500, closeModule: vi.fn(),
    ...over,
  }
}

describe('проверка ответа диктанта', () => {
  it('пустое состояние (двойной старт) — проверка пропускается', () => {
    const c = checkCtx({ assembled: [], extrasAssembled: [] })
    runDictatorCheck(c)
    expect(c.getResult()).toBe(null)
  })

  it('верно: зелёный, XP один раз на прогон, закрытие по задержке (легаси)', () => {
    const c = checkCtx()
    runDictatorCheck(c)
    runDictatorCheck(c)
    expect(c.getResult()).toBe('correct')
    expect(c.closeTriggerRef.current).toBe('table_correct')
    expect(c.onXpEarned).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1500)
    expect(c.closeModule).toHaveBeenCalled()
  })

  it('неверно со словом-ловушкой: красный и особый переход этой ловушки', () => {
    const c = checkCtx({ assembled: ['I'], extrasAssembled: [{ value: 'is' }], checkOut: 3 })
    runDictatorCheck(c)
    expect(c.getResult()).toBe('wrong')
    expect(c.closeTriggerRef.current).toBe('table_wrong')
    expect(c.closeVariantRef.current).toBe('d1')
    expect(c.onXpEarned).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(c.closeModule).not.toHaveBeenCalled() // есть out-point — закрывает он
  })
})

function endedCtx(over = {}) {
  const set = vi.fn()
  return {
    rafRef: { current: 7 }, setHudVisible: set, setPlaying: set, prevActiveRef: { current: null },
    prevExtraRef: { current: null }, setHighlighted: set, setActiveExtraKeys: set,
    assembledRef: { current: ['I', 'am'] }, hasExtras: false, checkAt: null, timeline: null, cells: [],
    shuffledExtras: [], extraFromAnswer: [], checkOut: null, audioRef: { current: null }, timers: { current: [] },
    rfxChipsRef: {}, rfxCheckRef: {}, rfxCloseRef: {}, addedCellsRef: {}, setPhase: vi.fn(),
    setChipsVisible: vi.fn(), setAssembled: set, setExtrasAssembled: set, setUsedCells: set,
    setRevealedIds: set, checkRef: {}, closeRef: {}, answer: 'I am', slideDown: vi.fn(),
    ...over,
  }
}

describe('конец аудио диктанта', () => {
  it('без слов-вариантов: сверка с ответом и закрытие через 500мс', () => {
    const c = endedCtx()
    onDictatorEnded(c)
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7)
    vi.advanceTimersByTime(500)
    expect(c.slideDown).toHaveBeenCalledWith('table_correct')
    const w = endedCtx({ assembledRef: { current: ['I'] } })
    onDictatorEnded(w)
    vi.advanceTimersByTime(500)
    expect(w.slideDown).toHaveBeenCalledWith('table_wrong')
  })

  it('есть слова-варианты: фаза extras, чипы через 450мс', () => {
    const c = endedCtx({ hasExtras: true })
    onDictatorEnded(c)
    expect(c.setPhase).toHaveBeenCalledWith('extras')
    vi.advanceTimersByTime(450)
    expect(c.setChipsVisible).toHaveBeenCalledWith(true)
    expect(c.slideDown).not.toHaveBeenCalled()
  })

  it('режим checkAt: всё после аудио планирует schedulePostAudioCheck', () => {
    const c = endedCtx({ checkAt: 4.2 })
    onDictatorEnded(c)
    expect(schedulePostAudioCheck).toHaveBeenCalledTimes(1)
    expect(schedulePostAudioCheck.mock.calls[0][0]).toMatchObject({ checkAt: 4.2 })
    expect(c.slideDown).not.toHaveBeenCalled()
  })
})
