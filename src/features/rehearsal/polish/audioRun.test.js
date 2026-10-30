import { describe, it, expect } from 'vitest'
import { RUN_ORDER, beginRun, runPresetId, markPlaying, finishStep, abortStep, runStatus } from './audioRun.js'
import { makeRunRecord, listRuns, addRun, clearRuns, runsSummary, buildRunsExport, runsFile, clipLog, RUNS_KEY, MAX_RUNS, MAX_LOG_LINES, RUNS_FILE_NAME } from './audioRunLog.js'

// «Прогон по режимам»: шаги A…H (следующий режим сам не стартует — нужен жест) и копилка журналов запусков
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const DUMP = { startedAt: '2026-10-30T10:00:00Z', phrase: "I'm | trying", events: [{ t: 10, type: 'stage', kind: 'dictor' }], mic: { game: { open: true, platform: 'ios', processing: false, audioSessionMode: 'play-and-record', micHoldMode: 'close', tracks: [], settings: {} } } }

describe('шаги прогона', () => {
  it('начинается с A и ждёт запуска; порядок A…H', () => {
    expect(RUN_ORDER).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    const r = beginRun('build')
    expect(r).toEqual({ act: 'build', step: 0, state: 'ready' }); expect(runPresetId(r)).toBe('A')
    expect(runStatus(r)).toContain('Шаг 1 из 8'); expect(runStatus(r)).toContain('Запустить A')
  })
  it('после выхода из игры выбирается следующий режим и ждёт жеста («Запустить B»), сам не стартует', () => {
    let r = markPlaying(beginRun('read'))
    expect(r.state).toBe('playing'); expect(runStatus(r)).toContain('идёт режим A')
    r = finishStep(r)
    expect(r).toEqual({ act: 'read', step: 1, state: 'ready' }); expect(runPresetId(r)).toBe('B'); expect(runStatus(r)).toContain('Шаг 2 из 8'); expect(runStatus(r)).toContain('Запустить B')
  })
  it('все восемь шагов подряд: после H прогон завершён, текущий шаг виден на каждом', () => {
    let r = beginRun('intro')
    const seen = []
    for (let i = 0; i < 8; i++) { seen.push(runPresetId(r)); r = finishStep(markPlaying(r)) }
    expect(seen).toEqual(RUN_ORDER)
    expect(r.state).toBe('finished'); expect(runStatus(r)).toContain('Прогон завершён'); expect(finishStep(r)).toBe(r)
  })
  it('игра не открылась (микрофон не дали): шаг остаётся тем же; finishStep без запущенной игры ничего не делает', () => {
    const r = markPlaying(beginRun('take'))
    expect(abortStep(r)).toEqual({ act: 'take', step: 0, state: 'ready' })
    const idle = beginRun('take'); expect(finishStep(idle)).toBe(idle); expect(abortStep(idle)).toBe(idle)
    expect(runStatus(null)).toBe(''); expect(runPresetId(null)).toBeNull(); expect(markPlaying(null)).toBeNull()
  })
})

describe('копилка журналов запусков', () => {
  const rec = (n, o = {}) => makeRunRecord({ act: 'build', presetId: 'C', step: n, startedAt: 1000, endedAt: 31000, dump: DUMP, version: '3.3.74', store: memStore(), now: new Date('2026-10-30T10:00:00Z'), ...o })
  it('запись: этап, режим с тремя значениями, настройки микрофона из журнала игры, длительность, хронология', () => {
    const r = rec(3)
    expect(r).toMatchObject({ act: 'build', actTitle: 'Сборка с конца', step: 3, version: '3.3.74', durationMs: 30000, preset: { id: 'C', title: 'Запись+воспр., закрывать микрофон на речь Пита', inner: 'сессия play-and-record · дорожка close · обработка выкл' } })
    expect(r.audioMode).toMatchObject({ id: 'C', custom: false })
    expect(r.mic).toEqual({ open: true, platform: 'ios', processing: false, audioSession: 'play-and-record', micHold: 'close' })
    expect(r.gameLog.join('\n')).toContain('Режим звука: C — '); expect(r.gameLog.join('\n')).toContain('stage:dictor')
  })
  it('нет журнала игры (отладка выключена): запись всё равно есть, mic пуст', () => {
    const r = rec(null, { dump: null })
    expect(r.mic).toBeNull(); expect(r.gameLog[0]).toContain('Игра «Повтори за диктором»')
  })
  it('копится в браузере, старые первыми; не больше MAX_RUNS, лишние вытесняют самые старые', () => {
    const s = memStore()
    for (let i = 1; i <= MAX_RUNS + 3; i++) addRun(rec(i), s)
    const list = listRuns(s)
    expect(list).toHaveLength(MAX_RUNS); expect(list[0].step).toBe(4); expect(list.at(-1).step).toBe(MAX_RUNS + 3)
    expect(Object.keys(s.m)).toEqual([RUNS_KEY])
    clearRuns(s); expect(listRuns(s)).toEqual([])
  })
  it('хранилище не принимает запись целиком — вытесняются старые, пока не поместится; совсем не принимает — ok: false', () => {
    const s = memStore(); const orig = s.setItem
    s.setItem = (k, v) => { if (v.length > 8000) throw new Error('quota'); orig(k, v) }
    const big = n => ({ ...rec(n), gameLog: ['x'.repeat(2500)] })
    addRun(big(1), s); addRun(big(2), s)
    const r = addRun(big(3), s)
    expect(r.ok).toBe(true); expect(listRuns(s).map(x => x.step)).toEqual([2, 3])
    const dead = { getItem: () => null, setItem() { throw new Error('p') }, removeItem() {} }
    expect(addRun(rec(1), dead)).toEqual({ ok: false, count: 0 })
    expect(listRuns(null)).toEqual([]); expect(listRuns(memStore({ [RUNS_KEY]: '{не json' }))).toEqual([])
  })
  it('длинная хронология режется: начало и конец, середина одной строкой', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `l${i}`)
    const c = clipLog(lines)
    expect(c).toHaveLength(MAX_LOG_LINES + 1); expect(c[0]).toBe('l0'); expect(c.at(-1)).toBe('l499'); expect(c.some(l => l.startsWith('… пропущено 300'))).toBe(true)
    expect(clipLog(['a'])).toEqual(['a'])
  })
  it('экспорт: сводка по строке на запуск + все записи; файл rehearsal-audio-runs.json', () => {
    const runs = [rec(1, { presetId: 'A' }), rec(2, { presetId: 'B' })]
    const text = runsSummary(runs, { version: '3.3.74', exportedAt: 'X' })
    expect(text).toContain('# Прогон по режимам звука, v3.3.74: 2 запусков'); expect(text).toContain('1. [A] Сборка с конца · шаг 1 · 30 с'); expect(text).toContain('2. [B]')
    const e = buildRunsExport(runs, { version: '3.3.74', now: new Date('2026-10-30T11:00:00Z') })
    expect(e).toMatchObject({ version: 1, appVersion: '3.3.74', exportedAt: '2026-10-30T11:00:00.000Z' }); expect(e.runs).toHaveLength(2)
    const f = runsFile(runs, { version: '3.3.74' })
    expect(f.name).toBe(RUNS_FILE_NAME); expect(JSON.parse(f.json).runs[1].preset.id).toBe('B'); expect(f.size).toBe(f.json.length)
  })
})
