import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { phrasesOf, hasPhrases, normalizePhrase, phraseTokens, phraseWordKeys, withPhrases, PHRASES_MIN } from './racePhraseData.js'
import { round2SayTurns, round2HearTurns, decoysFor } from './racePhraseTurns.js'
import * as turnsMod from './racePhraseTurns.js'
import { phraseStages, PHRASE_SPEED, SAY_SPEED, LANE, ROUND_PLATES, gapMs, PHRASE_TAP_GAP_PCT, PHRASE_LINE_TAIL_MS } from './raceStagesPhrases.js'
import { RACE_LINE_IDS } from './raceLines.js'
import { RACE_LINE_SET, raceCatalog } from '../admin/speech/voiceAudit.js'
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
const kitOf = (p, tap = false) => { const stages = []; return { plan: p, tap, stages, push: s => { stages.push({ ...s, idx: stages.length, race: true }); return s }, announce: (act, o = {}) => stages.push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, line: o.line === undefined ? act.line : o.line, round: { title: o.title ?? act.title, task: o.task, look: o.look } }) } }

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

describe('ходы круга', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  it('«Узнай» (пальцами): ход на каждую свою фразу по порядку плана, дежурная целью не бывает; три смысла, верный один, смыслы разные', () => {
    const t = round2HearTurns(ph, 's1')
    expect(t.map(x => x.target.key)).toEqual(ph.filter(p => p.own).map(p => p.key))
    for (const x of t) {
      expect(x.pass).toBeUndefined(); expect(x.cands).toHaveLength(3); expect(x.cands.filter(c => c.right)).toHaveLength(1)
      expect(x.cands.find(c => c.right).key).toBe(x.target.key); expect(x.cands.find(c => c.right).cap).toBe(x.target.ru)
      expect(new Set(x.cands.map(c => c.cap)).size).toBe(3)
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
      const t = round2HearTurns(many, `seed${s}`)
      for (let i = 1; i < t.length; i++) { expect(t[i].target.key).not.toBe(t[i - 1].target.key); expect(t[i].cands[0].key).not.toBe(t[i - 1].cands.at(-1).key) }
    }
  })
  it('одно семя — одни и те же ходы (Math.random в модулях этапа нет)', () => {
    expect(JSON.stringify(round2HearTurns(ph, 'z'))).toBe(JSON.stringify(round2HearTurns(ph, 'z')))
    for (const f of ['racePhraseTurns.js', 'raceStagesPhrases.js', 'racePhraseScene.js', 'racePhraseVoice.js', 'raceStatePhrases.js', 'racePhraseData.js']) expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).not.toMatch(/Math\.random\s*\(/)
  })
  it('«Скажи» (голосом) — по своей фразе ДВА хода подряд (проход 1, проход 2) в порядке плана; ходов круга «Пойми» и перестановки «слабые последними» больше нет', () => {
    const say = round2SayTurns(ph)
    expect(say.map(t => t.cands.length)).toEqual([1, 1, 1, 1, 1, 1])
    expect(say.map(t => t.pass)).toEqual([1, 2, 1, 2, 1, 2]); expect(say.map(t => t.idx)).toEqual([0, 1, 2, 3, 4, 5])
    const keys = ph.filter(p => p.own).map(p => p.key)
    expect(say.map(t => t.target.key)).toEqual([keys[0], keys[0], keys[1], keys[1], keys[2], keys[2]])
    expect(turnsMod.round1Turns).toBeUndefined(); expect(turnsMod.reorderWeak).toBeUndefined()
  })
})

