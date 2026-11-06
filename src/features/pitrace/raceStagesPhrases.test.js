import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { phrasesOf, hasPhrases, normalizePhrase, phraseTokens, phraseWordKeys, withPhrases, PHRASES_MIN } from './racePhraseData.js'
import { round1Turns, round2SayTurns, round2HearTurns, reorderWeak, decoysFor } from './racePhraseTurns.js'
import { phraseStages, PHRASE_SPEED, SAY_SPEED, LANE } from './raceStagesPhrases.js'
import { buildRaceStages } from './raceStages.js'
import { buildRaceActs } from './raceRecipe.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { RACE_TITLES, STAGES_ROUND } from './raceOnly.js'
import { rngFor } from '../rehearsal/rehearsalSeed.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { readRehearsalCfg } from '../rehearsal/rehearsalCfg.js'

// Этап 2 «Фразы»: фразы плана, ходы кругов и стадии (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»)
const P = (key, ru, own = true) => ({ text: key, key, ru, own, words: [] })
const plan = (o = {}) => withPhrases(normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race', ...o }), { phrases: PHRASE_FIXTURE, ...o })
const kitOf = (p, tap = false) => { const stages = []; return { plan: p, tap, stages, push: s => { stages.push({ ...s, idx: stages.length, race: true }); return s }, announce: (act, o = {}) => stages.push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, line: o.line === undefined ? act.line : o.line, round: { title: o.title ?? act.title } }) } }

describe('фразы плана', () => {
  it('нормализация: пустые выбрасываются, key из текста, слова строчными для слушателя, ключи слов для точности', () => {
    expect(normalizePhrase({ text: '  ' })).toBeNull()
    const p = normalizePhrase({ text: "I'm trying to learn", ru: 'смысл', words: ['learn', { text: 'trying', translation: 'пытаюсь' }] })
    expect(p.key).toBe('i am trying to learn'); expect(p.own).toBe(true); expect(p.audio).toBeNull()
    expect(phraseTokens(p.text)).toEqual(["i'm", 'trying', 'to', 'learn'])
    expect(phraseWordKeys(p)).toEqual(['i am', 'trying', 'to', 'learn'])
  })
  it('план без фраз — этапа нет; план-симуляция без фраз — фикстура; повторы по key отбрасываются; не меньше трёх и хотя бы одна своя', () => {
    expect(phrasesOf({ source: 'node' })).toEqual([])
    expect(phrasesOf({ source: 'sim' }).map(p => p.key)).toEqual(PHRASE_FIXTURE.map(p => p.key))
    expect(phrasesOf({ phrases: [PHRASE_FIXTURE[0], PHRASE_FIXTURE[0], PHRASE_FIXTURE[1]] })).toHaveLength(2)
    expect(PHRASES_MIN).toBe(3)
    expect(hasPhrases(phrasesOf({ phrases: PHRASE_FIXTURE.slice(0, 2) }))).toBe(false)
    expect(hasPhrases(phrasesOf({ phrases: PHRASE_FIXTURE.map(p => ({ ...p, own: false })) }))).toBe(false)
    expect(buildRaceActs(plan({ phrases: PHRASE_FIXTURE.slice(0, 2) })).acts.map(a => a.id)).not.toContain('phrases')
  })
  it('фикстура: три своих + одна дежурная, смысл у всех, целой озвучки нет', () => {
    expect(PHRASE_FIXTURE.filter(p => p.own)).toHaveLength(3); expect(PHRASE_FIXTURE.filter(p => !p.own)).toHaveLength(1)
    expect(PHRASE_FIXTURE.every(p => p.ru && p.audio === null)).toBe(true)
  })
  it('план игры (rehearsalCfg) несёт plan.phrases, пока нормализатор их не знает', () => {
    expect(readRehearsalCfg({ ...fixturePlan('two'), source: 'node', game: 'race', phrases: PHRASE_FIXTURE }).plan.phrases).toHaveLength(4)
  })
})

