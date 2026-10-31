import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createWordLaneDebug, NO_DEBUG, debugEnabled, collectDevice, MAX_EVENTS, LEVEL_EVERY_MS, WL_DEBUG_KEY } from './wordLaneDebug.js'
import { createDebugSession, logPillEvents } from './useWordLaneDebug.js'
import { createStudentGame, stepStudent, setStudentDebug } from './wordLaneStudent.js'
import { createWordListener } from './wordLaneListen.js'
import { buildRecipe } from './wordLaneRecipe.js'

// «Скачать отладку», часть 1: журнал (буфер, прореживание уровня, формат dump), выключенный режим, включение, события пилюль и слушателя. Выгрузка, запись и кнопка — wordLaneDebugExport.test.js, пробник — wordLaneDebugProbe.test.js.
const clock = (start = 1000000) => { let t = start; const now = () => t; now.add = v => { t += v }; return now }

describe('включение отладки', () => {
  it('выключена по умолчанию; включают тумблер админки или localStorage pithy_wl_debug_v1 = 1', () => {
    const store = v => ({ getItem: k => (k === WL_DEBUG_KEY ? v : null) })
    expect(debugEnabled({ store: store(null) })).toBe(false)
    expect(debugEnabled({ store: store('0') })).toBe(false)
    expect(debugEnabled({ store: store('1') })).toBe(true)
    expect(debugEnabled({ toggle: true, store: store(null) })).toBe(true)
    expect(debugEnabled({ store: { getItem() { throw new Error('private') } } })).toBe(false) // приватный режим
  })
  it('выключенный журнал — общий объект с пустыми функциями, ничего не копится', () => {
    const log = createWordLaneDebug({ enabled: false })
    expect(log).toBe(NO_DEBUG)
    expect(log.enabled).toBe(false)
    for (const k of ['event', 'level', 'partial', 'final', 'pill', 'stage', 'note', 'mute', 'gate', 'meta', 'grammar', 'listen', 'ext']) {
      expect(log[k]('x', { a: 1 })).toBeUndefined()
    }
    expect(log.dump()).toBeNull()
    expect(createWordLaneDebug()).toBe(NO_DEBUG) // без аргументов — тоже выключен
    expect(createDebugSession({ enabled: false })).toBe(NO_DEBUG)
  })
})

describe('журнал: события и dump()', () => {
  it('метка времени — от старта игры, формат записи { t, type, kind, ... }', () => {
    const now = clock()
    const log = createWordLaneDebug({ enabled: true, now })
    now.add(1500); log.stage('student', { idx: 4 })
    now.add(200); log.partial('i am', { seq: [0], misses: 0 })
    now.add(100); log.final('i am trying', { seq: [0], misses: 1 })
    now.add(10); log.pill('claim', { rep: 0, pill: 3, tk: 3 })
    now.add(10); log.note('note'); log.mute(900); log.gate(true); log.event('status', { status: 'listening' })
    const ev = log.dump().events
    expect(ev[0]).toEqual({ t: 1500, type: 'stage', kind: 'student', idx: 4 })
    expect(ev[1]).toEqual({ t: 1700, type: 'partial', text: 'i am', seq: [0], misses: 0 })
    expect(ev[2]).toMatchObject({ t: 1800, type: 'final', text: 'i am trying', misses: 1 })
    expect(ev[3]).toEqual({ t: 1810, type: 'pill', kind: 'claim', rep: 0, pill: 3, tk: 3 })
    expect(ev[4]).toEqual({ t: 1820, type: 'note', kind: 'note' })
    expect(ev[5]).toEqual({ t: 1820, type: 'mute', ms: 900 })
    expect(ev[6]).toEqual({ t: 1820, type: 'gate', on: true })
    expect(ev[7]).toEqual({ t: 1820, type: 'event', kind: 'status', status: 'listening' })
  })
  it('dump(): version, startedAt, device, mic, phrase, chunks, grammar, events; describeMic зовётся через try', () => {
    const t0 = Date.parse('2026-10-29T10:00:00Z')
    const now = clock(t0)
    const device = collectDevice({ weak: true, nav: { userAgent: 'UA', platform: 'iPhone' }, scr: { width: 390, height: 844 }, win: { innerWidth: 390, innerHeight: 700, devicePixelRatio: 3 } })
    const log = createWordLaneDebug({ enabled: true, now, device, describeMic: () => ({ settings: { echoCancellation: false } }), extras: () => ({ playerLog: ['[mic] ok'] }) })
    log.meta({ phrase: 'i am | trying', chunks: ['i am', 'trying'], lang: 'en-US', translation: 'я пытаюсь' })
    log.grammar(['i am trying'], JSON.stringify(['i am trying', '[unk]']))
    log.grammar(['i am trying'], JSON.stringify(['i am trying', '[unk]'])) // тот же словарь не дублируется
    const d = log.dump()
    expect(d).toMatchObject({ version: 1, startedAt: '2026-10-29T10:00:00.000Z', startedAtMs: t0, phrase: 'i am | trying', chunks: ['i am', 'trying'], lang: 'en-US', dropped: 0, playerLog: ['[mic] ok'] })
    expect(d.device).toEqual({ ua: 'UA', platform: 'iPhone', weak: true, screen: { w: 390, h: 844, innerW: 390, innerH: 700, dpr: 3 } })
    expect(d.mic).toEqual({ settings: { echoCancellation: false } })
    expect(d.grammar).toEqual([{ targets: ['i am trying'], phrases: ['i am trying', '[unk]'] }])
    expect(d.events.filter(e => e.type === 'grammar')).toHaveLength(1)
    expect(createWordLaneDebug({ enabled: true, now, describeMic: () => { throw new Error('x') } }).dump().mic).toBeNull()
    expect(() => JSON.stringify(d)).not.toThrow()
  })
  it('ext(): событие извне с абсолютным временем, до старта игры — отрицательное t, dump отдаёт события по порядку времени', () => {
    const now = clock(50000)
    const log = createWordLaneDebug({ enabled: true, now })
    now.add(100); log.event('late')
    log.ext(48000, 'probe', 'gum-call', { id: 1 })
    const ev = log.dump().events
    expect(ev.map(e => e.t)).toEqual([-2000, 100])
    expect(ev[0]).toEqual({ t: -2000, type: 'probe', kind: 'gum-call', id: 1 })
  })
})

