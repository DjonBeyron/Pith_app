import { describe, it, expect } from 'vitest'
import { decideMic, micGate, createSayPermission, EXPLAINED_KEY, DENIED_KEY, PRE_SHOWN_KEY, CANT_SPEAK_KEY } from './sayPermission.js'
import { planTap } from './sayFlow.js'
import { emptyView } from './speechController.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const base = { supported: true, cantSpeak: false, denied: false, perm: 'prompt', explained: false, micOk: false }

describe('decideMic — чистое решение по тапу на микрофон: full / short / none / blocked', () => {
  const gate = x => micGate(decideMic({ ...base, ...x }))

  it('(а) самый первый раз на устройстве (prompt или iPhone без Permissions API, пояснения не было) → ПОЛНОЕ пояснение', () => {
    expect(decideMic(base)).toEqual({ action: 'explain', kind: 'full' })
    expect(decideMic({ ...base, perm: 'unavailable' })).toEqual({ action: 'explain', kind: 'full' })
    expect(gate({})).toBe('full')
  })

  it('(б) дальше, когда системный диалог ожидается: prompt — КОРОТКИЙ попап каждый раз; iPhone (query недоступен) — на первом нажатии запуска', () => {
    expect(decideMic({ ...base, explained: true })).toEqual({ action: 'explain', kind: 'short' })
    expect(decideMic({ ...base, explained: true, preShown: true })).toEqual({ action: 'explain', kind: 'short' }) // prompt: диалог будет снова
    expect(gate({ explained: true, perm: 'unavailable' })).toBe('short')                // первое нажатие в этом запуске
    expect(gate({ explained: true, perm: 'unavailable', preShown: true })).toBe('none') // попап в этом запуске уже был
  })

  it('(в) разрешение уже есть (granted) — попапа нет, даже если пояснения не было; в этом запуске микрофон уже работал — тоже нет', () => {
    expect(decideMic({ ...base, perm: 'granted' })).toEqual({ action: 'listen' })
    expect(gate({ perm: 'granted', explained: true })).toBe('none')
    expect(gate({ perm: 'unavailable', micOk: true })).toBe('none')
    expect(gate({ perm: 'prompt', explained: true, micOk: true })).toBe('none')
  })

  it('(г) отказ: флаг сессии или query=denied → запасной режим blocked (start() не зовётся) независимо от пояснений', () => {
    expect(decideMic({ ...base, denied: true })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decideMic({ ...base, perm: 'denied' })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decideMic({ ...base, perm: 'denied', explained: true, micOk: false })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(gate({ denied: true, explained: true, preShown: true })).toBe('blocked')
  })

  it('нет распознавания или включено «Не могу говорить» → blocked; «нет распознавания» сильнее', () => {
    expect(decideMic({ ...base, supported: false, cantSpeak: true })).toEqual({ action: 'fallback', reason: 'unsupported' })
    expect(decideMic({ ...base, cantSpeak: true, perm: 'granted' })).toEqual({ action: 'fallback', reason: 'cant_speak' })
    expect(gate({ cantSpeak: true })).toBe('blocked')
  })
})

describe('createSayPermission — один экземпляр состояния на запуск', () => {
  function make({ perm = 'prompt', supported = true } = {}) {
    const local = store(), session = store()
    const p = createSayPermission({ local, session, queryPerm: async () => perm, isSupported: () => supported })
    return { p, local, session }
  }

  it('первый запуск: полное пояснение; после «Понятно» флаг в localStorage — полное больше не показываем (дальше короткий, пока диалог ОС ожидается)', async () => {
    const { p, local } = make()
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'explain', kind: 'full' })
    p.markExplained()
    expect(local.m.get(EXPLAINED_KEY)).toBe('1')
    expect(p.decide()).toEqual({ action: 'explain', kind: 'short' }) // perm=prompt: диалог ОС ожидается снова
  })

  it('перезапуск iPhone: новый экземпляр (память пуста), localStorage помнит пояснение → КОРОТКИЙ попап на первом нажатии запуска, потом без попапа', async () => {
    const local = store(), session = store()
    local.setItem(EXPLAINED_KEY, '1')
    const p = createSayPermission({ local, session, queryPerm: async () => 'unavailable', isSupported: () => true })
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'explain', kind: 'short' })
    p.markPreShown()
    expect(session.m.get(PRE_SHOWN_KEY)).toBe('1')
    expect(p.isPreShown()).toBe(true)
    expect(p.decide()).toEqual({ action: 'listen' }) // попап в этом запуске уже был (отказа нет — второй раз не донимаем)
    const next = createSayPermission({ local, session: store(), queryPerm: async () => 'unavailable', isSupported: () => true }) // новый холодный запуск: sessionStorage пуст
    await next.refresh()
    expect(next.decide()).toEqual({ action: 'explain', kind: 'short' })
  })

  it('resetHints (кнопка админа): чистит explained / denied / pre_shown / cant_speak и micOk — снова «первый раз»', async () => {
    const { p, local, session } = make({ perm: 'unavailable' })
    await p.refresh()
    p.markExplained(); p.markPreShown(); p.markMicOk(); p.markDenied(); p.setCantSpeak(true)
    expect(p.decide().action).toBe('fallback')
    p.resetHints()
    expect(local.m.has(EXPLAINED_KEY)).toBe(false)
    for (const k of [DENIED_KEY, PRE_SHOWN_KEY, CANT_SPEAK_KEY]) expect(session.m.has(k), k).toBe(false)
    expect(p.decide()).toEqual({ action: 'explain', kind: 'full' })
  })

  it('granted при запуске (Android после первого «Разрешить») → сразу слушаем', async () => {
    const { p } = make({ perm: 'granted' })
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'listen' })
  })

  it('markMicOk: второй модуль в том же запуске не спрашивает снова, даже если query ничего не знает', async () => {
    const { p } = make({ perm: 'unavailable' })
    await p.refresh()
    p.markExplained()
    p.markMicOk()
    expect(p.decide()).toEqual({ action: 'listen' })
  })

  it('query=denied запоминается в sessionStorage; отказ не донимает — всегда fallback', async () => {
    const { p, session } = make({ perm: 'denied' })
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'fallback', reason: 'denied' })
    expect(session.m.get(DENIED_KEY)).toBe('1')
    expect(p.isDenied()).toBe(true)
  })

  it('markDenied (not-allowed во время попытки) гасит micOk и ведёт в запасной режим', () => {
    const { p, session } = make({ perm: 'granted' })
    p.markMicOk()
    p.markDenied()
    expect(session.m.get(DENIED_KEY)).toBe('1')
    expect(p.decide()).toEqual({ action: 'fallback', reason: 'denied' })
  })

  it('«Не могу говорить» живёт в sessionStorage и снимается обратно', () => {
    const { p, session } = make()
    p.setCantSpeak(true)
    expect(session.m.get(CANT_SPEAK_KEY)).toBe('1')
    expect(p.decide()).toEqual({ action: 'fallback', reason: 'cant_speak' })
    p.setCantSpeak(false)
    expect(session.m.has(CANT_SPEAK_KEY)).toBe(false)
    expect(p.decide().action).not.toBe('fallback')
  })

  it('нет распознавания → unsupported; хранилище недоступно (приватный режим) не роняет', () => {
    const { p } = make({ supported: false })
    expect(p.decide()).toEqual({ action: 'fallback', reason: 'unsupported' })
    const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    const q = createSayPermission({ local: broken, session: broken, queryPerm: async () => 'prompt', isSupported: () => true })
    expect(() => { q.markExplained(); q.markDenied(); q.setCantSpeak(true) }).not.toThrow()
  })

  it('query бросает → unavailable', async () => {
    const p = createSayPermission({ local: store(), session: store(), queryPerm: async () => { throw new Error('no') }, isSupported: () => true })
    expect(await p.refresh()).toBe('unavailable')
  })
})

