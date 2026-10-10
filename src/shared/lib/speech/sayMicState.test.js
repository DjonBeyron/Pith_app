import { describe, it, expect } from 'vitest'
import { hasMicAccess, micVisualState, MIC_STATES, MIC_SCALE } from './sayMicState.js'
import { micLabel } from './sayMic.js'
import { createSayPermission, MIC_GRANTED_KEY } from './sayPermission.js'
import { sayReducer, initialSayState } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'
import { MIC_IDLE, MIC_NEED_ACCESS, MIC_RETRY } from './sayTexts.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const PERMS = ['granted', 'prompt', 'denied', 'unavailable', undefined]
const state = (permission, flag, sessionOk, phase = 'idle') => micVisualState({ permission, flag, sessionOk, phase })

describe('hasMicAccess — есть ли доступ (Permissions API + флаг «уже открывался» + «работал в этом запуске»)', () => {
  it('granted по API → доступ есть при любых флагах', () => {
    for (const flag of [false, true]) for (const ok of [false, true]) expect(hasMicAccess({ permission: 'granted', flag, sessionOk: ok })).toBe(true)
  })

  it('denied по API → доступа нет, даже если флаг остался (доступ отозвали в настройках)', () => {
    for (const flag of [false, true]) for (const ok of [false, true]) expect(hasMicAccess({ permission: 'denied', flag, sessionOk: ok })).toBe(false)
  })

  it('prompt → диалог ОС ещё будет: доступа нет, пока микрофон не открылся в ЭТОМ запуске (флаг прошлых запусков не считается)', () => {
    expect(hasMicAccess({ permission: 'prompt', flag: false, sessionOk: false })).toBe(false)
    expect(hasMicAccess({ permission: 'prompt', flag: true, sessionOk: false })).toBe(false)
    expect(hasMicAccess({ permission: 'prompt', flag: false, sessionOk: true })).toBe(true)
  })

  it('unavailable / неизвестно (iPhone Safari): доступ есть по флагу «уже открывался» или по этому запуску', () => {
    for (const permission of ['unavailable', undefined, 'weird']) {
      expect(hasMicAccess({ permission, flag: false, sessionOk: false }), String(permission)).toBe(false)
      expect(hasMicAccess({ permission, flag: true, sessionOk: false }), String(permission)).toBe(true)
      expect(hasMicAccess({ permission, flag: false, sessionOk: true }), String(permission)).toBe(true)
    }
    expect(hasMicAccess()).toBe(false)
  })
})

describe('micVisualState — единое состояние кнопки на всех комбинациях', () => {
  it('idle / failed / explain: locked или ready по доступу — все комбинации permission × flag × sessionOk', () => {
    const want = (p, f, ok) => (hasMicAccess({ permission: p, flag: f, sessionOk: ok }) ? 'ready' : 'locked')
    for (const phase of ['idle', 'failed', 'explain']) {
      for (const p of PERMS) for (const f of [false, true]) for (const ok of [false, true]) {
        expect(state(p, f, ok, phase), `${phase} ${p} ${f} ${ok}`).toBe(want(p, f, ok))
      }
    }
  })

  it('locked: prompt / denied / неизвестно без флага; ready: granted или флаг при неизвестном ответе', () => {
    expect(state('prompt', false, false)).toBe('locked')
    expect(state('denied', true, false)).toBe('locked')
    expect(state('unavailable', false, false)).toBe('locked')
    expect(state(undefined, false, false)).toBe('locked')
    expect(state('granted', false, false)).toBe('ready')
    expect(state('unavailable', true, false)).toBe('ready')
  })

  it('запись (run) → active независимо от доступа (тап уже был; диалог ОС идёт поверх); passed → done; fallback → off', () => {
    for (const p of PERMS) for (const f of [false, true]) for (const ok of [false, true]) {
      expect(state(p, f, ok, 'run')).toBe('active')
      expect(state(p, f, ok, 'passed')).toBe('done')
      expect(state(p, f, ok, 'fallback')).toBe('off')
    }
  })

  it('без аргументов — locked; результат всегда из MIC_STATES; масштаб 0,85 / 1 / 1,15 / 1 / 0,85', () => {
    expect(micVisualState()).toBe('locked')
    for (const phase of ['idle', 'explain', 'run', 'passed', 'failed', 'fallback', 'xxx']) expect(MIC_STATES).toContain(state('granted', true, true, phase))
    expect(MIC_SCALE).toEqual({ locked: 0.85, ready: 1, active: 1.15, done: 1, off: 0.85 })
  })
})

