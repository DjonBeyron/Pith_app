import { describe, it, expect } from 'vitest'
import { pickEngine, pickLabel, PICK_REASON } from './sayEnginePick.js'
import { SAY_ENGINE_KEY, SAY_ENGINE_MODES, SAY_ENGINE_LABEL, readSayEngine, writeSayEngine } from './sayEngineMode.js'
import { setLastEngine, getLastEngine, subscribeLastEngine } from './sayEngineLast.js'

const READY = { phrase: "I'm trying", cached: true, loaded: true, loading: false, libReady: true, brokenUntil: 0, now: 1000 }

describe('pickEngine: движок на каждую попытку (все ветки)', () => {
  it('всё готово → Vosk', () => {
    expect(pickEngine(READY)).toEqual({ engine: 'vosk', reason: 'ready' })
    expect(pickEngine({ ...READY, mode: 'vosk' })).toEqual({ engine: 'vosk', reason: 'ready' })
  })
  it('«Только системное» → системное, даже если Vosk готов', () => {
    expect(pickEngine({ ...READY, mode: 'system' })).toEqual({ engine: 'system', reason: 'mode-system' })
  })
  it('фраза с чужими буквами / сложными числами / пустая → системное; простые числа Vosk годятся', () => {
    for (const phrase of ['Привет', '', 'Call 555-1234', 'It costs 2.5 dollars', 'I have 12345 cats', 'See you at 3:30 pm']) expect(pickEngine({ ...READY, phrase }), phrase).toEqual({ engine: 'system', reason: 'phrase' })
    for (const phrase of ['I have 2 cats', 'It was 1998', 'He is 21st', 'It costs $5', 'About 50%', 'At 3:30']) expect(pickEngine({ ...READY, phrase }), phrase).toEqual({ engine: 'vosk', reason: 'ready' })
  })
  it('Vosk недавно сбоил → системное до конца паузы; потом снова Vosk', () => {
    expect(pickEngine({ ...READY, brokenUntil: 5000 })).toEqual({ engine: 'system', reason: 'broken' })
    expect(pickEngine({ ...READY, brokenUntil: 1000 }).engine).toBe('vosk') // пауза кончилась ровно сейчас
    expect(pickEngine({ ...READY, brokenUntil: 5000, mode: 'vosk' }).engine).toBe('vosk') // «Только Vosk» сбой не прячет
  })
  it('модели нет в кэше → системное', () => {
    expect(pickEngine({ ...READY, cached: false, loaded: false })).toEqual({ engine: 'system', reason: 'no-model' })
  })
  it('модель в кэше, но ещё не в памяти: грузится → loading; не грузится / не проверяли → not-loaded (тап не ждёт ни в одном случае)', () => {
    expect(pickEngine({ ...READY, loaded: false, libReady: false, loading: true })).toEqual({ engine: 'system', reason: 'loading' })
    expect(pickEngine({ ...READY, loaded: false, libReady: false })).toEqual({ engine: 'system', reason: 'not-loaded' })
    expect(pickEngine({ ...READY, cached: null, loaded: false, libReady: false })).toEqual({ engine: 'system', reason: 'not-loaded' })
  })
  it('модель в памяти, а библиотека не подгрузилась → системное', () => {
    expect(pickEngine({ ...READY, libReady: false })).toEqual({ engine: 'system', reason: 'no-lib' })
  })
  it('«Только Vosk», но не готов → всё равно системное на эту попытку (нажатие не блокируем), причина видна', () => {
    expect(pickEngine({ ...READY, mode: 'vosk', loaded: false, libReady: false })).toEqual({ engine: 'system', reason: 'not-loaded' })
    expect(pickEngine({ ...READY, mode: 'vosk', cached: false, loaded: false })).toEqual({ engine: 'system', reason: 'no-model' })
  })
  it('пустой вызов безопасен: системное', () => {
    expect(pickEngine().engine).toBe('system')
  })
  it('подписи для админа: у каждой причины есть текст', () => {
    expect(pickLabel({ engine: 'vosk', reason: 'ready' })).toBe('Vosk')
    expect(pickLabel({ engine: 'system', reason: 'no-model' })).toBe('системное (модели нет в кэше)')
    expect(pickLabel(null)).toBe('системное')
    for (const reason of ['ready', 'mode-system', 'phrase', 'broken', 'no-model', 'loading', 'not-loaded', 'no-lib']) expect(PICK_REASON[reason]).toBeTruthy()
  })
})

describe('sayEngineMode: настройка админа', () => {
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
  it('ключ pithy_say_engine_v1; по умолчанию «Авто»; три режима с подписями', () => {
    expect(SAY_ENGINE_KEY).toBe('pithy_say_engine_v1')
    expect(SAY_ENGINE_MODES).toEqual(['auto', 'system', 'vosk'])
    expect(SAY_ENGINE_LABEL).toEqual({ auto: 'Авто (Vosk, если готов)', system: 'Только системное', vosk: 'Только Vosk' })
    expect(readSayEngine(mem())).toBe('auto')
  })
  it('запись и чтение; «авто» стирает ключ; мусор → авто', () => {
    const s = mem()
    expect(writeSayEngine('vosk', s)).toBe('vosk'); expect(s.m.get(SAY_ENGINE_KEY)).toBe('vosk'); expect(readSayEngine(s)).toBe('vosk')
    writeSayEngine('system', s); expect(readSayEngine(s)).toBe('system')
    expect(writeSayEngine('auto', s)).toBe('auto'); expect(s.m.has(SAY_ENGINE_KEY)).toBe(false)
    expect(writeSayEngine('мусор', s)).toBe('auto')
    s.setItem(SAY_ENGINE_KEY, 'что-то'); expect(readSayEngine(s)).toBe('auto')
  })
  it('нет localStorage / он бросает → авто, запись молча пропускается', () => {
    const bad = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    expect(readSayEngine(bad)).toBe('auto'); expect(() => writeSayEngine('vosk', bad)).not.toThrow(); expect(readSayEngine(null)).toBe('auto')
  })
})

describe('sayEngineLast: «последняя попытка шла на…»', () => {
  it('пишет движок, причину и время; подписчики узнают; отписка работает', () => {
    let n = 0
    const off = subscribeLastEngine(() => { n++ })
    setLastEngine({ engine: 'system', reason: 'no-model' }, 123)
    expect(getLastEngine()).toEqual({ engine: 'system', reason: 'no-model', at: 123 }); expect(n).toBe(1)
    off(); setLastEngine({ engine: 'vosk', reason: 'ready' }, 456)
    expect(getLastEngine()).toMatchObject({ engine: 'vosk' }); expect(n).toBe(1)
    setLastEngine(null); expect(getLastEngine()).toBeNull()
  })
})
