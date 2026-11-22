import { describe, it, expect } from 'vitest'
import { hInit, hPush, hUndo, hRedo, canUndo, canRedo, serialize, serverDraft, restore, loadDraft, saveDraft, draftKey, newest, safeStore, HISTORY_MAX, DRAFTS_KEEP, DRAFT_PREFIX } from './montageHistory.js'
import { mergeRuns, saveTimelineEdits, runsOf, TIMELINE_KEY } from '../../../shared/api/timelineApi.js'

const e = (key, to, from = 1000) => ({ key, mode: 'ripple', from, to })
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, v); return true }, del: k => { m.delete(k) }, keys: () => [...m.keys()], m } }

describe('история черновика: отмена и возврат без ограничения «один шаг»', () => {
  it('весь стек: пять шагов назад и пять вперёд; новый шаг после отмены сбрасывает «вернуть»', () => {
    let h = hInit()
    const states = [[e('a', 1)], [e('a', 1), e('b', 2)], [e('a', 3), e('b', 2)], [e('b', 2)], []] // добавил, добавил, изменил, убрал правку, сбросил всё
    for (const s of states) h = hPush(h, s)
    expect(h.past).toHaveLength(5); expect(canUndo(h)).toBe(true); expect(canRedo(h)).toBe(false)
    for (let i = states.length - 2; i >= 0; i--) { h = hUndo(h); expect(h.now).toEqual(states[i]) } // «сбросить всё» и «убрать правку» отменяются как любой шаг
    h = hUndo(h); expect(h.now).toEqual([]); expect(canUndo(h)).toBe(false); expect(hUndo(h)).toBe(h) // дальше отменять нечего — состояние то же
    for (const s of states) { h = hRedo(h); expect(h.now).toEqual(s) }
    expect(hRedo(h)).toBe(h)
    h = hPush(hUndo(hUndo(h)), [e('z', 9)])
    expect(canRedo(h)).toBe(false); expect(hUndo(h).now).toEqual(states[2])
  })

  it('тот же список — не шаг; история не растёт без предела', () => {
    let h = hPush(hInit(), [e('a', 1)])
    expect(hPush(h, [e('a', 1)])).toBe(h)
    for (let i = 0; i < HISTORY_MAX + 50; i++) h = hPush(h, [e('a', i + 2)])
    expect(h.past).toHaveLength(HISTORY_MAX)
  })

  it('история неизменяема: отмена возвращает прежний список тем же объектом, старые состояния не портятся', () => {
    const first = [e('a', 1)], h1 = hPush(hInit(), first), h2 = hPush(h1, [e('a', 2)])
    expect(hUndo(h2).now).toBe(first); expect(h1.now).toBe(first); expect(h1.future).toEqual([])
  })
})

describe('черновик в хранилище: не теряется при закрытии экрана и перезагрузке', () => {
  it('сериализация и восстановление: список правок И история отмены возвращаются целиком', () => {
    let h = hInit()
    for (const s of [[e('a', 1)], [e('a', 1), e('b', 2)], [e('b', 2)]]) h = hPush(h, s)
    h = hUndo(h)
    const store = mem(), now = new Date('2026-11-22T10:00:00Z')
    expect(saveDraft(store, 'run-1', h, now)).toBe(true)
    expect(JSON.parse(store.get(draftKey('run-1')))).toMatchObject({ v: 1, run: 'run-1', savedAt: '2026-11-22T10:00:00.000Z', edits: [e('a', 1), e('b', 2)] })
    const back = loadDraft(store, 'run-1')
    expect(back.h).toEqual(h); expect(back.savedAt).toBe('2026-11-22T10:00:00.000Z')
    expect(hRedo(back.h).now).toEqual([e('b', 2)]); expect(hUndo(back.h).now).toEqual([e('a', 1)]) // после перезагрузки отмена и возврат работают
    expect(loadDraft(store, 'run-2')).toBeNull(); expect(draftKey('run-1')).toBe(`${DRAFT_PREFIX}run-1`)
  })

  it('битая запись, чужой формат, мусор в правках — не падает', () => {
    expect(restore(null)).toBeNull(); expect(restore('x')).toBeNull(); expect(restore({ edits: 'нет' })).toBeNull()
    expect(restore({ edits: [e('a', 1), null, { key: 5 }, { key: 'b', to: 'x', from: 1 }], past: ['x', [e('a', 0)]], future: null }).h).toEqual({ past: [[e('a', 0)]], now: [e('a', 1)], future: [] })
    expect(loadDraft(mem({ [draftKey('r')]: '{не json' }), 'r')).toBeNull()
    expect(loadDraft(null, 'r')).toBeNull(); expect(saveDraft(mem(), '', hInit())).toBe(false)
  })

  it('хранилище не бросает (приватный режим, переполнение); старые черновики других прохождений удаляются', () => {
    const bad = safeStore({ getItem() { throw new Error('нет') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('нет') }, get length() { throw new Error('нет') } })
    expect(bad.get('k')).toBeNull(); expect(bad.set('k', 'v')).toBe(false); expect(bad.keys()).toEqual([]); expect(() => bad.del('k')).not.toThrow()
    expect(saveDraft(bad, 'r', hInit())).toBe(false)
    const store = mem({ чужой: '1' })
    for (let i = 0; i < DRAFTS_KEEP + 5; i++) saveDraft(store, `r${i}`, hInit([e('a', i)]), new Date(Date.UTC(2026, 10, 22, 10, i)))
    const mine = store.keys().filter(k => k.startsWith(DRAFT_PREFIX))
    expect(mine).toHaveLength(DRAFTS_KEEP); expect(mine).not.toContain(draftKey('r0')); expect(mine).toContain(draftKey(`r${DRAFTS_KEEP + 4}`)); expect(store.get('чужой')).toBe('1')
  })

  it('два черновика (устройство и сервер): берётся записанный позже', () => {
    const a = { h: hInit([e('a', 1)]), savedAt: '2026-11-22T10:00:00.000Z' }, b = { h: hInit([e('b', 2)]), savedAt: '2026-11-22T11:00:00.000Z' }
    expect(newest(a, b)).toBe(b); expect(newest(b, a)).toBe(b); expect(newest(a, null)).toBe(a); expect(newest(null, b)).toBe(b); expect(newest(null, null)).toBeNull()
    expect(serverDraft(hPush(hInit(), [e('a', 1)]), new Date('2026-11-22T10:00:00Z'))).toEqual({ v: 1, savedAt: '2026-11-22T10:00:00.000Z', edits: [e('a', 1)] }) // на сервер — без истории
    expect(serialize(hInit(), 'r', new Date('2026-11-22T10:00:00Z'))).toEqual({ v: 1, run: 'r', savedAt: '2026-11-22T10:00:00.000Z', edits: [], past: [], future: [] })
  })
})

