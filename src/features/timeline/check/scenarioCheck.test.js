import { describe, it, expect } from 'vitest'
import { checkLine, lengthNote, edgeSilence, SPEED, MIN_CHARS } from './lineCheck.js'
import { playQueue, sceneRisks, risksById, QUIET_EDGE_S } from './sceneRisks.js'
import { checkScenario, summaryLine, verdictOf, durOfLines } from './scenarioCheck.js'
import { checkReportText } from './checkReport.js'
import { checkFixtureRaw, PROBLEMS, evenWords } from './checkFixture.js'
import { buildScenario } from './scenarioBuild.js'
import { realEvents } from '../timelineFixtureReal.js'
import { auditVoice } from '../../admin/speech/voiceAudit.js'
import { voiceNeedOf } from '../../admin/speech/useVoiceNeed.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { DEMO_LINE_CAP_MS } from '../../pitrace/racePhraseDemo.js'

const run = raw => { const a = auditVoice(raw); return checkScenario({ audit: a.byId, lines: normalizeLines(raw), orphans: a.orphans }) }
const P = PROBLEMS

describe('проверка одной реплики', () => {
  it('пороги длины не срабатывают на настоящей игре владельца (ни одной ложной тревоги)', () => {
    const lines = realEvents().filter(e => e.k === 'line-start' && e.who !== 'dictor' && e.ms > 0 && !e.silent)
    expect(lines.length).toBeGreaterThan(10)
    expect(lines.map(e => lengthNote(e.text, e.ms / 1000)).filter(Boolean)).toEqual([])
  })
  it('слишком коротко / длинно — от MIN_CHARS знаков по скорости речи; короткая реплика — только потолок', () => {
    const t = 'Встряхнём память, я говорю слова, а ты переводишь вслух'
    expect(lengthNote(t, t.length / (SPEED.max + 1))).toMatch(/слишком коротко/)
    expect(lengthNote(t, t.length / (SPEED.min - 1))).toMatch(/слишком длинно/)
    expect(lengthNote(t, t.length / 14)).toBeNull()
    expect('Мимо'.length).toBeLessThan(MIN_CHARS); expect(lengthNote('Мимо', 0.6)).toBeNull(); expect(lengthNote('Мимо', 3)).toMatch(/не тот файл/)
  })
  it('тишина по краям — по таймингам слов; без таймингов не оценивается', () => {
    expect(edgeSilence(evenWords('раз два три', 0.05, 2), 2.1)).toEqual({ head: 0, tail: 0 })
    expect(edgeSilence(evenWords('раз два три', 0.9, 2), 3.5).head).toBeCloseTo(0.9); expect(edgeSilence(evenWords('раз два три', 0.9, 2), 3.5).tail).toBeCloseTo(1.52)
    expect(edgeSilence(null, 2)).toBeNull()
  })
  it('статус берётся из аудита: нет звука, текст изменён, нет длительности — «нужно озвучить»; нет слов — заметка про рот', () => {
    const flags = (a, rec) => checkLine('x', a, rec).flags.map(f => f.k)
    expect(checkLine('x', { status: 'new', now: 'т' }, null)).toMatchObject({ level: 'todo', dur: null })
    expect(flags({ status: 'stale', now: 'новый', was: 'старый' }, { url: 'u', duration: 2 })).toEqual(['stale'])
    expect(flags({ status: 'nodur', now: 'т' }, { url: 'u' })).toEqual(['length'])
    expect(checkLine('x', { status: 'ok', now: 'отличное произношение' }, { url: 'u', duration: 1.6, words: null })).toMatchObject({ level: 'note', dur: 1.6 })
    expect(checkLine('x', { status: 'ok', now: 'отличное произношение' }, { url: 'u', duration: 1.6, words: evenWords('отличное произношение', 0.05, 1.5) })).toMatchObject({ level: 'ok', flags: [] })
  })
})

describe('риски сцены от длины', () => {
  const sc = buildScenario()
  it('очередь церемонии: реплика не раньше срока и не раньше конца прежней; тишина — зазор до срока', () => {
    const q = playQueue([{ id: 'a', delay: 0, lead: true }, { id: 'b', delay: 1800 }, { id: 'c', delay: 9000 }, { id: 'd', delay: 9100 }], id => ({ ms: { a: 2500, b: 3000, c: 1000, d: 500 }[id] }), 350)
    expect(q.map(r => [r.start, r.end])).toEqual([[0, 2500], [2500, 5500], [9000, 10000], [10350, 10850]])
    expect(q.map(r => r.quiet)).toEqual([0, 0, 3500, 350]); expect(q[1].late).toBe(700)
  })
  it('чистая фикстура — все риски «в порядке»; длинная реплика примера «Скажи» — «не помещается» с числами из игры', () => {
    const clean = normalizeLines(checkFixtureRaw(undefined, { clean: true })), a = auditVoice({ lines: clean }).byId
    expect(sceneRisks(sc, durOfLines(clean, a)).filter(r => r.status !== 'ok')).toEqual([])
    const long = { ...clean, race_demo_2: { ...clean.race_demo_2, duration: (DEMO_LINE_CAP_MS + 600) / 1000 } }
    const bad = sceneRisks(sc, durOfLines(long, a)).filter(r => r.status === 'bad')
    expect(bad).toHaveLength(1); expect(bad[0].ids).toEqual(['race_demo_2']); expect(bad[0].text).toMatch(/не помещается: длина 4,6 с при запасе 4,0 с/)
  })
  it('концовка длиннее потолка стадии и короткая реплика церемонии (тишина) — видны; у реплики появляется ⚠', () => {
    const clean = normalizeLines(checkFixtureRaw(undefined, { clean: true })), a = auditVoice({ lines: clean }).byId
    const rows = sceneRisks(sc, durOfLines({ ...clean, pit_back_2: { ...clean.pit_back_2, duration: 12 }, mia_push: { ...clean.mia_push, duration: 0.8 } }, a))
    expect(rows.find(r => /Концовка допроса/.test(r.title) && r.status === 'bad').text).toMatch(/концовке нужно .* при потолке 18,0 с/)
    const quiet = rows.find(r => /тишина перед репликой/.test(r.title))
    expect(quiet.status).toBe('edge'); expect(Number(quiet.text.match(/тишина ([\d,]+) с/)[1].replace(',', '.'))).toBeGreaterThan(QUIET_EDGE_S)
    expect(Object.keys(risksById(rows))).toEqual(expect.arrayContaining(['pit_back_2']))
  })
})

