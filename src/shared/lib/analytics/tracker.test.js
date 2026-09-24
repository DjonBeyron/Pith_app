import { describe, it, expect } from 'vitest'
import { createTracker } from './tracker.js'

function memStorage() {
  const m = new Map()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }
}

function setup(opts = {}) {
  let t = 1_000_000
  let ids = 0
  const sent = []
  let ok = true
  const tracker = createTracker({
    send: async (batch, meta) => { sent.push({ batch, meta }); return ok },
    storage: opts.storage ?? memStorage(),
    now: () => t,
    newId: () => `s${++ids}`,
    ...opts,
  })
  return {
    tracker, sent,
    advance: ms => { t += ms },
    fail: () => { ok = false },
    heal: () => { ok = true },
  }
}

describe('createTracker', () => {
  it('копит события с временем и сессией', () => {
    const { tracker } = setup()
    expect(tracker.push('app_open', { tg: false })).toBe(1)
    expect(tracker.push('feed_view')).toBe(2)
  })

  it('отправляет пачку и очищает очередь при успехе', async () => {
    const { tracker, sent } = setup()
    tracker.push('a'); tracker.push('b')
    expect(await tracker.flush()).toBe(2)
    expect(sent[0].batch.map(e => e.name)).toEqual(['a', 'b'])
    expect(sent[0].batch[0].sid).toBe('s1')
    expect(tracker.size()).toBe(0)
  })

  it('при ошибке сервера события остаются для повтора', async () => {
    const { tracker, fail, heal } = setup()
    tracker.push('a')
    fail()
    expect(await tracker.flush()).toBe(0)
    expect(tracker.size()).toBe(1)
    heal()
    expect(await tracker.flush()).toBe(1)
    expect(tracker.size()).toBe(0)
  })

  it('пачка не больше batchSize', async () => {
    const { tracker, sent } = setup({ batchSize: 2 })
    tracker.push('a'); tracker.push('b'); tracker.push('c')
    await tracker.flush()
    expect(sent[0].batch).toHaveLength(2)
    expect(tracker.size()).toBe(1)
  })

  it('keepalive снимает пачку сразу — без дублей при следующем запуске', async () => {
    const { tracker, sent, fail } = setup()
    tracker.push('a')
    fail()
    await tracker.flush({ keepalive: true })
    expect(sent[0].meta.keepalive).toBe(true)
    expect(tracker.size()).toBe(0)
  })

  it('пауза дольше idleMs начинает новую сессию', async () => {
    const { tracker, sent, advance } = setup({ idleMs: 1000 })
    tracker.push('a')
    advance(500); tracker.push('b')
    advance(1500); tracker.push('c')
    await tracker.flush()
    expect(sent[0].batch.map(e => e.sid)).toEqual(['s1', 's1', 's2'])
  })

  it('touchSession сообщает о новой сессии', () => {
    const { tracker, advance } = setup({ idleMs: 1000 })
    expect(tracker.touchSession()).toBe(true)
    advance(10)
    expect(tracker.touchSession()).toBe(false)
    advance(2000)
    expect(tracker.touchSession()).toBe(true)
  })

  it('потолок очереди выкидывает старое', () => {
    const { tracker } = setup({ cap: 3 })
    ;['a', 'b', 'c', 'd'].forEach(n => tracker.push(n))
    expect(tracker.size()).toBe(3)
  })

  it('очередь переживает перезапуск через storage', () => {
    const storage = memStorage()
    setup({ storage }).tracker.push('a')
    expect(setup({ storage }).tracker.size()).toBe(1)
  })

  it('битое хранилище не ломает трекер', () => {
    const storage = { getItem: () => '{oops', setItem: () => { throw new Error('quota') } }
    const { tracker } = setup({ storage })
    expect(tracker.size()).toBe(0)
    expect(tracker.push('a')).toBe(1)
  })
})
