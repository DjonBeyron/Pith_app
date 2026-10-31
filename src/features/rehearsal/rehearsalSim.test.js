import { describe, it, expect, vi } from 'vitest'
import { scoreSession, applySession, reportSession, loadSim, dayKey, SIM_KEY, XP_DAILY_CAP, PHRASE_GAP_DAYS, LADDER_DAYS } from './rehearsalSim.js'
import { createJournal, record } from './rehearsalJournal.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { buildRehearsalStages } from './rehearsalStages.js'

const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const plan = fixturePlan('three')
const stage = sid => ({ sid, act: sid.split('-')[0] })
const win = (j, sid, n = 1) => { for (let i = 0; i < n; i++) record(j, stage(sid), 'win') }
const DAY = 86400000
const T0 = Date.parse('2026-10-29T10:00:00')

// Симуляция памяти и XP (CONCEPT_REHEARSAL.md §3): по журналу актов — XP, слова, фраза; в память сессии браузера и журнал отладки, на сервер ничего
describe('подсчёт по журналу', () => {
  it('слово «к повтору», сказанное верно в акте 1 или 4, даёт +1 XP; промах в разминке — слово в miss', () => {
    const j = createJournal()
    win(j, 'warmup-0'); win(j, 'warmup-1'); record(j, stage('warmup-1'), 'fail')   // trying — чисто, learn — с промахом
    const sc = scoreSession(plan, j)
    expect(sc.words.find(w => w.text === 'trying')).toMatchObject({ hit: 1, miss: 0 })
    expect(sc.words.find(w => w.text === 'learn')).toMatchObject({ hit: 0, miss: 1 })
    expect(sc.xp).toBe(1)
    expect(sc.misses).toBe(1)
  })
  it('акт 4 без промахов засчитывает слова ещё раз: слово с промахом в разминке получает XP за «без текста»', () => {
    const j = createJournal()
    win(j, 'warmup-0'); win(j, 'warmup-1'); record(j, stage('warmup-1'), 'miss')
    win(j, 'blind-0'); win(j, 'blind-1')
    const sc = scoreSession(plan, j)
    expect(sc.words.find(w => w.text === 'learn')).toMatchObject({ hit: 1, miss: 1 })
    expect(sc.words.find(w => w.text === 'trying')).toMatchObject({ hit: 2 })
    expect(sc.xp).toBe(2)
    expect(sc.phraseDone).toBe(true)
  })
  it('пустой журнал: ни XP, ни готовой фразы', () => {
    const sc = scoreSession(plan, createJournal())
    expect(sc).toMatchObject({ xp: 0, phraseDone: false, misses: 0 })
    expect(sc.words.every(w => w.hit === 0)).toBe(true)
  })
  it('дубль принят — фраза готова даже без акта 4', () => {
    const j = createJournal(); win(j, 'take')
    expect(scoreSession(plan, j).phraseDone).toBe(true)
  })
  it('одно слово: ступень word-0 считается разминкой', () => {
    const one = fixturePlan('one')
    const j = createJournal(); win(j, 'word-0', 2)
    const sc = scoreSession(one, j)
    expect(sc.words[0]).toMatchObject({ text: 'remember', hit: 1 }); expect(sc.xp).toBe(1)
  })
  it('слова в журнале соответствуют стадиям рецепта (sid разминки)', () => {
    const { stages } = buildRehearsalStages({ plan, lib: () => null })
    expect(stages.filter(s => s.type === 'warmup' && s.act === 'warmup').map(s => s.sid).sort()).toEqual(['warmup-0', 'warmup-1']) // порядок слов в сессии случайный, sid — номер слова в плане (по нему итог находит ступень)
  })
})

