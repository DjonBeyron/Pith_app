import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transKey, transTexts, sprintTransTexts, transRow, transItems, transRows, TRANS_PREFIX } from './raceTrans.js'
import { sprintWords, extrasOf } from './raceWords.js'
import { phraseMeanings, phraseScenes } from './racePhraseData.js'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { readRehearsalCfg } from '../rehearsal/rehearsalCfg.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Голос русских переводов «Разгона»: ключ в word_audio, наборы текстов, порядок «перевод → пилюля» в движке и проводка.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const racePlan = { ...plan, extraWords: extrasOf(plan) }
const sprint = () => buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(s => s.act === 'sprint' && s.type === 'student')
const mk = (o = {}) => { const s = sprint(); return createStudentGame({ step: { ...s.step, ...o }, chunks: s.step.chunks, estMs: () => 400, maxTries: 1 }) }

describe('озвучка переводов: ключи и наборы', () => {
  it('ключ — ru: + перевод строчными без пунктуации по краям; пусто — null', () => {
    expect(TRANS_PREFIX).toBe('ru:'); expect(transKey('Пытаться, ')).toBe('ru:пытаться'); expect(transKey('  ')).toBeNull(); expect(transKey(null)).toBeNull()
  })
  it('переводы: слова плана и extraWords без повторов; для прогрева — только слова «Разгона» в порядке выезда', () => {
    const all = transTexts(racePlan), sprintT = sprintTransTexts(racePlan)
    expect(all.length).toBeGreaterThan(3); expect(new Set(all.map(transKey)).size).toBe(all.length)
    expect(sprintT.length).toBeGreaterThan(0); expect(sprintT.length).toBeLessThanOrEqual(sprintWords(racePlan).length + phraseMeanings(racePlan).length + phraseScenes(racePlan).length) // и смыслы и ситуации фраз этапа 2
    sprintT.forEach(t => expect(all).toContain(t))
  })
  it('transRow / transItems: только записи с озвучкой, без повторов; transRows помечает озвученные', () => {
    const cache = new Map([['ru:пытаться', { url: 'u1' }], ['ru:учить', { url: '' }]])
    expect(transRow('Пытаться', cache)).toEqual({ key: 'ru:пытаться', row: { url: 'u1' } }); expect(transRow('учить', cache)).toBeNull(); expect(transRow('x', null)).toBeNull()
    expect(transItems(['пытаться', 'Пытаться', 'учить'], cache)).toEqual([{ key: 'ru:пытаться', url: 'u1' }])
    expect(transRows(['пытаться', 'учить'], cache)).toEqual([{ text: 'пытаться', key: 'ru:пытаться', has: true }, { text: 'учить', key: 'ru:учить', has: false }])
  })
  it('cfg игры: translations — переводы разгона; у обычной репетиции пусто; без Math.random', () => {
    expect(readRehearsalCfg(racePlan).translations).toEqual(sprintTransTexts(normalizePlan(racePlan)))
    expect(readRehearsalCfg({ ...fixturePlan('three') }).translations).toEqual([])
    expect(read('./raceTrans.js')).not.toContain('Math.random')
  })
})

describe('«Разгон»: перевод голосом перед пилюлей (preSay)', () => {
  it('ступень разгона помечена preSay; у каждой пилюли cap — её перевод', () => {
    const s = sprint(); expect(s.step.preSay).toBe(true); expect(s.step.reps.every(r => r.cap)).toBe(true)
  })
  it('порядок: сначала pre (перевод), пилюля — следующим кадром; pre на каждую пилюлю один раз', () => {
    const g = mk(); const types = []
    for (let t = 0; t < 400; t += 16) for (const e of stepStudent(g, t)) types.push(e.type === 'pre' || e.type === 'spawn' ? `${e.type}${e.rep.idx}` : e.type)
    expect(types.slice(0, 2)).toEqual(['pre0', 'spawn0']); expect(types.filter(x => x === 'pre0')).toHaveLength(1)
  })
  it('Пит занят (hold): перевод не начинается и пилюля не выезжает; освободился — pre, потом spawn', () => {
    const g = mk(); let ev = []
    for (let t = 0; t < 320; t += 16) ev.push(...stepStudent(g, t, { hold: true }))
    expect(ev.some(e => e.type === 'pre' || e.type === 'spawn')).toBe(false)
    ev = stepStudent(g, 336, { hold: false }); expect(ev.map(e => e.type)).toEqual(['pre'])
    expect(stepStudent(g, 352, { hold: true }).some(e => e.type === 'spawn')).toBe(false) // Пит говорит перевод
    expect(stepStudent(g, 368, { hold: false }).some(e => e.type === 'spawn')).toBe(true) // договорил — пилюля выехала
  })
  it('без preSay (другие раунды) события pre нет, пилюля выезжает сразу', () => {
    const g = mk({ preSay: false }); const ev = stepStudent(g, 0)
    expect(ev.some(e => e.type === 'pre')).toBe(false); expect(ev.some(e => e.type === 'spawn')).toBe(true)
  })
})

describe('проводка', () => {
  it('движок пилюль зовёт fx.pre; директор гонки говорит перевод через sayText(…, { ru: true }); игра: только озвучка из библиотеки, без голоса системы, Пит занят до конца слова', () => {
    expect(read('../player/modules/rotate-phone/useWordLanePills.js')).toContain("e.type === 'pre'")
    expect(read('./useRaceActs.js')).toContain('{ ru: true, ...o }')
    const flow = read('../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain('pre(e) { rh.pre?.(e.rep, e) }'); expect(flow).toContain('pre: (...a) => handlersRef.current.pre(...a)')
    expect(flow).toContain('opts?.ru ? transRow(text) : libRow(text)'); expect(flow).toContain('if (opts?.ru) { closeWin?.(); return } speakWord(text)'); expect(flow).toContain('cat.holdBusy?.(total); opts.onSay?.(total)')
    expect(read('../player/modules/rotate-phone/wordLaneStart.js')).toContain('transItems(cfg.translations)')
    expect(read('../player/modules/rotate-phone/wordLaneWarm.js')).toContain('cfg.translations')
  })
})