describe('planTap — start() зовётся только на begin', () => {
  const idle = emptyView
  const listen = { ...emptyView, status: 'listening' }

  it('отказ в сессии: сколько ни тапай — fallback, begin никогда', async () => {
    const p = createSayPermission({ local: store(), session: store(), queryPerm: async () => 'granted', isSupported: () => true })
    p.markDenied()
    const acts = [0, 1, 2, 3].map(() => planTap({ view: idle, decision: p.decide() }).act)
    expect(acts).toEqual(['fallback', 'fallback', 'fallback', 'fallback'])
  })

  it('сценарий жизни: полное пояснение → begin → второй модуль без попапа (micOk) → «Не могу говорить» → fallback', async () => {
    const p = createSayPermission({ local: store(), session: store(), queryPerm: async () => 'prompt', isSupported: () => true })
    await p.refresh()
    expect(planTap({ view: idle, decision: p.decide() })).toEqual({ act: 'explain', kind: 'full' })
    p.markExplained()
    expect(planTap({ view: idle, decision: p.decide() })).toEqual({ act: 'explain', kind: 'short' }) // запись так и не началась — диалог ОС ещё ожидается
    p.markMicOk() // запись пошла
    expect(planTap({ view: idle, decision: p.decide() }).act).toBe('begin') // следующий модуль
    p.setCantSpeak(true)
    expect(planTap({ view: idle, decision: p.decide() }).act).toBe('fallback')
  })

  it('запись и «начали» — тап = стоп; до «начали», ожидание диалога и обработка игнорируются; число попыток не ограничено', () => {
    const d = { action: 'listen' }
    expect(planTap({ view: listen, decision: d, go: true }).act).toBe('stop')
    expect(planTap({ view: listen, decision: d, go: false }).act).toBe('ignore')
    expect(planTap({ view: { ...emptyView, status: 'starting' }, decision: d, go: true }).act).toBe('ignore')
    expect(planTap({ view: { ...emptyView, status: 'retrying' }, decision: d }).act).toBe('ignore')
    expect(planTap({ view: idle, decision: d, hold: true }).act).toBe('ignore') // квадрат с крестиком: тапы не принимаем
    expect(planTap({ view: idle, decision: d }).act).toBe('begin')
  })
})
