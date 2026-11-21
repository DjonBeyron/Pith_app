import { describe, it, expect, vi } from 'vitest'
import { createGameAudioSession } from './gameMicSession.js'
import { START_MODE_KEY, START_MODES, DEFAULT_START_MODE, readStartMode, writeStartMode, startDirect, startWaits } from './gameAudioSettings.js'

// Режим запуска звука (v3.3.334, владелец, iPhone: «при старте всплывает системный ползунок громкости и сам идёт вверх»): какие типы аудиосессии и в каком порядке ставит старт игры в каждом режиме.
// Тип пишется в navigator.audioSession.type; здесь — подставной объект, порядок записей собирается сеттером.
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
function mk({ start, session, from = 'auto' } = {}) {
  const writes = []; let type = from
  const nav = { audioSession: { get type() { return type }, set type(v) { type = v; writes.push(v) } } }
  const store = memStore({ ...(start ? { [START_MODE_KEY]: start } : {}), ...(session ? { pithy_game_audio_session_v1: session } : {}) })
  const ses = createGameAudioSession({ nav, store, note: vi.fn() })
  /** Старт игры: тап (begin) → микрофон ответил (afterMic) → сцена смонтировалась (begin ещё раз) */
  const run = () => { ses.begin(); const tap = [...writes]; ses.afterMic(); ses.begin(); return { tap, all: [...writes], type } }
  return { ses, writes, run, nav }
}

describe('настройка режима запуска', () => {
  it('по умолчанию «как сейчас»; незнакомое значение — умолчание; запись умолчания чистит ключ', () => {
    const s = memStore()
    expect(DEFAULT_START_MODE).toBe('default'); expect(readStartMode(s)).toBe('default')
    for (const m of START_MODES) { writeStartMode(m, s); expect(readStartMode(s)).toBe(m) }
    writeStartMode('default', s); expect(START_MODE_KEY in s.m).toBe(false)
    s.setItem(START_MODE_KEY, 'что-то'); expect(readStartMode(s)).toBe('default')
    expect(START_MODES.filter(startDirect)).toEqual(['direct', 'direct-wait']); expect(START_MODES.filter(startWaits)).toEqual(['wait', 'direct-wait'])
  })
})

describe('порядок типов аудиосессии на старте (тип сессии игры — playback, умолчание)', () => {
  it('А «как сейчас» и Г «wait»: в тапе play-and-record, после микрофона playback — ДВЕ смены, поведение прежнее', () => {
    for (const start of [undefined, 'default', 'wait']) {
      const r = mk({ start }).run()
      expect(r.tap, String(start)).toEqual(['play-and-record']); expect(r.all, String(start)).toEqual(['play-and-record', 'playback'])
    }
  })
  it('Б «direct» и Д «direct-wait»: сразу playback в тапе, play-and-record не ставится ни разу — ОДНА смена; с ленты, где уже playback, — ни одной', () => {
    for (const start of ['direct', 'direct-wait']) {
      const r = mk({ start }).run()
      expect(r.tap, start).toEqual(['playback']); expect(r.all, start).toEqual(['playback'])
      expect(mk({ start, from: 'playback' }).run().all, start).toEqual([])
    }
  })
  it('В «late»: в тапе тип не трогаем (и повторный begin до микрофона — тоже), playback — после ответа микрофона: ОДНА смена', () => {
    const m = mk({ start: 'late' })
    m.ses.begin(); m.ses.begin(); expect(m.writes).toEqual([])
    m.ses.afterMic(); m.ses.begin(); expect(m.writes).toEqual(['playback'])
  })
  it('во всех режимах после старта стоит playback и держится: повторный begin (сцена, «Продолжить» после сброса в auto) возвращает playback, а не play-and-record', () => {
    for (const start of START_MODES) {
      const m = mk({ start }); m.run()
      expect(m.nav.audioSession.type, start).toBe('playback')
      m.nav.audioSession.type = 'auto'; m.ses.begin()
      expect(m.nav.audioSession.type, start).toBe('playback')
    }
  })
  it('конец игры во всех режимах как раньше: остаётся playback', () => {
    for (const start of START_MODES) { const m = mk({ start }); m.run(); m.ses.end(); expect(m.nav.audioSession.type, start).toBe('playback') }
  })
})

describe('режим запуска не трогает другие типы сессии игры', () => {
  it('тип «запись и воспроизведение» и «авто»: режим запуска ничего не меняет', () => {
    for (const start of START_MODES) {
      expect(mk({ start, session: 'play-and-record' }).run().all, start).toEqual(['play-and-record'])
      expect(mk({ start, session: 'auto' }).run().all, start).toEqual([])
    }
  })
})