describe('надпись над кругом в состоянии locked', () => {
  it('«Нужен доступ к микрофону» вместо «Нажмите, чтобы говорить» только до нажатия; остальные надписи те же', () => {
    expect(micLabel({ phase: 'idle', locked: true })).toEqual({ label: MIC_NEED_ACCESS, mode: 'idle' })
    expect(micLabel({ phase: 'explain', locked: true })).toEqual({ label: MIC_NEED_ACCESS, mode: 'idle' }) // идёт попап
    expect(micLabel({ phase: 'idle', locked: false })).toEqual({ label: MIC_IDLE, mode: 'idle' })
    expect(micLabel({ phase: 'idle' }).label).toBe(MIC_IDLE)
    expect(micLabel({ phase: 'failed', locked: true })).toEqual({ label: MIC_RETRY, mode: 'retry' })
    expect(micLabel({ phase: 'run', locked: true }).mode).toBe('prep')
  })
})

describe('жизненный цикл: доступ → запись → возврат; отзыв доступа сбрасывает флаг', () => {
  const data = readSayData({ phrase: 'I am here', keywords: 'here', threshold: 70 })
  const make = (perm = 'unavailable') => {
    const local = store()
    const p = createSayPermission({ local, session: store(), queryPerm: async () => perm, isSupported: () => true })
    return { p, local }
  }
  const look = (p, s) => micVisualState({ ...p.access(), phase: s.phase })

  it('iPhone (query недоступен): сначала locked → тап/попап → запись (active) → микрофон открылся: флаг в localStorage → после попытки ready, и на следующем запуске сразу ready', async () => {
    const { p, local } = make()
    await p.refresh()
    let s = initialSayState(p.decide())
    expect(look(p, s)).toBe('locked')
    s = sayReducer(s, { type: 'explain', kind: 'full' })
    expect(look(p, s)).toBe('locked')              // попап открыт, доступа ещё нет
    s = sayReducer(s, { type: 'begin', data })
    expect(look(p, s)).toBe('active')
    p.markMicOk()                                   // useSayPhrase: view.status === 'listening'
    expect(local.m.get(MIC_GRANTED_KEY)).toBe('1')
    s = sayReducer(s, { type: 'interrupt' })        // стоп / неудача / прерывание — попытка кончилась
    expect(look(p, s)).toBe('ready')                // вернулись к «доступ выдан»
    const next = createSayPermission({ local, session: store(), queryPerm: async () => 'unavailable', isSupported: () => true }) // новый холодный запуск
    await next.refresh()
    expect(micVisualState({ ...next.access(), phase: 'idle' })).toBe('ready')
  })

  it('доступ отозвали в настройках iOS: флаг остался, но при отказе (not-allowed → markDenied) он сбрасывается, и следующий запуск снова locked', async () => {
    const { p, local } = make()
    p.markMicOk()
    expect(local.m.get(MIC_GRANTED_KEY)).toBe('1')
    let s = sayReducer(initialSayState(p.decide()), { type: 'begin', data })
    s = sayReducer(s, { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 } })
    expect(s.phase).toBe('fallback')
    expect(look(p, s)).toBe('off')                  // в этом запуске микрофон выключен (кнопка недоступна, «Я не могу говорить»)
    p.markDenied()                                  // useSayPhrase: settledRun + fallbackReason denied
    expect(local.m.has(MIC_GRANTED_KEY)).toBe(false) // флаг сброшен
    expect(p.access()).toEqual({ permission: 'unavailable', flag: false, sessionOk: false })
    const next = createSayPermission({ local, session: store(), queryPerm: async () => 'unavailable', isSupported: () => true })
    await next.refresh()
    expect(micVisualState({ ...next.access(), phase: 'idle' })).toBe('locked') // п.1: серый круг, тап открывает попап
  })

  it('query вернул denied → флаг сбрасывается сам; query granted → ready без флага', async () => {
    const a = make('denied')
    a.p.markMicOk()
    await a.p.refresh()
    expect(a.local.m.has(MIC_GRANTED_KEY)).toBe(false)
    expect(micVisualState({ ...a.p.access(), phase: 'idle' })).toBe('locked')
    const b = make('granted')
    await b.p.refresh()
    expect(micVisualState({ ...b.p.access(), phase: 'idle' })).toBe('ready')
  })

  it('resetHints (админ) очищает флаг; повреждённое хранилище не роняет', () => {
    const { p, local } = make()
    p.markMicOk()
    p.resetHints()
    expect(local.m.has(MIC_GRANTED_KEY)).toBe(false)
    const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    const q = createSayPermission({ local: broken, session: broken, queryPerm: async () => 'prompt', isSupported: () => true })
    expect(() => { q.markMicOk(); q.access() }).not.toThrow()
    expect(q.access().sessionOk).toBe(true)
  })
})
