import { describe, it, expect } from 'vitest'
import { readTimelines, saveTimeline, mergeRuns, trimRun, runsOf, TIMELINE_KEY, TIMELINE_KEEP, TIMELINE_MAX_EVENTS } from './timelineApi.js'

// Подставной supabase: одна строка app_settings в памяти. deny — RLS отсёк запись (ошибки нет, строк 0); readError / writeError — ошибка сети или сервера; boom — клиент бросает исключение
const fake = ({ value = null, readError = null, writeError = null, deny = false, boom = false } = {}) => {
  const st = { value, reads: 0, writes: [], keys: [] }
  const client = {
    from: table => {
      if (boom) throw new Error('сеть упала')
      expect(table).toBe('app_settings')
      return {
        select: () => ({ eq: (_col, key) => ({ maybeSingle: async () => { st.reads += 1; st.keys.push(key); return readError ? { data: null, error: { message: readError } } : { data: st.value == null ? null : { value: st.value }, error: null } } }) }),
        upsert: (row, opts) => ({ select: async () => { st.writes.push({ row, opts }); if (writeError) return { data: null, error: { message: writeError } }; if (deny) return { data: [], error: null }; st.value = row.value; return { data: [{ key: row.key }], error: null } } }),
      }
    },
  }
  return { client, st }
}
const run = (id, n = 3, extra = {}) => ({ id, savedAt: `2026-11-22T10:0${id.length}:00.000Z`, device: 'iPhone 390×844', appVersion: '3.3.339', meta: { game: 'race' }, events: Array.from({ length: n }, (_, i) => ({ t: i * 10, k: i ? 'note' : 'run' })), dropped: 0, ...extra })

describe('таймлайн на сервере (timelineApi): одна строка app_settings', () => {
  it('чтение: по ключу race_timeline_last; нет строки — пусто без ошибки; битое значение — пусто', async () => {
    const a = fake({ value: { v: 1, runs: [run('a'), run('bb')] } })
    expect(await readTimelines({ client: a.client })).toEqual({ runs: [run('a'), run('bb')], error: null })
    expect(a.st.keys).toEqual([TIMELINE_KEY]); expect(TIMELINE_KEY).toBe('race_timeline_last')
    expect(await readTimelines({ client: fake().client })).toEqual({ runs: [], error: null })
    expect(runsOf({ runs: 'мусор' })).toEqual([]); expect(runsOf({ runs: [null, { id: 1 }, run('a')] })).toEqual([run('a')])
  })

  it('чтение: ошибка сети — текст ошибки в результате, не исключение', async () => {
    expect(await readTimelines({ client: fake({ readError: 'Failed to fetch' }).client })).toEqual({ runs: [], error: 'Failed to fetch' })
    expect(await readTimelines({ client: fake({ boom: true }).client })).toEqual({ runs: [], error: 'сеть упала' })
  })

  it('запись: прочитать → добавить своё → оставить последние 3 → записать; новые в конце, чужие не затёрты', async () => {
    const f = fake({ value: { v: 1, runs: [run('a'), run('bb'), run('ccc')] } }), lines = []
    const r = await saveTimeline(run('dddd', 5), { client: f.client, log: s => lines.push(s) })
    expect(r).toMatchObject({ ok: true, error: null, count: 3, events: 5 }); expect(r.bytes).toBe(JSON.stringify(f.st.value).length)
    expect(f.st.reads).toBe(1); expect(f.st.writes).toHaveLength(1)
    expect(f.st.writes[0].row.key).toBe(TIMELINE_KEY); expect(f.st.writes[0].opts).toEqual({ onConflict: 'key' })
    expect(f.st.value.v).toBe(1); expect(f.st.value.runs.map(x => x.id)).toEqual(['bb', 'ccc', 'dddd']); expect(TIMELINE_KEEP).toBe(3)
    expect(lines.join()).toContain('прохождение сохранено на сервер: событий 5')
  })

  it('запись: то же прохождение повторно (автосохранение, потом кнопка) заменяет себя, а не дублируется; пустой сервер — первая запись', async () => {
    const f = fake({ value: { v: 1, runs: [run('a'), run('bb')] } })
    await saveTimeline(run('a', 9), { client: f.client, log: () => {} })
    expect(f.st.value.runs.map(x => [x.id, x.events.length])).toEqual([['bb', 3], ['a', 9]])
    const e = fake(); await saveTimeline(run('a'), { client: e.client, log: () => {} }); expect(e.st.value).toEqual({ v: 1, runs: [run('a')] })
  })

  it('обрезка размера: не больше 3000 событий на прохождение — лишние с начала, dropped растёт; вход не меняется', async () => {
    const big = run('big', TIMELINE_MAX_EVENTS + 250, { dropped: 40 }), t = trimRun(big)
    expect(t.events).toHaveLength(3000); expect(t.dropped).toBe(290); expect(t.events[0].t).toBe(2500); expect(big.events).toHaveLength(3250)
    expect(trimRun(run('s', 5))).toEqual(run('s', 5))
    expect(mergeRuns(null, big).runs[0].events).toHaveLength(3000)
    const f = fake(), lines = []; await saveTimeline(big, { client: f.client, log: s => lines.push(s) })
    expect(f.st.value.runs[0].dropped).toBe(290); expect(lines[0]).toContain('отрезано с начала 290')
  })

  it('отказ записи без прав (RLS вернул 0 строк), ошибка сервера, исключение клиента — { ok: false } и строка журнала, наружу ничего не бросается', async () => {
    for (const [opts, msg] of [[{ deny: true }, 'нужны права админа'], [{ writeError: 'new row violates row-level security policy' }, 'row-level security'], [{ readError: 'timeout' }, 'timeout'], [{ boom: true }, 'сеть упала']]) {
      const f = fake(opts), lines = []
      const r = await saveTimeline(run('a'), { client: f.client, log: s => lines.push(s) })
      expect(r.ok, msg).toBe(false); expect(r.error).toContain(msg)
      expect(lines).toHaveLength(1); expect(lines[0]).toContain('НЕ сохранено на сервер'); expect(lines[0]).toContain(msg)
    }
    await expect(saveTimeline(run('a'), { client: fake({ deny: true }).client, log: () => { throw new Error('журнал сломан') } })).resolves.toMatchObject({ ok: false })
    const rd = fake({ readError: 'timeout' }); await saveTimeline(run('a'), { client: rd.client, log: () => {} }); expect(rd.st.writes).toHaveLength(0) // не прочитали — не пишем (чужие игры не затрём)
  })
})
