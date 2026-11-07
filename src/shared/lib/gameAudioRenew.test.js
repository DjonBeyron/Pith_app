import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renewAudioSession, renewNeed, RENEW_AWAY_MS } from './gameAudioRenew.js'
import { createTracked, liveContexts, closeAll, resetRegistry } from './audioContextRegistry.js'

// Полное обновление аудиосессии после фона (gameAudioRenew.js): строго auto → закрыть ВСЕ контексты (и дождаться) → тип → новый игровой контекст → running; когда это нужно перед стартом
const order = []
function fakeNav(type = 'play-and-record', state = 'active') {
  const s = { state }
  let t = type
  Object.defineProperty(s, 'type', { get: () => t, set: v => { order.push(`type=${v}`); t = v }, enumerable: true })
  return { audioSession: s }
}
class Ctx {
  constructor() { this.state = 'running' }
  close() { order.push('close:start'); return new Promise(r => setTimeout(() => { order.push('close:done'); this.state = 'closed'; r() }, 5)) }
}
beforeEach(() => { order.length = 0; resetRegistry({ now: () => 0 }) })

function deps(over = {}) {
  let cur = null
  return {
    nav: fakeNav(), describe: () => liveContexts().map(r => r.kind).join(',') || 'нет', closeAll: () => closeAll(),
    recreateCtx: vi.fn(why => { order.push('create'); cur = { state: 'suspended', why }; return cur }),
    unlockCtx: vi.fn(() => { order.push('unlock'); cur.state = 'running'; return Promise.resolve('running') }),
    peekCtx: () => cur, waitRunning: vi.fn(async get => { order.push('wait'); return { state: get()?.state ?? null, tries: 0, ms: 3 } }),
    log: vi.fn(), note: vi.fn(), now: () => 0, ...over,
  }
}

describe('renewAudioSession: порядок', () => {
  it('auto → close (ВСЕ контексты страницы, дождаться) → тип → создать → разблокировать → running; журнал «ДО … ПОСЛЕ»', async () => {
    createTracked('sounds', undefined, { Ctor: Ctx }); createTracked('game', undefined, { Ctor: Ctx }); createTracked('capture', undefined, { Ctor: Ctx })
    const d = deps()
    const applyType = vi.fn(() => { d.nav.audioSession.type = 'play-and-record' })
    const r = await renewAudioSession({ reason: 'фон 556 с', applyType }, d)
    expect(order).toEqual(['type=auto', 'close:start', 'close:start', 'close:start', 'close:done', 'close:done', 'close:done', 'type=play-and-record', 'create', 'unlock', 'wait'])
    expect(r).toMatchObject({ ok: true, state: 'running', closed: 3, kinds: ['sounds', 'game', 'capture'], type: 'play-and-record', steps: ['auto', 'close', 'type', 'create', 'unlock', 'running'] })
    expect(liveContexts()).toEqual([])
    const L = d.log.mock.calls.map(c => c[0])
    expect(L[0]).toBe('[audio] renew (фон 556 с): ДО — sounds,game,capture; audioSession=play-and-record/active')
    expect(L.at(-1)).toMatch(/^\[audio\] renew \(фон 556 с\): ДО — sounds,game,capture; .*; auto; закрыто 3 \(sounds, game, capture\); тип play-and-record; новый ctx running за 0 мс; ПОСЛЕ — нет; audioSession=play-and-record\/active/)
    expect(d.recreateCtx).toHaveBeenCalledWith('обновление аудиосессии: фон 556 с')
  })
  it('пальцами (wantType auto): тип остаётся снятым; wantType другой — записывается после закрытия', async () => {
    const d = deps()
    expect((await renewAudioSession({ reason: 'x', wantType: 'auto' }, d)).type).toBe('auto')
    expect(order.filter(o => o.startsWith('type='))).toEqual(['type=auto'])
    order.length = 0
    await renewAudioSession({ reason: 'x', wantType: 'playback' }, deps())
    expect(order.filter(o => o.startsWith('type='))).toEqual(['type=auto', 'type=playback'])
  })
  it('нет navigator.audioSession (не iOS) — всё равно закрывает и создаёт; контекст не запустился — ok false; ничего не бросает', async () => {
    const d = deps({ nav: {}, waitRunning: async () => ({ state: 'interrupted', tries: 7, ms: 1500 }), closeAll: () => Promise.reject(new Error('x')) })
    const r = await renewAudioSession({ reason: 'x' }, d)
    expect(r).toMatchObject({ ok: false, state: 'interrupted', closed: 0 })
    expect(d.log.mock.calls.at(-1)[0]).toMatch(/audioSession=нет API.*новый ctx interrupted/)
  })
})

describe('renewNeed: когда обновлять сессию при старте', () => {
  const live = (...a) => a.map(([kind, createdAt]) => ({ kind, createdAt, state: 'running' }))
  it('фон дольше 20 с с пометкой «звук после фона»', () => {
    expect(renewNeed({ suspect: 'focus после 556 с', away: { hiddenAt: 100, awayMs: 556000 }, live: [], session: null })).toBe('фон 556 с')
    expect(renewNeed({ suspect: 'focus', away: { hiddenAt: 100, awayMs: RENEW_AWAY_MS - 1 }, live: [], session: null })).toBeNull()
    expect(renewNeed({ suspect: null, away: { hiddenAt: 100, awayMs: 556000 }, live: [], session: null })).toBeNull() // уже обновлялись со времени этого фона
  })
  it('живы контексты, созданные до последнего ухода в фон (sounds из первой игры)', () => {
    expect(renewNeed({ away: { hiddenAt: 1000, awayMs: 5000 }, live: live(['sounds', 10], ['game', 2000]), session: null })).toBe('живы контексты старше ухода в фон: sounds')
    expect(renewNeed({ away: { hiddenAt: null, awayMs: null }, live: live(['sounds', 10]), session: null })).toBeNull()
  })
  it('audioSession.state не active (если API есть); причины складываются', () => {
    expect(renewNeed({ away: null, live: [], session: { type: 'auto', state: 'inactive' } })).toBe('audioSession.state=inactive')
    expect(renewNeed({ away: null, live: [], session: { type: 'auto', state: 'active' } })).toBeNull()
    expect(renewNeed({ suspect: 'v', away: { hiddenAt: 5, awayMs: 30000 }, live: live(['sounds', 1]), session: { state: 'interrupted' } })).toBe('фон 30 с; живы контексты старше ухода в фон: sounds; audioSession.state=interrupted')
  })
})
