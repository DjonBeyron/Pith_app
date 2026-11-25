import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { foldPillRecords, pillSeen, pillLine, watchPills, WATCH_ATTRS, FOLD_MS } from './wordLanePillWatch.js'

// Подставная пилюля: атрибуты в Map, без DOM
const pill = (attrs = {}) => { const m = new Map(Object.entries({ 'data-testid': 'wl-pill-3', 'data-lane': '2', 'data-cap': 'я', 'data-held': '1', ...attrs })); return { nodeType: 1, isConnected: true, hasAttribute: a => m.has(a), getAttribute: a => m.get(a) ?? null, set: (a, v = '1') => m.set(a, v), del: a => m.delete(a), closest() { return this } } }
const style = (o = {}) => () => ({ display: 'block', visibility: 'visible', opacity: '1', ...o })
afterEach(() => vi.useRealTimers())

describe('журнал «[pill]»: что менялось на летящей пилюле', () => {
  it('пачка записей сворачивается по пилюлям: признаки с направлением, счёт добавленных и убранных узлов', () => {
    const el = pill({ 'data-live': '1', 'data-ring': '1' })
    const f = foldPillRecords([{ type: 'attributes', target: el, attributeName: 'data-live' }, { type: 'attributes', target: el, attributeName: 'data-ring' }, { type: 'attributes', target: el, attributeName: 'data-wrong' }, { type: 'childList', target: el, addedNodes: [1, 2], removedNodes: [1] }, { type: 'attributes', target: {}, attributeName: 'x' }], n => (n === el ? el : null))
    expect([...f.get(el).attrs]).toEqual([['data-live', '+'], ['data-ring', '+'], ['data-wrong', '−']])
    expect(f.get(el).added).toBe(2); expect(f.get(el).removed).toBe(1); expect(f.size).toBe(1)
  })
  it('видимость по стилям: узел вне документа, display, visibility, opacity < 1 — тело не видно', () => {
    expect(pillSeen(pill(), style())).toEqual({ ok: true, why: 'видна' })
    expect(pillSeen({ ...pill(), isConnected: false }, style()).why).toBe('узел вне документа')
    expect(pillSeen(pill(), style({ display: 'none' })).ok).toBe(false)
    expect(pillSeen(pill(), style({ visibility: 'hidden' })).why).toBe('visibility hidden')
    expect(pillSeen(pill(), style({ opacity: '0.4' })).why).toBe('opacity 0.40')
  })
  it('строка: номер, подпись, дорожка, признаки, узлы, видимость; ⚠ — только у летящей (не взлёт и не «не успел»)', () => {
    const el = pill({ 'data-live': '1' }), ch = { attrs: new Map([['data-live', '+'], ['data-ring', '+']]), added: 1, removed: 0 }
    expect(pillLine(el, ch, { ok: true, why: 'видна' })).toBe('[pill] №3 «я» дорожка 2: +live +ring; узлов +1 −0; видна')
    expect(pillLine(el, ch, { ok: false, why: 'opacity 0.00' })).toMatch(/opacity 0\.00 ⚠ тело не видно$/)
    expect(pillLine(pill({ 'data-rise': '1' }), ch, { ok: false, why: 'opacity 0.30' })).not.toMatch(/⚠/) // взлёт: гаснет по замыслу
    expect(pillLine(el, { attrs: new Map([['data-held', '+']]), added: 0, removed: 0 }, { ok: true, why: 'видна' })).toBeNull() // выдача из пула — не событие
  })
  it('наблюдатель: один на поле, смены одной пилюли за FOLD_MS — одной строкой; пилюля в пуле (без data-held) не пишется; stop снимает', () => {
    vi.useFakeTimers()
    let cb = null; const obs = { observe: vi.fn(), disconnect: vi.fn() }
    const Observer = function (fn) { cb = fn; return obs }
    const log = vi.fn(), root = {}, el = pill({ 'data-live': '1' }), pooled = pill(); pooled.del('data-held')
    const stop = watchPills(root, { log, Observer, raf: null, now: () => 0, seen: () => ({ ok: true, why: 'видна' }) })
    expect(obs.observe).toHaveBeenCalledWith(root, { subtree: true, attributes: true, attributeFilter: WATCH_ATTRS, childList: true })
    cb([{ type: 'attributes', target: el, attributeName: 'data-live' }, { type: 'attributes', target: pooled, attributeName: 'data-live' }])
    el.set('data-wrong'); cb([{ type: 'attributes', target: el, attributeName: 'data-wrong' }])
    expect(log).not.toHaveBeenCalled()
    vi.advanceTimersByTime(FOLD_MS + 1)
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toBe('[pill] №3 «я» дорожка 2: +live; видна ‖ +wrong; видна')
    stop(); expect(obs.disconnect).toHaveBeenCalled()
  })
  it('в кадре после смены тело летящей пилюли не видно — отдельная строка ⚠', () => {
    vi.useFakeTimers()
    let cb = null; const frames = []
    const log = vi.fn(), el = pill({ 'data-wrong': '1' })
    watchPills({}, { log, Observer: function (fn) { cb = fn; return { observe() {}, disconnect() {} } }, raf: fn => frames.push(fn), now: () => 0, seen: () => ({ ok: false, why: 'opacity 0.00' }) })
    cb([{ type: 'attributes', target: el, attributeName: 'data-wrong' }])
    frames.forEach(fn => fn())
    expect(log.mock.calls.map(c => c[0])).toContain('[pill] ⚠ №3 «я»: в кадре после смены тело не видно — opacity 0.00')
  })
  it('нет MutationObserver / поля — ничего не делает; подключён к полю пилюль, работает только при отладочном интерфейсе', () => {
    expect(watchPills(null)()).toBeUndefined(); expect(watchPills({}, { Observer: null })()).toBeUndefined()
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    expect(read('./WordLanePills.jsx')).toContain('usePillWatch(rootRef, watch)')
    expect(read('./WordLaneGame.jsx')).toContain('watch={f.dbg.enabled}')
    expect(read('./wordLanePillWatch.js')).toContain('export function usePillWatch(rootRef, on = false)')
  })
})