describe('проверка сценария целиком', () => {
  const res = run(checkFixtureRaw())
  const act = k => res.actions.find(a => a.k === k)
  it('чистые настройки — зелёный свет и «всё озвучено и согласовано»', () => {
    const ok = run(checkFixtureRaw(undefined, { clean: true }))
    expect(ok.light).toBe('green'); expect(summaryLine(ok)).toBe('всё озвучено и согласовано'); expect(ok.blocks.every(b => b.light === 'green' && b.bad === 0)).toBe(true); expect(ok.need).toEqual([])
  })
  it('фикстура с проблемами: каждое действие названо простыми словами и указывает нужные реплики', () => {
    expect(res.light).toBe('red')
    expect(act('voice')).toMatchObject({ n: 2, text: 'озвучить 2 реплики (звука нет)' }); expect(act('voice').ids.sort()).toEqual([P.fresh, P.none].sort())
    expect(act('revoice')).toMatchObject({ ids: [P.stale], text: 'переозвучить 1 реплику (текст изменён, файл говорит прежнее)' })
    expect(act('nodur').ids).toEqual([P.nodur])
    expect(act('length').ids.sort()).toEqual([P.long, P.short, P.risk].sort())
    expect(act('silence').ids.sort()).toEqual([P.head, P.tail].sort())
    expect(act('risk').ids).toEqual([P.risk])
    expect(act('mouth').ids.sort()).toEqual([...P.nowords].sort())
    expect(act('orphans')).toMatchObject({ ids: [P.orphan] })
  })
  it('светофор по блокам: красный там, где нужно действие; «Итог» зелёный', () => {
    expect(Object.fromEntries(res.blocks.map(b => [b.key, b.light]))).toMatchObject({ start: 'red', sprint: 'red', turn: 'yellow', phrases: 'red', mia: 'red', boss: 'red', summary: 'green' })
  })
  it('«нужно озвучить / переозвучить» — то же число, что у счётчика на вкладке «Голос» (одна функция)', () => {
    const raw = checkFixtureRaw()
    expect(res.need.length).toBe(voiceNeedOf(raw).total); expect(res.need.length).toBe(4)
    const spare = checkFixtureRaw(undefined, { clean: true }); delete spare.lines.race_climb // запасная реплика без озвучки: в игре не звучит
    expect(voiceNeedOf(spare)).toMatchObject({ total: 0, spare: 1 }); expect(run(spare).light).toBe('green')
  })
  it('отчёт для программиста: версия, итог, проблемы по блокам, риски, лишние записи', () => {
    const t = checkReportText(res, { version: '3.3.363', date: new Date('2026-11-24T10:00:00Z') })
    expect(t).toMatch(/^ПРОВЕРКА СЦЕНАРИЯ «ВСТРЯХНИ ПАМЯТЬ» — приложение 3\.3\.363, 2026-11-24 10:00 UTC/)
    expect(t).toContain('🔴 ДОПРОС У МИИ'); expect(t).toContain(`Мия ${P.stale}`); expect(t).toContain('РИСКИ СЦЕНЫ ОТ ДЛИНЫ РЕПЛИК'); expect(t).toContain(`ЛИШНИЕ ЗАПИСИ ОЗВУЧКИ (реплик с такими id больше нет): ${P.orphan}`)
    expect(checkReportText(checkScenario({}))).toMatch(/не загружены/)
  })
  it('проверка одной реплики после сохранения: «подходит» либо что не так, длина против прежней', () => {
    const raw = checkFixtureRaw(undefined, { clean: true }), lines = normalizeLines(raw), a = auditVoice(raw).byId
    expect(verdictOf('race_good_1', { audit: a, lines })).toMatchObject({ light: 'green', notes: [] })
    const longer = verdictOf('race_good_1', { audit: a, lines, was: { ...lines.race_good_1, duration: lines.race_good_1.duration - 0.6 } })
    expect(longer.notes.join(' ')).toMatch(/стала длиннее на 0,6 с/)
    const bad = normalizeLines(checkFixtureRaw()), ab = auditVoice(checkFixtureRaw()).byId
    expect(verdictOf(P.risk, { audit: ab, lines: bad })).toMatchObject({ light: 'red', title: 'требует действия' })
    expect(verdictOf('race_climb', { audit: a, lines }).notes.join(' ')).toMatch(/не звучит/)
    expect(verdictOf('нет_такой', { audit: a, lines })).toBeNull()
  })
})
