import { describe, it, expect, vi } from 'vitest'
import { startSnapshot, snapshotLine, createStartModeLog, lastStartLine, startModeHeadline, SERIES_MS } from './gameStartModeLog.js'
import { START_MODE_KEY, AUDIO_SESSION_KEY } from './gameAudioSettings.js'

// Хроника режима запуска звука «[start-mode]» (v3.3.336): только чтение состояния и строки журнала. Подставные navigator / контекст / дорожки дают ожидаемую строку; серия по таймеру пишет метки и отменяется; без API не падает.
const store = (init = {}) => ({ getItem: k => init[k] ?? null })
const track = (over = {}) => ({ readyState: 'live', muted: false, enabled: true, getSettings: () => ({ echoCancellation: false, noiseSuppression: false, autoGainControl: true, sampleRate: 48000 }), ...over })
const world = (over = {}) => ({
  nav: { audioSession: { type: 'playback', state: 'active' } }, doc: { visibilityState: 'visible' }, store: store({ [START_MODE_KEY]: 'wait' }),
  ctx: () => ({ state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: 0.021 }), others: () => [{ kind: 'sounds', state: 'running', rate: 48000 }], mic: () => ({ getAudioTracks: () => [track()] }), ...over,
})

describe('снимок и строка', () => {
  it('подставное окружение → строка одного вида со всеми полями', () => {
    expect(snapshotLine('после begin (тип поставлен)', startSnapshot(world()), { sinceMs: 12.4 })).toBe(
      '[start-mode] после begin (тип поставлен): режим=wait, тип сессии игры=playback; audioSession=playback/active; ctx игры=running 48000 Гц задержка 5/21 мс; ctx звуков=running 48000 Гц; другие ctx=нет; '
      + 'микрофон=live muted=нет enabled=да (эхо нет, шум нет, AGC да, 48000 Гц); вкладка=visible; +12 мс с тапа')
  })
  it('нет API, контекста и потока — не падает, пишет «нет»', () => {
    const s = startSnapshot({ nav: {}, doc: undefined, store: store(), ctx: () => null, others: () => [], mic: () => null })
    expect(snapshotLine('тап', s)).toBe('[start-mode] тап: режим=default, тип сессии игры=playback; audioSession=нет API; ctx игры=нет; ctx звуков=нет; другие ctx=нет; микрофон=нет потока; вкладка=—; +— мс с тапа')
    const boom = () => { throw new Error('x') }
    expect(() => startSnapshot({ nav: { get audioSession() { return boom() } }, ctx: boom, others: boom, mic: boom, store: { getItem: boom } })).not.toThrow()
    expect(() => startSnapshot()).not.toThrow() // настоящие умолчания в node: ни navigator.audioSession, ни document
  })
  it('снимок только читает: в audioSession, контекст и дорожку ничего не пишется, методы не зовутся', () => {
    const frozen = o => new Proxy(o, { set() { throw new Error('запись!') } })
    const t = track({ stop: vi.fn(), applyConstraints: vi.fn() }), c = { state: 'suspended', sampleRate: 44100, baseLatency: 0, outputLatency: 0, resume: vi.fn(), suspend: vi.fn(), close: vi.fn() }
    const s = startSnapshot(world({ nav: { audioSession: frozen({ type: 'auto', state: 'inactive' }), mediaDevices: { getUserMedia: vi.fn() } }, ctx: () => frozen(c), mic: () => ({ getAudioTracks: () => [frozen(t)] }), store: store({ [AUDIO_SESSION_KEY]: 'auto' }) }))
    expect(s.session).toEqual({ type: 'auto', state: 'inactive' }); expect(s.sessionMode).toBe('auto'); expect(s.tracks[0].agc).toBe(true)
    for (const f of [t.stop, t.applyConstraints, c.resume, c.suspend, c.close]) expect(f).not.toHaveBeenCalled()
  })
})