describe('журнал: уровень и буфер', () => {
  it('уровень прореживается до одной записи на LEVEL_EVERY_MS (≈ 20 Гц), в записи — пик окна', () => {
    const now = clock()
    const log = createWordLaneDebug({ enabled: true, now })
    for (let i = 0; i < 100; i++) { log.level(i === 3 ? 0.4 : 0.1); now.add(10) } // 100 кусков за секунду
    const lv = log.dump().events.filter(e => e.type === 'level')
    expect(lv.length).toBeGreaterThanOrEqual(19)
    expect(lv.length).toBeLessThanOrEqual(21)
    expect(lv[1].t - lv[0].t).toBeGreaterThanOrEqual(LEVEL_EVERY_MS)
    expect(lv.some(e => e.v === 0.4)).toBe(true) // короткий всплеск не потерян
  })
  it('ворота пишут только смену состояния', () => {
    const log = createWordLaneDebug({ enabled: true, now: clock() })
    ;[false, false, true, true, false].forEach(v => log.gate(v))
    expect(log.dump().events.map(e => e.on)).toEqual([false, true, false])
  })
  it('кольцевой буфер: не больше MAX_EVENTS, старое вытесняется, свежее остаётся, dropped считает', () => {
    const now = clock()
    const log = createWordLaneDebug({ enabled: true, now })
    for (let i = 0; i < MAX_EVENTS + 1200; i++) { log.event('e', { i }); now.add(1) }
    const d = log.dump()
    expect(d.events.length).toBeLessThanOrEqual(MAX_EVENTS)
    expect(d.dropped).toBeGreaterThanOrEqual(1200)
    expect(d.events.at(-1).i).toBe(MAX_EVENTS + 1199)
    expect(d.events[0].i).toBe(d.dropped)
  })
})

describe('слушатель → журнал', () => {
  it('listen(): partial / final / mute / grammar / level / прочее раскладываются по типам', () => {
    const log = createWordLaneDebug({ enabled: true, now: clock() })
    log.listen('partial', { raw: 'i am', seq: [], misses: 0, muted: false })
    log.listen('final', { raw: 'i am trying', seq: [0], stopBy: 'full' })
    log.listen('mute', { ms: 900 })
    log.listen('grammar', { targets: ['a'], grammar: '["a"]' })
    log.listen('level', 0.2)
    log.listen('status', { status: 'listening' })
    log.listen('stop', {})
    const ev = log.dump().events
    expect(ev.map(e => e.type + (e.kind ? ':' + e.kind : ''))).toEqual(['partial', 'final', 'mute', 'grammar', 'level', 'event:status', 'event:stop'])
    expect(ev[0]).toMatchObject({ text: 'i am', muted: false })
    expect(ev[1]).toMatchObject({ text: 'i am trying', stopBy: 'full' })
    expect(ev[0].raw).toBeUndefined()
  })
  it('createWordListener отдаёт в onDebug черновики, итог, mute, stop, статусы и конец захода', async () => {
    const seen = []
    let cb
    const listen = vi.fn(async (model, grammar, callbacks) => { cb = callbacks; return { stop() {}, cancel() {} } })
    const l = createWordListener({ targets: ['try'], expected: 1, onChange() {}, onDebug: (k, d) => seen.push([k, d]), runtime: { getModel: () => ({}) }, listen, setTimer: () => 0, clearTimer() {} })
    l.start()
    await new Promise(r => setTimeout(r, 0))
    cb.onReady(); cb.onLevel(0.05); cb.onPartial('try')
    cb.onResult('try', { stopBy: 'full', gatedMs: 120, lateChunks: 0 })
    l.mute(500); l.stop()
    expect(seen.map(([k]) => k)).toEqual(expect.arrayContaining(['grammar', 'status', 'level', 'partial', 'final', 'session-end', 'mute', 'stop']))
    expect(seen.find(([k]) => k === 'partial')[1]).toMatchObject({ raw: 'try', muted: false })
    expect(seen.find(([k]) => k === 'final')[1]).toMatchObject({ stopBy: 'full', gatedMs: 120 })
    expect(seen.filter(([k]) => k === 'status').map(([, d]) => d.status)).toEqual(['starting', 'listening'])
  })
})