describe('черновик на сервере: runs[i].edits (timelineApi, обратная совместимость)', () => {
  const run = (id, extra = {}) => ({ id, savedAt: '2026-11-22T10:00:00.000Z', device: 'iPhone', appVersion: '3.3.340', meta: {}, events: [{ t: 0, k: 'run' }], dropped: 0, ...extra })
  const fake = (value = null, { writeError = null } = {}) => {
    const st = { value, writes: 0 }
    return { st, client: { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.value == null ? null : { value: st.value }, error: null }) }) }),
      upsert: row => ({ select: async () => { st.writes += 1; if (writeError) return { data: null, error: { message: writeError } }; st.value = row.value; return { data: [{ key: row.key }], error: null } } }),
    }) } }
  }
  const draft = { v: 1, savedAt: '2026-11-22T12:00:00.000Z', edits: [e('a', 1)] }

  it('старые записи без edits читаются как раньше; повторное сохранение прохождения не стирает его черновик', () => {
    expect(runsOf({ v: 1, runs: [run('a')] })).toEqual([run('a')])
    const v = mergeRuns({ v: 1, runs: [run('a', { edits: draft }), run('b')] }, run('a'))
    expect(v.runs.map(r => [r.id, r.edits ?? null])).toEqual([['b', null], ['a', draft]])
    expect(mergeRuns({ v: 1, runs: [run('a', { edits: draft })] }, run('a', { edits: { ...draft, edits: [] } })).runs[0].edits.edits).toEqual([]) // новый черновик заменяет старый
  })

  it('запись черновика: к прохождению на сервере; прохождения ещё нет — дописывается вместе с черновиком; ошибка — не исключение', async () => {
    const a = fake({ v: 1, runs: [run('a'), run('b')] }), log = []
    expect(await saveTimelineEdits(run('a'), draft, { client: a.client, log: s => log.push(s) })).toEqual({ ok: true, error: null, count: 1 })
    expect(a.st.value.runs.map(r => [r.id, r.edits?.edits.length ?? null])).toEqual([['b', null], ['a', 1]]); expect(a.st.value.runs[1].events).toEqual(run('a').events)
    const b = fake(null)
    expect((await saveTimelineEdits(run('new'), draft, { client: b.client })).ok).toBe(true); expect(b.st.value).toEqual({ v: 1, runs: [run('new', { edits: draft })] })
    const c = fake(null, { writeError: 'нет прав' })
    expect(await saveTimelineEdits(run('a'), draft, { client: c.client, log: s => log.push(s) })).toEqual({ ok: false, error: 'нет прав', count: 0 })
    expect(log.join('\n')).toContain('черновик правок монтажа НЕ сохранён на сервер: нет прав'); expect(TIMELINE_KEY).toBe('race_timeline_last')
  })
})