describe('запись в память сессии браузера', () => {
  it('XP с потолком дня (общий с «Скажи вслух»); второй заход в тот же день — только остаток', () => {
    const st = memStore()
    const sc = { xp: 8, words: [], phraseDone: false }
    expect(applySession(plan, sc, { store: st, now: T0 })).toMatchObject({ xp: 8, capped: false })
    expect(applySession(plan, sc, { store: st, now: T0 + 1000 })).toMatchObject({ xp: XP_DAILY_CAP - 8, capped: true })
    expect(applySession(plan, sc, { store: st, now: T0 + 2000 }).xp).toBe(0)
    expect(applySession(plan, sc, { store: st, now: T0 + DAY }).xp).toBe(8) // новый день — счёт с нуля
    expect(JSON.parse(st.m[SIM_KEY]).xpToday).toBe(8)
  })
  it('слово с промахом: шаг не меняется, due_on = завтра; без промахов — следующий шаг лесенки', () => {
    const st = memStore()
    applySession(plan, { xp: 0, phraseDone: false, words: [{ text: 'trying', hit: 1, miss: 0 }, { text: 'learn', hit: 1, miss: 1 }] }, { store: st, now: T0 })
    const sim = loadSim(st)
    expect(sim.words.trying).toMatchObject({ step: 1, dueOn: dayKey(T0 + LADDER_DAYS[1] * DAY) })
    expect(sim.words.learn).toMatchObject({ step: 0, dueOn: dayKey(T0 + DAY) })
    applySession(plan, { xp: 0, phraseDone: false, words: [{ text: 'learn', hit: 2, miss: 0 }] }, { store: st, now: T0 + DAY })
    expect(loadSim(st).words.learn.step).toBe(1)
  })
  it('фраза: consolidated_at = сегодня, но не чаще раза в 3 дня', () => {
    const st = memStore()
    const sc = { xp: 0, words: [], phraseDone: true }
    expect(applySession(plan, sc, { store: st, now: T0 }).consolidated).toBe(true)
    expect(applySession(plan, sc, { store: st, now: T0 + DAY }).consolidated).toBe(false)
    expect(loadSim(st).phrases[plan.phrase].consolidatedAt).toBe(dayKey(T0))
    expect(applySession(plan, sc, { store: st, now: T0 + PHRASE_GAP_DAYS * DAY }).consolidated).toBe(true)
    expect(applySession(plan, { ...sc, phraseDone: false }, { store: memStore(), now: T0 }).consolidated).toBe(false)
  })
  it('нет хранилища / мусор / приватный режим — не падаем', () => {
    const broken = { getItem() { throw new Error('p') }, setItem() { throw new Error('p') } }
    expect(() => applySession(plan, { xp: 1, words: [], phraseDone: false }, { store: broken, now: T0 })).not.toThrow()
    expect(loadSim(memStore({ [SIM_KEY]: '{не json' }))).toMatchObject({ xpToday: 0, words: {} })
    expect(loadSim(undefined)).toMatchObject({ xpToday: 0 })
  })
})

describe('итог одним вызовом', () => {
  it('reportSession: подсчёт + запись + строка в журнал отладки (без сервера)', () => {
    const st = memStore(), log = vi.fn()
    const j = createJournal(); win(j, 'warmup-0'); win(j, 'take')
    const res = reportSession({ plan, journal: j, store: st, now: T0, log })
    expect(res).toMatchObject({ xp: 1, phraseDone: true, consolidated: true, misses: 0 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/\[rehearsal\] итог «I'm \| trying \| to learn»: XP \+1/)
    expect(JSON.parse(st.m[SIM_KEY]).words.trying.step).toBe(1)
  })
  it('зеркало: темп и заметка Пита — в итоге, в записи фразы (lastTempo / lastNote) и в журнале отладки; consolidated_at не трётся', () => {
    const st = memStore(), log = vi.fn()
    const j = createJournal(); win(j, 'take')
    const note = { key: 'tempo', text: 'Ты медленнее меня на треть — это нормально.' }
    const res = reportSession({ plan, journal: j, mirror: { tempo: 1.33, note }, store: st, now: T0, log })
    expect(res).toMatchObject({ tempo: 1.33, note, consolidated: true })
    expect(JSON.parse(st.m[SIM_KEY]).phrases[plan.phrase]).toEqual({ consolidatedAt: dayKey(T0), lastTempo: 1.33, lastNote: 'tempo' })
    expect(log.mock.calls[0][0]).toContain('темп 1.33'); expect(log.mock.calls[0][0]).toContain('заметка Пита: [tempo] Ты медленнее меня на треть')
    // следующий раз через день: фраза не закрепляется (рано), но заметка новая, а прежняя consolidated_at остаётся
    const j2 = createJournal(); win(j2, 'take')
    const again = reportSession({ plan, journal: j2, mirror: { tempo: null, note: { key: 'fail', text: 'Запись не получилась — попробуем в следующий раз.' } }, store: st, now: T0 + DAY, log })
    expect(again).toMatchObject({ consolidated: false, tempo: null }); expect(JSON.parse(st.m[SIM_KEY]).phrases[plan.phrase]).toEqual({ consolidatedAt: dayKey(T0), lastTempo: null, lastNote: 'fail' })
    expect(log.mock.calls[1][0]).toContain('темп —')
  })
  it('без зеркала (как раньше): tempo и note — null, фраза без lastNote, в журнале «заметка Пита: —»', () => {
    const st = memStore(), log = vi.fn()
    const res = reportSession({ plan, journal: createJournal(), store: st, now: T0, log })
    expect(res).toMatchObject({ tempo: null, note: null }); expect(JSON.parse(st.m[SIM_KEY]).phrases).toEqual({})
    expect(log.mock.calls[0][0]).toContain('заметка Пита: —')
  })
  it('ключ памяти сессии и потолок — по концепции', () => {
    expect(SIM_KEY).toBe('pithy_rehearsal_sim_v1'); expect(XP_DAILY_CAP).toBe(10)
  })
})