describe('события пилюль и сессия', () => {
  afterEach(() => setStudentDebug(null))
  it('stepStudent отдаёт события в приёмник, когда он поставлен; без него — как раньше', () => {
    const chunks = ['i am', 'trying']
    const step = buildRecipe(chunks).rounds.flatMap(r => r.steps ?? []).find(s => s.kind === 'dictor-student')
    const got = []
    setStudentDebug((events, game, input) => got.push({ types: events.map(e => e.type), input }))
    stepStudent(createStudentGame({ step, chunks }), 0, { seq: [], misses: 0 })
    expect(got[0].types).toContain('spawn')
    expect(got[0].input).toMatchObject({ misses: 0, confirmed: true })
    setStudentDebug(null)
    expect(stepStudent(createStudentGame({ step, chunks }), 0, { seq: [], misses: 0 }).map(e => e.type)).toContain('spawn')
  })
  it('logPillEvents: id пилюли, кусок, tk / misses / seq / tail', () => {
    const log = createWordLaneDebug({ enabled: true, now: clock() })
    const pill = { id: 7, piece: 1, lane: 2, state: 'lock' }
    const rep = { idx: 0, tk: 3, tries: 0, pills: [pill] }
    logPillEvents(log, [{ type: 'spawn', rep, pills: [pill] }, { type: 'piece-ok', rep, pill }, { type: 'claim', rep, order: 1 }, { type: 'miss', rep, wrong: true }, { type: 'snap', rep, pill, full: true }, { type: 'win', rep, pill, last: true }, { type: 'fail', rep, pills: [pill], lost: false }, { type: 'late' }], { misses: 2, seq: [0, 1], tail: { target: 0, tokens: 2 }, level: 0.4567, confirmed: true })
    const ev = log.dump().events
    expect(ev.map(e => e.kind)).toEqual(['spawn', 'piece-ok', 'claim', 'miss', 'snap', 'win', 'fail', 'late'])
    expect(ev[1]).toMatchObject({ type: 'pill', rep: 0, pill: 7, piece: 1, tk: 3, misses: 2, seq: 2, tail: { target: 0, tokens: 2 }, lvl: 0.46, conf: true })
    expect(ev[2].lock).toEqual([7])
    expect(ev[3].wrong).toBe(true)
    expect(ev[5].last).toBe(true)
  })
  it('сессия: события пробника попадают в журнал (в том числе бывшие до игры), disarm отписывает', () => {
    const subs = new Set()
    const probe = { install: vi.fn(), snapshot: () => [{ at: 999000, kind: 'gum-call', id: 1 }], subscribe: fn => { subs.add(fn); return () => subs.delete(fn) }, queryPermission: async () => {} }
    const s = createDebugSession({ enabled: true, now: clock(1000000), probe, extras: () => ({}), recorderDeps: { MR: undefined, md: null } })
    s.arm(); s.arm() // StrictMode: двойной вход не дублирует снимок
    subs.forEach(fn => fn({ at: 1000500, kind: 'play-call', id: 2 }))
    s.disarm()
    expect(subs.size).toBe(0)
    expect(s.dump().events.filter(e => e.type === 'probe').map(e => [e.t, e.kind])).toEqual([[-1000, 'gum-call'], [500, 'play-call']])
    expect(probe.install).toHaveBeenCalled()
  })
  it('в игре журнал — не состояние React: события не перерисовывают оверлей', () => {
    const src = readFileSync(new URL('./useWordLaneDebug.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/useState\([^)]*events/)
    expect(src).toMatch(/NO_DEBUG/)
  })
})
