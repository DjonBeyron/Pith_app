import { describe, it, expect } from 'vitest'
import { decideMic, createSayPermission, EXPLAINED_KEY, DENIED_KEY, CANT_SPEAK_KEY } from './sayPermission.js'
import { planTap } from './sayFlow.js'
import { emptyView } from './speechController.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const base = { supported: true, cantSpeak: false, denied: false, perm: 'prompt', explained: false, micOk: false }

describe('decideMic — чистое решение по тапу на микрофон', () => {
  it('первый запуск в жизни устройства (prompt, пояснения не было) → пояснение, диалог ОС позже по тапу на кнопку', () => {
    expect(decideMic(base)).toEqual({ action: 'explain' })
    expect(decideMic({ ...base, perm: 'unavailable' })).toEqual({ action: 'explain' }) // iPhone без Permissions API
  })

  it('разрешение уже есть (granted) → сразу слушаем, без пояснения — даже если пояснения не было', () => {
    expect(decideMic({ ...base, perm: 'granted' })).toEqual({ action: 'listen' })
  })

  it('prompt, но пояснение уже показывали (повторный холодный запуск iPhone) → сразу к тапу, без пояснения', () => {
    expect(decideMic({ ...base, explained: true })).toEqual({ action: 'listen' })
  })

  it('в этом запуске микрофон уже работал (iPhone: query недоступен) → слушаем без пояснения', () => {
    expect(decideMic({ ...base, perm: 'unavailable', micOk: true })).toEqual({ action: 'listen' })
  })

  it('отказ: флаг сессии или query=denied → запасной режим (start() не зовётся)', () => {
    expect(decideMic({ ...base, denied: true })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decideMic({ ...base, perm: 'denied' })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decideMic({ ...base, perm: 'denied', explained: true, micOk: false })).toEqual({ action: 'fallback', reason: 'denied' })
  })

  it('нет распознавания или включено «Не могу говорить» → запасной режим; «нет распознавания» сильнее', () => {
    expect(decideMic({ ...base, supported: false, cantSpeak: true })).toEqual({ action: 'fallback', reason: 'unsupported' })
    expect(decideMic({ ...base, cantSpeak: true, perm: 'granted' })).toEqual({ action: 'fallback', reason: 'cant_speak' })
  })
})

describe('createSayPermission — один экземпляр состояния на запуск', () => {
  function make({ perm = 'prompt', supported = true } = {}) {
    const local = store(), session = store()
    const p = createSayPermission({ local, session, queryPerm: async () => perm, isSupported: () => supported })
    return { p, local, session }
  }

  it('первый запуск: пояснение; после «Понятно» флаг в localStorage — больше не показываем', async () => {
    const { p, local } = make()
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'explain' })
    p.markExplained()
    expect(local.m.get(EXPLAINED_KEY)).toBe('1')
    expect(p.decide()).toEqual({ action: 'listen' })
  })

  it('перезапуск iPhone: новый экземпляр (память пуста), localStorage помнит пояснение → без пояснения', async () => {
    const local = store()
    local.setItem(EXPLAINED_KEY, '1')
    const p = createSayPermission({ local, session: store(), queryPerm: async () => 'unavailable', isSupported: () => true })
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'listen' })
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

  it('сценарий жизни: пояснение → begin → второй модуль без пояснения (micOk) → «Не могу говорить» → fallback', async () => {
    const p = createSayPermission({ local: store(), session: store(), queryPerm: async () => 'prompt', isSupported: () => true })
    await p.refresh()
    expect(planTap({ view: idle, decision: p.decide() }).act).toBe('explain')
    p.markExplained()
    expect(planTap({ view: idle, decision: p.decide() }).act).toBe('begin')
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
    expect(planTap({ view: idle, decision: d }).act).toBe('begin')
  })
})
