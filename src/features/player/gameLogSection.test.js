import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGameLogSection, pickEvents, eventLine, clip, countsLine, fields, MAX_LINES, HEAD_LINES, MAX_FIELD, MAX_PARTIALS } from './gameLogSection.js'
import { createWordLaneDebug } from './modules/rotate-phone/wordLaneDebug.js'
import { getLastWordLaneDump, setLastWordLaneSession } from './modules/rotate-phone/wordLaneLastDump.js'
import { getLastWordLaneDump as fromHook } from './modules/rotate-phone/useWordLaneDebug.js'
import { copyDebugLog } from './downloadDebugLog.js'

// Раздел «Игра «Повтори за диктором»» в текстовом журнале плеера (шапка урока → «Лог и версия»): краткая хронология последнего запуска без base64 аудио
afterEach(() => { setLastWordLaneSession(null); vi.unstubAllGlobals() })

const sampleDump = () => {
  let t = 1000
  const log = createWordLaneDebug({ enabled: true, now: () => (t += 10), device: { ua: 'iPhone', weak: false, screen: { w: 390, h: 844 } }, describeMic: () => ({ game: { open: true, platform: 'ios', processing: false, audioSessionMode: 'play-and-record', micHoldMode: 'none', tracks: [{ readyState: 'live', muted: false }], settings: { sampleRate: 48000 } } }) })
  log.meta({ phrase: "I'm | trying", chunks: ["I'm", 'trying'], translation: 'Я пытаюсь', lang: 'en-US' })
  log.ext(1005, 'probe', 'gum-call', { id: 1, constraints: { audio: { echoCancellation: false } } })
  log.ext(1020, 'probe', 'gum-result', { id: 1, ok: true, ms: 230 })
  log.ext(1030, 'probe', 'play-call', { id: 1, src: 'blob:x' })
  log.ext(1040, 'probe', 'play-result', { id: 1, ok: false, error: 'NotAllowedError', ms: 3 })
  log.ext(1050, 'probe', 'audio-session', { mode: 'play-and-record', requested: 'play-and-record', ok: true })
  log.ext(1060, 'probe', 'mic-hold', { on: true, mode: 'enabled-false' })
  log.ext(1070, 'probe', 'audio-tick', { as: 'play-and-record', vis: 'visible', els: [] })
  log.ext(1080, 'probe', 'audio-tick', { as: 'play-and-record', vis: 'visible', els: [] })
  log.ext(1090, 'probe', 'audio-tick', { as: 'playback', vis: 'visible', els: [] })
  log.ext(1095, 'probe', 'volumechange', { vol: 1 })
  log.stage('dictor', { idx: 2 })
  log.level(0.2)
  log.partial('try', { seq: [] })
  log.final('trying', { seq: [1] })
  log.pill('claim', { pill: 'p1', piece: 0 })
  log.gate(true)
  log.note('note')
  log.event('finish')
  return log.dump()
}

describe('buildGameLogSection', () => {
  it('нет дампа: честная строка «нет данных», а не пустота', () => {
    const lines = buildGameLogSection(null)
    expect(lines[0]).toBe('--- Игра «Повтори за диктором» (последний запуск) ---')
    expect(lines[1]).toContain('нет данных')
  })
  it('шапка: фраза, перевод, устройство, микрофон игры, счётчики; хронология: доступы, play() и исход, audio-session, mic-hold, стадии, partial/final, пилюли', () => {
    const text = buildGameLogSection(sampleDump()).join('\n')
    expect(text).toContain("фраза: I'm | trying")
    expect(text).toContain('перевод: Я пытаюсь')
    expect(text).toContain('iPhone')
    expect(text).toContain('open=true platform=ios processing=false audioSession=play-and-record micHold=none')
    for (const part of ['probe:gum-call', 'probe:gum-result id=1 ok=true ms=230', 'probe:play-call', 'probe:play-result id=1 ok=false error=NotAllowedError', 'probe:audio-session', 'probe:mic-hold',
      'stage:dictor', 'partial text=try', 'final text=trying', 'pill:claim pill=p1', 'gate on=true', 'note:note', 'event:finish']) expect(text).toContain(part)
  })
  it('audio-tick — только при смене аудиосессии; уровни, словари и шумные события пробника пропускаются', () => {
    const text = buildGameLogSection(sampleDump()).join('\n')
    expect(text.match(/probe:audio-tick/g)).toHaveLength(2) // play-and-record (первый) и playback (смена)
    expect(text).not.toMatch(/мс level/)
    expect(text).not.toContain('volumechange')
  })
})