describe('стадии этапа: круг «Пойми · Тапни фразу» вырезан (владелец 2026-11-24)', () => {
  const build = tap => { const k = kitOf(plan(), tap); phraseStages(k, buildRaceActs(plan(), tap).acts.find(a => a.id === 'phrases')); return k.stages }
  it('голосом: плашка этапа с репликой race_phrases_show → сразу круг «Скажи» (sid phrases2); стадий phrases1 и отдельной плашки круга нет', () => {
    const st = build(false)
    expect(st.map(s => s.sid)).toEqual(['phrases-ann', 'phrases2'])
    expect(st[0]).toMatchObject({ type: 'announce', line: 'race_phrases_show', plateWithLine: true, lineTail: PHRASE_LINE_TAIL_MS, count: false }) // с примером плашка зовёт смотреть; ноты — после демо (сцена)
    expect(st[1].step.phrases).toMatchObject({ round: 2, mode: 'say', voice: true, speed: SAY_SPEED, countAfter: true }); expect(st[1].step.phrases.demo).toBeTruthy()
    expect(st[1].fill).toBeUndefined()
    expect(st[1].step.tapOnly).toBe(true); expect(st[1].step.quiet).toBe(true); expect(st[1].step.active).toEqual([LANE]); expect(st[1].step.reps.every(r => r.lane === LANE)).toBe(true)
    expect(PHRASE_SPEED).toBe(0.55); expect(SAY_SPEED).toBe(0.36)
    expect(st[1].step.phrases.gap).toBe(gapMs(SAY_SPEED)) // «Скажи» голосом — шаг 20 % высоты
  })
  it('пальцами: плашка этапа с репликой race_phrases_hear (и тремя нотами — count не выключен) → круг «Узнай»: смыслы на ленте, без слушателя', () => {
    const st = build(true)
    expect(st.map(s => s.sid)).toEqual(['phrases-ann', 'phrases2'])
    expect(st[0]).toMatchObject({ line: 'race_phrases_hear', plateWithLine: true, lineTail: PHRASE_LINE_TAIL_MS }); expect(st[0].count).toBeUndefined()
    expect(st[1].step.phrases).toMatchObject({ round: 2, mode: 'hear', voice: false, speed: PHRASE_SPEED, gap: gapMs(PHRASE_SPEED, PHRASE_TAP_GAP_PCT) }); expect(st[1].step.phrases.demo).toBeUndefined()
  })
  it('ни в одном режиме игры нет стадий и реплик вырезанного круга: phrases1, mode pick, race_phrases_pick / race_phrases / race_phrases_tap', () => {
    for (const round of [undefined, STAGES_ROUND, 'phrases']) for (const tap of [false, true]) {
      const { stages } = buildRaceStages({ plan: plan(round ? { round } : {}), tap, ru: true })
      expect(stages.filter(s => /^phrases1/.test(s.sid ?? ''))).toEqual([])
      expect(stages.filter(s => s.step?.phrases?.mode === 'pick' || s.step?.phrases?.round === 1)).toEqual([])
      expect(stages.map(s => s.line).filter(l => ['race_phrases', 'race_phrases_tap', 'race_phrases_pick'].includes(l))).toEqual([])
      const ph = stages.filter(s => s.act === 'phrases' && !s.switchTo)
      expect(ph.map(s => s.sid)).toEqual(['phrases-ann', 'phrases2']) // одна плашка — один круг: двойных плашек подряд нет
      const ann = ph[0], cnt = stages.filter(s => s.act === 'phrases' && s.count)
      expect(cnt.length + (ph[1].step.phrases.countAfter ? 1 : 0)).toBe(1) // отсчёт «три ноты» ровно один: на плашке или после демо
      expect(ann.round).toMatchObject({ title: 'Конвейер ситуаций' }); expect(`${ann.round.brief} ${ann.round.task}`).not.toMatch(/подбери|выбирай|сначала|потом|ситуаци/i)
    }
  })
  it('реплик вырезанного круга нет в каталоге и в аудите озвучки («нужно озвучить»); реплики оставшегося круга — есть', () => {
    for (const id of ['race_phrases', 'race_phrases_tap', 'race_phrases_pick']) { expect(RACE_LINE_IDS).not.toContain(id); expect(RACE_LINE_SET.has(id)).toBe(false); expect(raceCatalog().some(l => l.id === id)).toBe(false) }
    for (const id of ['race_phrases_show', 'race_phrases_say', 'race_phrases_hear', 'race_demo_1', 'race_phrase_again', 'race_phrase_yes']) expect(RACE_LINE_SET.has(id)).toBe(true)
  })
  it('в полной гонке — после «Пинг-понга» и до «Вершины»; голосом с русской моделью перед фразами слух возвращается на английский', () => {
    const ids = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages.map(s => s.sid)
    expect(ids.indexOf('catch2')).toBeLessThan(ids.indexOf('phrases-sw')); expect(ids.indexOf('phrases-sw')).toBeLessThan(ids.indexOf('phrases-ann')); expect(ids.indexOf('phrases2')).toBeLessThan(ids.indexOf('climb-ann'))
    expect(ids).not.toContain('climb-sw')
  })
  it('круги: «Скажи · Скажи сам» с микрофоном (голосом) или «Узнай · Тапни смысл» с пальцем (пальцами); плашка этапа несёт реплику круга', () => {
    expect(ROUND_PLATES.pick).toBeUndefined()
    expect(ROUND_PLATES.say).toEqual({ title: 'Скажи', task: 'Скажи сам', line: 'race_phrases_say', look: { tone: 'accent', icon: 'mic' } })
    expect(ROUND_PLATES.hear).toEqual({ title: 'Узнай', task: 'Тапни смысл', line: 'race_phrases_hear', look: { tone: 'accent', icon: 'tap' } })
    for (const tap of [false, true]) {
      const st = buildRaceStages({ plan: plan(), tap, ru: true }).stages
      expect(st.find(s => s.sid === 'phrases-ann').line).toBe(tap ? 'race_phrases_hear' : 'race_phrases_show')
      expect(st.find(s => s.sid === 'phrases-ann').round.brief).toBe(tap ? 'тапни смысл фразы' : 'скажи фразу по-английски')
    }
  })
  it('режим по умолчанию — «Пинг-понг + фразы + финал»', () => {
    expect(RACE_TITLES[STAGES_ROUND]).toBe('Пинг-понг + фразы + финал')
    expect(buildRaceStages({ plan: plan({ round: STAGES_ROUND }), tap: true }).stages.map(s => s.act).filter((a, i, l) => a !== l[i - 1])).toEqual(['sprint', 'catch', 'phrases', 'summary'])
  })
})