describe('хроника старта', () => {
  function make() {
    const lines = [], timers = new Map(); let id = 0, t = 1000
    const w = world(), as = w.nav.audioSession
    const log = createStartModeLog({ log: l => lines.push(l), snap: () => startSnapshot(w), now: () => t, setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id }, clearTimer: i => timers.delete(i) })
    return { log, lines, timers, as, tick: ms => { t += ms }, fire: ms => { for (const [i, x] of [...timers]) if (x.ms === ms) { timers.delete(i); x.fn() } } }
  }
  it('метки по порядку, время с тапа, «изменилось» — только когда поле сменилось', () => {
    const { log, lines, as, tick } = make()
    as.type = 'auto'; log.begin(); tick(3); as.type = 'play-and-record'; log.mark('после begin (тип поставлен)'); log.mark('getUserMedia вызван')
    tick(600); log.micAnswer('granted'); as.type = 'playback'; log.afterMic('granted')
    expect(lines.map(l => l.slice(0, l.indexOf(':')))).toEqual(['[start-mode] тап (до смены типа)', '[start-mode] после begin (тип поставлен)', '[start-mode] getUserMedia вызван', '[start-mode] getUserMedia ответил', '[start-mode] после afterMic (микрофон'])
    expect(lines[0]).toMatch(/audioSession=auto\/active.*\+0 мс с тапа$/); expect(lines[1]).toMatch(/\+3 мс с тапа; изменилось: audioSession$/)
    expect(lines[2]).not.toContain('изменилось'); expect(lines[3]).toContain('getUserMedia ответил: granted (до afterMic)'); expect(lines[4]).toMatch(/\+603 мс с тапа; изменилось: audioSession$/)
    expect(log.last()).toMatchObject({ mode: 'wait', type: 'playback', mic: 'granted' })
    expect(lastStartLine(log.last())).toMatch(/^Последний старт: режим wait, тип после старта playback, микрофон granted/)
  })
  it('серия по таймеру: 250, 500, 1000, 2000, 4000 мс после ответа микрофона; cancel снимает оставшиеся', () => {
    const { log, lines, timers, fire } = make()
    log.begin(); log.afterMic('off') // «Тапаю»: отметки «до afterMic» не было — ответ пишется здесь
    expect(lines[1]).toContain('getUserMedia ответил: off'); expect([...timers.values()].map(x => x.ms)).toEqual(SERIES_MS)
    fire(250); fire(500)
    expect(lines.slice(-2).map(l => l.slice(0, l.indexOf(':')))).toEqual(['[start-mode] через 250 мс после ответа микрофона', '[start-mode] через 500 мс после ответа микрофона'])
    expect(log.pending()).toBe(3); expect(log.cancel('конец звука игры')).toBe(3); expect(timers.size).toBe(0)
    expect(lines.at(-1)).toBe('[start-mode] серия снимков остановлена (конец звука игры): не снято 3')
    const n = lines.length; expect(log.cancel()).toBe(0); expect(lines.length).toBe(n) // повторно — молча
  })
  it('micAnswer вне старта молчит (повторное открытие микрофона в игре); новый begin снимает прежнюю серию', () => {
    const { log, lines, timers } = make()
    expect(log.micAnswer('granted')).toBe(null); expect(lines).toEqual([])
    log.begin(); log.afterMic('granted'); expect(log.micAnswer('granted')).toBe(null)
    log.begin(); expect(timers.size).toBe(0)
  })
  it('сбой снимка или журнала старту не мешает', () => {
    const log = createStartModeLog({ log: () => { throw new Error('журнал') }, snap: () => { throw new Error('снимок') }, setTimer: () => { throw new Error('таймер') } })
    expect(() => { log.begin(); log.mark('x'); log.micAnswer('granted'); log.afterMic('granted'); log.cancel() }).not.toThrow()
  })
  it('шапка отправки: режим, тип сессии игры, audioSession и итог последнего старта одной строкой', () => {
    expect(startModeHeadline({ snap: () => startSnapshot(world()), last: null })).toBe('режим запуска звука: wait, тип сессии игры: playback; audioSession сейчас: playback/active; Последний старт: ещё не было (с загрузки страницы)')
    expect(lastStartLine({ mode: 'late', sessionMode: 'auto', type: 'auto', mic: 'denied', tracks: 'нет потока', label: 'x' })).toContain('режим late (не действует: тип сессии игры auto), тип после старта auto, микрофон denied')
  })
})