describe('части раздела', () => {
  it('fields: без t / type / kind, длинные значения режутся (base64 аудио в журнал не попадает)', () => {
    const long = 'A'.repeat(5000)
    const out = fields({ t: 1, type: 'x', kind: 'y', a: 1, audio: long, o: { k: long } })
    expect(out).toContain('a=1')
    expect(out).not.toMatch(/^t=|type=|kind=/)
    expect(out).toContain('(5000 симв.)')
    expect(out.length).toBeLessThan(MAX_FIELD * 4)
  })
  it('eventLine: время, тип:вид, поля', () => {
    expect(eventLine({ t: 12, type: 'probe', kind: 'gum-call', id: 3 })).toMatch(/12мс probe:gum-call id=3$/)
    expect(eventLine({ t: 5, type: 'note' })).toMatch(/5мс note$/)
  })
  it('pickEvents: черновиков распознавания не больше MAX_PARTIALS, итоги final идут все', () => {
    const events = [...Array.from({ length: MAX_PARTIALS + 30 }, (_, i) => ({ t: i, type: 'partial', text: 'a' })), { t: 999, type: 'final', text: 'b' }]
    const out = pickEvents(events)
    expect(out.filter(e => e.type === 'partial')).toHaveLength(MAX_PARTIALS)
    expect(out.filter(e => e.type === 'final')).toHaveLength(1)
  })
  it('clip: много строк — начало и конец, середина сворачивается в одну строку', () => {
    const lines = Array.from({ length: MAX_LINES + 50 }, (_, i) => `l${i}`)
    const out = clip(lines)
    expect(out).toHaveLength(MAX_LINES + 1)
    expect(out[0]).toBe('l0')
    expect(out[HEAD_LINES]).toContain('пропущено 50 строк')
    expect(out.at(-1)).toBe(`l${MAX_LINES + 49}`)
    expect(clip(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('countsLine считает по типам', () => {
    expect(countsLine([{ type: 'level' }, { type: 'level' }, { type: 'probe' }])).toBe('level:2 probe:1')
  })
})

describe('последний дамп игры и общий журнал плеера', () => {
  it('getLastWordLaneDump: нет игры / отладка выключена — null; сессия отдаёт актуальный дамп на момент вызова; хук его реэкспортирует', () => {
    expect(getLastWordLaneDump()).toBeNull()
    setLastWordLaneSession({ enabled: false, dump: () => ({ x: 1 }) })
    expect(getLastWordLaneDump()).toBeNull()
    const log = createWordLaneDebug({ enabled: true, now: () => 1 })
    setLastWordLaneSession(log)
    expect(getLastWordLaneDump().events).toHaveLength(0)
    log.event('later')
    expect(getLastWordLaneDump().events).toHaveLength(1) // дамп — на момент экспорта
    expect(fromHook).toBe(getLastWordLaneDump)
    setLastWordLaneSession({ enabled: true, dump() { throw new Error('boom') } })
    expect(getLastWordLaneDump()).toBeNull()
  })
  it('экспорт плеера (copyDebugLog) приносит раздел игры после Downloads; без игры — строку «нет данных»', async () => {
    let text = ''
    vi.stubGlobal('navigator', { userAgent: 'test', clipboard: { writeText: async t => { text = t } } })
    await copyDebugLog({ nodeAppearLog: [], debugItems: [], events: [] })
    expect(text).toContain('--- Downloads ---')
    expect(text).toContain('--- Игра «Повтори за диктором» (последний запуск) ---')
    expect(text).toContain('нет данных')
    setLastWordLaneSession(createWordLaneDebug({ enabled: true, now: () => 1 }))
    await copyDebugLog({ nodeAppearLog: [], debugItems: [], events: [] })
    expect(text.indexOf('--- Downloads ---')).toBeLessThan(text.indexOf('Игра «Повтори за диктором»'))
    expect(text).not.toContain('нет данных')
  })
})
