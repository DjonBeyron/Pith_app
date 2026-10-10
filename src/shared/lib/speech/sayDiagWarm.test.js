import { describe, it, expect } from 'vitest'
import { warmStageRow, warmWhoRow, warmJournal, warmTail, clockSec } from './sayDiagWarm.js'
import { explainPick } from './sayDiagExplain.js'
import { buildDiagRows, diagReport, GROUP_TITLE } from './sayDiagRows.js'
import { pickEngine } from './sayEnginePick.js'
import { INITIAL_STATUS } from '../vosk/voskBgStatus.js'

// Диагностика прогрева: этап простым русским, кто запустил, журнал этапов (в отчёт), «ни разу не просили» (признак зависшего Permissions API)
const NOW = new Date(2026, 9, 10, 11, 43, 30).getTime()
const SNAP = { cached: null, loaded: false, loading: false, libReady: false, stage: 'idle', broken: false, brokenUntil: 0, brokenWhy: '' }
const INFO = { users: 1, holds: { lesson: 1 }, acquires: 1, lastAcquire: { why: 'lesson', at: NOW - 5000 }, warmAt: 0, loadedAt: 0, freeAt: 0, lastError: '', lastLoad: null, stage: 'idle', stageAt: 0, trigger: '', failure: null, failures: 0, trace: [], mode: 'vosk', now: NOW }

describe('этап прогрева', () => {
  it('идёт: «этап: загружаем библиотеку (4 с)» (⚠️), для всех трёх рабочих этапов', () => {
    const r = warmStageRow({ snap: { ...SNAP, stage: 'importing-lib', loading: true }, info: { ...INFO, stage: 'importing-lib', stageAt: NOW - 4000 } })
    expect(r).toEqual({ level: 'warn', text: 'этап: загружаем библиотеку (4 с)' })
    expect(warmStageRow({ snap: SNAP, info: { ...INFO, stage: 'checking-cache', stageAt: NOW - 1000 } }).text).toBe('этап: проверяем кэш модели (1 с)')
    expect(warmStageRow({ snap: SNAP, info: { ...INFO, stage: 'loading-model', stageAt: NOW - 12000 } }).text).toBe('этап: загружаем модель в память (12 с)')
  })
  it('готово (✅) с длительностями; ошибка (❌) с этапом, текстом, временем, паузой и подсказкой', () => {
    expect(warmStageRow({ snap: { ...SNAP, loaded: true, stage: 'ready' }, info: { ...INFO, stage: 'ready', lastLoad: { libMs: 600, modelMs: 900 } } })).toMatchObject({ level: 'ok', text: 'готово — модель в памяти (библиотека 0,6 с, модель 0,9 с)' })
    const f = warmStageRow({
      snap: { ...SNAP, stage: 'failed', broken: true, brokenUntil: new Date(2026, 9, 10, 11, 44).getTime() },
      info: { ...INFO, stage: 'failed', failure: { stage: 'loading-model', text: 'Ошибка загрузки модели: x', at: NOW - 3000 } },
    })
    expect(f.level).toBe('bad'); expect(f.text).toContain('ошибка загрузки модели в 11:43:27: Ошибка загрузки модели: x'); expect(f.text).toContain('пауза до 11:44'); expect(f.hint).toContain('Прогреть сейчас')
  })
  it('не идёт: режим «Только системное» / «ни разу не просили» / нет модели в кэше / никто не держит', () => {
    expect(warmStageRow({ snap: SNAP, info: { ...INFO, mode: 'system' } }).text).toContain('Только системное')
    expect(warmStageRow({ snap: SNAP, info: { ...INFO, acquires: 0, users: 0 } })).toMatchObject({ level: 'warn' })
    expect(warmStageRow({ snap: { ...SNAP, cached: false }, info: INFO }).text).toContain('модели нет в кэше')
    expect(warmStageRow({ snap: SNAP, info: { ...INFO, users: 0 } }).text).toContain('закрыты')
  })
})

