import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGameAudioSession } from './gameMicSession.js'
import { START_MODE_KEY, START_MODES, DEFAULT_START_MODE, readStartMode, writeStartMode, startWaits } from './gameAudioSettings.js'

// Режим запуска звука (v3.3.334 → 337). Проверка владельца на iPhone: в режимах «сразу playback» (direct) и «playback после микрофона» (late) микрофон НЕ ОТКРЫВАЛСЯ, «попробовать снова» не помогало —
// iOS даёт запись только при типе play-and-record. Режимы убраны; сохранённые значения читаются как «как сейчас», порядок типов на старте — прежний, что бы ни лежало в настройке.
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
function order(start) {
  const writes = []; let type = 'auto'
  const nav = { audioSession: { get type() { return type }, set type(v) { type = v; writes.push(v) } } }
  const ses = createGameAudioSession({ nav, store: memStore(start ? { [START_MODE_KEY]: start } : {}), note: vi.fn() })
  ses.begin(); const tap = [...writes]; ses.afterMic(); ses.begin() // тап → микрофон ответил → сцена смонтировалась
  return { tap, all: writes }
}

describe('настройка режима запуска', () => {
  it('режимов два: «как сейчас» (умолчание) и «реплика ждёт микрофон»; запись умолчания чистит ключ', () => {
    const s = memStore()
    expect(START_MODES).toEqual(['default', 'wait']); expect(DEFAULT_START_MODE).toBe('default'); expect(readStartMode(s)).toBe('default')
    writeStartMode('wait', s); expect(readStartMode(s)).toBe('wait'); expect(startWaits('wait')).toBe(true); expect(startWaits('default')).toBe(false)
    writeStartMode('default', s); expect(START_MODE_KEY in s.m).toBe(false)
  })
  it('сломанные режимы, оставшиеся в телефоне («direct», «late», «direct-wait»), и мусор читаются как «как сейчас»; записать их нельзя', () => {
    for (const dead of ['direct', 'late', 'direct-wait', 'что-то']) {
      expect(readStartMode(memStore({ [START_MODE_KEY]: dead })), dead).toBe('default')
      const s = memStore(); writeStartMode(dead, s); expect(START_MODE_KEY in s.m, dead).toBe(false)
      expect(startWaits(dead), dead).toBe(false)
    }
  })
})

describe('порядок типов аудиосессии на старте не зависит от режима запуска', () => {
  it('всегда: в тапе play-and-record (иначе iPhone не откроет микрофон), после ответа микрофона — playback', () => {
    for (const start of [undefined, 'default', 'wait', 'direct', 'late', 'direct-wait']) {
      const r = order(start)
      expect(r.tap, String(start)).toEqual(['play-and-record']); expect(r.all, String(start)).toEqual(['play-and-record', 'playback'])
    }
  })
  it('модуль аудиосессии режим запуска не читает вовсе (сломанные ветки убраны)', () => {
    const src = readFileSync(new URL('./gameMicSession.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/readStartMode|startDirect|START_MODE/)
  })
})