describe('ходы кругов', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  it('круг 1: ход на каждую свою фразу по порядку плана, дежурная целью не бывает; три кандидата, верный один, смыслы разные', () => {
    const t = round1Turns(ph, 's1')
    expect(t.map(x => x.target.key)).toEqual(ph.filter(p => p.own).map(p => p.key))
    for (const x of t) {
      expect(x.cands).toHaveLength(3); expect(x.cands.filter(c => c.right)).toHaveLength(1)
      expect(x.cands.find(c => c.right).key).toBe(x.target.key)
      const senses = x.cands.map(c => ph.find(p => p.key === c.key).ru); expect(new Set(senses).size).toBe(3)
      expect(x.cands.find(c => c.right).cap).toBe(x.target.text)
    }
  })
  it('свои запутыватели приоритетнее дежурных; дежурная — когда своих не хватает; одинаковый смысл не запутыватель', () => {
    const rng = rngFor('s', 'x')
    expect(decoysFor(ph[0], ph, rng).every(p => p.own)).toBe(true)
    const few = [P('a', 'раз'), P('b', 'два'), P('c', 'три', false), P('d', 'раз')]
    const d = decoysFor(few[0], few, rngFor('s', 'y')).map(p => p.key)
    expect(d).toEqual(['b', 'c']) // d — тот же смысл, что у цели; c — дежурная, своих больше нет
  })
  it('одна и та же фраза не подряд: цель хода ≠ цель прошлого, первая пилюля хода ≠ последней пилюли прошлого (по многим семенам)', () => {
    const many = [P('a', '1'), P('b', '2'), P('c', '3'), P('d', '4'), P('e', '5', false)]
    for (let s = 0; s < 40; s++) {
      const t = round1Turns(many, `seed${s}`)
      for (let i = 1; i < t.length; i++) { expect(t[i].target.key).not.toBe(t[i - 1].target.key); expect(t[i].cands[0].key).not.toBe(t[i - 1].cands.at(-1).key) }
    }
  })
  it('одно семя — одни и те же ходы (Math.random в модулях этапа нет)', () => {
    expect(JSON.stringify(round1Turns(ph, 'z'))).toBe(JSON.stringify(round1Turns(ph, 'z')))
    for (const f of ['racePhraseTurns.js', 'raceStagesPhrases.js', 'racePhraseScene.js', 'racePhraseVoice.js', 'raceStatePhrases.js', 'racePhraseData.js']) expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).not.toMatch(/Math\.random\s*\(/)
  })
  it('круг 2 голосом — по одной своей фразе; пальцами — три смысла (ru), верный один; слабые фразы круга 1 — последними', () => {
    expect(round2SayTurns(ph).map(t => t.cands.length)).toEqual([1, 1, 1])
    const h = round2HearTurns(ph, 's1')
    for (const t of h) { expect(t.cands.map(c => c.cap)).toContain(t.target.ru); expect(new Set(t.cands.map(c => c.cap)).size).toBe(3) }
    const keys = round2SayTurns(ph).map(t => t.target.key)
    const re = reorderWeak(round2SayTurns(ph), [keys[0]])
    expect(re.map(t => t.target.key)).toEqual([keys[1], keys[2], keys[0]]); expect(re.map(t => t.idx)).toEqual([0, 1, 2])
  })
})

describe('стадии этапа', () => {
  it('плашка race_phrases → круг 1 → плашка круга 2 (без реплики) → круг 2; ступени — своя сцена (step.phrases), слух слов выключен, лента — средняя дорожка', () => {
    const k = kitOf(plan()); const act = buildRaceActs(plan()).acts.find(a => a.id === 'phrases')
    phraseStages(k, act)
    expect(k.stages.map(s => s.sid)).toEqual(['phrases-ann', 'phrases1', 'phrases2-ann', 'phrases2'])
    expect(k.stages[0].line).toBe('race_phrases'); expect(k.stages[2].line).toBeNull()
    const [s1, s2] = [k.stages[1], k.stages[3]]
    expect(s1.step.phrases).toMatchObject({ round: 1, mode: 'pick', voice: true, speed: PHRASE_SPEED }); expect(s2.step.phrases).toMatchObject({ round: 2, mode: 'say', speed: SAY_SPEED })
    for (const s of [s1, s2]) { expect(s.step.tapOnly).toBe(true); expect(s.step.quiet).toBe(true); expect(s.step.active).toEqual([LANE]); expect(s.step.reps.every(r => r.lane === LANE)).toBe(true) }
    expect(SAY_SPEED).toBeLessThan(1); expect(PHRASE_SPEED).toBeLessThan(1)
  })
  it('пальцами: круг 2 «Узнай» — смыслы на ленте; fill ставит слабые фразы последними', () => {
    const k = kitOf(plan(), true); const act = buildRaceActs(plan(), true).acts.find(a => a.id === 'phrases')
    phraseStages(k, act)
    const s2 = k.stages.find(s => s.sid === 'phrases2')
    expect(s2.step.phrases.mode).toBe('hear'); expect(s2.step.phrases.voice).toBe(false)
    const first = s2.turns[0].target.key
    s2.fill([first]); const again = k.stages.find(s => s.sid === 'phrases2')
    expect(again.turns.at(-1).target.key).toBe(first); expect(again.step.phrases.turns.at(-1).target.key).toBe(first)
  })
  it('в полной гонке — после «Пинг-понга» и до «Вершины»; голосом с русской моделью перед фразами слух возвращается на английский', () => {
    const ids = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages.map(s => s.sid)
    expect(ids.indexOf('catch2')).toBeLessThan(ids.indexOf('phrases-sw')); expect(ids.indexOf('phrases-sw')).toBeLessThan(ids.indexOf('phrases-ann')); expect(ids.indexOf('phrases2')).toBeLessThan(ids.indexOf('climb-ann'))
    expect(ids).not.toContain('climb-sw')
  })
  it('режим по умолчанию — «Пинг-понг + фразы + финал»', () => {
    expect(RACE_TITLES[STAGES_ROUND]).toBe('Пинг-понг + фразы + финал')
    expect(buildRaceStages({ plan: plan({ round: STAGES_ROUND }), tap: true }).stages.map(s => s.act).filter((a, i, l) => a !== l[i - 1])).toEqual(['sprint', 'catch', 'phrases', 'summary'])
  })
})