describe('кто запустил и кто держит', () => {
  it('«прогрев запущен: при входе в урок», держат урок ×1, панель ×1, число запросов, давность', () => {
    const r = warmWhoRow({ ...INFO, trigger: 'lesson', holds: { lesson: 1, panel: 1 }, acquires: 2 })
    expect(r.level).toBe('info'); expect(r.text).toContain('прогрев запущен: при входе в урок'); expect(r.text).toContain('держат: урок ×1, панель ×1'); expect(r.text).toContain('запросов 2'); expect(r.text).toContain('5 с назад (урок)')
    expect(warmWhoRow({ ...INFO, trigger: 'panel' }).text).toContain('при открытии панели')
    expect(warmWhoRow({ ...INFO, trigger: 'manual' }).text).toContain('вручную')
  })
  it('прогрев ни разу не запрашивали — ❌ с пояснением (это и был симптом на телефоне)', () => {
    const r = warmWhoRow({ ...INFO, acquires: 0, users: 0, holds: {} })
    expect(r.level).toBe('bad'); expect(r.text).toContain('ни разу не запрашивали')
  })
})

describe('журнал этапов и отчёт', () => {
  const trace = [
    { stage: 'checking-cache', at: NOW - 3000, note: 'прогрев запущен при входе в урок' },
    { stage: 'importing-lib', at: NOW - 2900, note: '' },
    { stage: 'failed', at: NOW - 1000, note: 'загрузки библиотеки: таймаут' },
  ]
  it('строки «11:43:27 проверяем кэш модели — подробность» с секундами; хвост — три последних одной строкой', () => {
    expect(clockSec(NOW)).toBe('11:43:30')
    const j = warmJournal({ trace })
    expect(j[0]).toBe('11:43:27 проверяем кэш модели — прогрев запущен при входе в урок'); expect(j[1]).toBe('11:43:27 загружаем библиотеку'); expect(j[2]).toContain('ошибка — загрузки библиотеки: таймаут')
    expect(warmTail({ trace }).text.split(' → ')).toHaveLength(3); expect(warmTail({ trace: [] }).text).toContain('пусто')
    expect(warmJournal({})).toEqual([])
  })
  it('«Скопировать отчёт» включает группу «Прогрев Vosk» и журнал этапов', () => {
    const c = {
      mode: 'vosk', phrase: 'Hello there', snap: SNAP, info: { ...INFO, trace, trigger: 'lesson' }, bg: INITIAL_STATUS, now: NOW, version: '3.2.1915', cache: { size: 1, savedAt: NOW }, cacheApi: true, bgStopped: false,
      urlSource: 'builtin', urlHost: 'h', attempt: null, gate: { action: 'listen' }, perm: 'granted',
      env: { recognition: true, audioSession: true, sessionType: 'play-and-record', sessionApi: true, online: true, saveData: false, netType: '', browser: 'Safari', platform: 'iOS 18.7', pwa: true, secure: true, cacheApi: true, ua: 'UA' },
    }
    c.pick = pickEngine({ mode: c.mode, phrase: c.phrase, ...c.snap, now: NOW })
    const rows = buildDiagRows(c)
    expect(GROUP_TITLE.warm).toBe('Прогрев Vosk')
    expect(rows.filter(r => r.group === 'warm').map(r => r.id)).toEqual(['warm', 'warmwho', 'warmlog'])
    const rep = diagReport(rows, { now: NOW, ua: 'UA', journal: warmJournal(c.info) })
    expect(rep).toContain('Прогрев Vosk:'); expect(rep).toContain('Журнал прогрева Vosk (этапы по времени):'); expect(rep).toContain('  11:43:27 проверяем кэш модели — прогрев запущен при входе в урок')
    expect(diagReport(rows, { now: NOW })).not.toContain('Журнал прогрева')
  })
})

describe('почему следующая попытка на системном: прогрев не запрашивали / идёт / только начался', () => {
  const pick = { engine: 'system', reason: 'not-loaded' }
  const c = (snap, info) => ({ mode: 'vosk', phrase: 'Hello', snap: { ...SNAP, ...snap }, info: { ...INFO, ...info }, bg: INITIAL_STATUS, inCache: true, bgStopped: false })
  it('кэш не проверен и acquire не вызывали → ❌ «прогрев ни разу не запрашивали»', () => {
    const r = explainPick(pick, c({}, { acquires: 0, users: 0 }))
    expect(r.level).toBe('bad'); expect(r.text).toContain('ни разу не запрашивали'); expect(r.hint).toContain('Прогреть сейчас')
  })
  it('кэш не проверен, прогрев идёт → называет этап; иначе прежнее «только начинается»', () => {
    expect(explainPick(pick, c({ loading: true }, { stage: 'importing-lib', stageAt: NOW - 2000 })).text).toContain('идёт прогрев: загружаем библиотеку (2 с)')
    expect(explainPick(pick, c({}, {})).text).toContain('прогрев только начинается')
  })
})
