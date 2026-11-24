import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { phrasesOf, hasPhrases, normalizePhrase, phraseTokens, phraseWordKeys, withPhrases, PHRASES_MIN } from './racePhraseData.js'
import { round2SayTurns } from './racePhraseTurns.js'
import * as turnsMod from './racePhraseTurns.js'
import { phraseStages, SAY_SPEED, LANE, ROUND_PLATES, gapMs, PHRASE_LINE_TAIL_MS } from './raceStagesPhrases.js'
import { RACE_LINE_IDS, RACE_LINES } from './raceLines.js'
import { RACE_LINE_SET, raceCatalog } from '../admin/speech/voiceAudit.js'
import { buildRaceStages } from './raceStages.js'
import { buildRaceActs } from './raceRecipe.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { RACE_TITLES, STAGES_ROUND } from './raceOnly.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { readRehearsalCfg } from '../rehearsal/rehearsalCfg.js'

// Этап 2 «Фразы»: фразы плана, ходы кругов и стадии (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»)
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
  it('«Скажи» (голосом) — по своей фразе ДВА хода подряд (проход 1, проход 2) в порядке плана, дежурная целью не бывает; одна пилюля на ход', () => {
    const say = round2SayTurns(ph)
    expect(say.map(t => t.cands.length)).toEqual([1, 1, 1, 1, 1, 1])
    expect(say.map(t => t.pass)).toEqual([1, 2, 1, 2, 1, 2]); expect(say.map(t => t.idx)).toEqual([0, 1, 2, 3, 4, 5])
    const keys = ph.filter(p => p.own).map(p => p.key)
    expect(say.map(t => t.target.key)).toEqual([keys[0], keys[0], keys[1], keys[1], keys[2], keys[2]])
    for (const t of say) expect(t.cands[0]).toEqual({ key: t.target.key, cap: t.target.text, right: true, text: t.target.text })
  })
  it('тап-кругов нет: ходов «Пойми» / «Узнай», запутывателей и перестановки «слабые последними» в модуле нет; случайности (Math.random) в модулях этапа нет', () => {
    for (const k of ['round1Turns', 'round2HearTurns', 'decoysFor', 'reorderWeak']) expect(turnsMod[k]).toBeUndefined()
    expect(JSON.stringify(round2SayTurns(ph))).toBe(JSON.stringify(round2SayTurns(ph)))
    for (const f of ['racePhraseTurns.js', 'raceStagesPhrases.js', 'racePhraseScene.js', 'racePhraseVoice.js', 'raceStatePhrases.js', 'racePhraseData.js']) expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).not.toMatch(/Math\.random\s*\(/)
  })
})

describe('стадии этапа: тап-круги «Пойми» и «Узнай» вырезаны (владелец 2026-11-24)', () => {
  const act = tap => buildRaceActs(plan(), tap).acts.find(a => a.id === 'phrases')
  it('голосом: плашка этапа с репликой race_phrases_show → сразу круг «Скажи» (sid phrases2); стадий phrases1 и отдельной плашки круга нет', () => {
    const k = kitOf(plan(), false); phraseStages(k, act(false)); const st = k.stages
    expect(st.map(s => s.sid)).toEqual(['phrases-ann', 'phrases2'])
    expect(st[0]).toMatchObject({ type: 'announce', line: 'race_phrases_show', plateWithLine: true, lineTail: PHRASE_LINE_TAIL_MS, count: false }) // с примером плашка зовёт смотреть; ноты — после демо (сцена)
    expect(st[1].step.phrases).toMatchObject({ round: 2, mode: 'say', voice: true, speed: SAY_SPEED, countAfter: true }); expect(st[1].step.phrases.demo).toBeTruthy()
    expect(st[1].fill).toBeUndefined()
    expect(st[1].step.tapOnly).toBe(true); expect(st[1].step.quiet).toBe(true); expect(st[1].step.active).toEqual([LANE]); expect(st[1].step.reps.every(r => r.lane === LANE)).toBe(true)
    expect(SAY_SPEED).toBe(0.36)
    expect(st[1].step.phrases.gap).toBe(gapMs(SAY_SPEED)) // шаг 20 % высоты
  })
  it('пальцами этапа фраз нет совсем: акта в рецепте нет, стадий нет (даже если сборщик позвали), за «Конвейером слов» сразу итог', () => {
    expect(act(true)).toBeUndefined(); expect(act(false)).toMatchObject({ title: 'Конвейер ситуаций', brief: 'скажи фразу по-английски', line: null })
    const k = kitOf(plan(), true); phraseStages(k, act(false)); expect(k.stages).toEqual([])
    for (const round of [undefined, STAGES_ROUND]) {
      const { stages } = buildRaceStages({ plan: plan(round ? { round } : {}), tap: true, ru: true })
      expect(stages.filter(s => s.act === 'phrases' || /^phrases/.test(s.sid ?? '') || s.step?.phrases)).toEqual([])
      expect(stages.filter(s => s.act === 'boss')).toEqual([]) // экзамена пальцами нет, как и раньше
    }
    expect(buildRaceStages({ plan: plan({ round: STAGES_ROUND }), tap: true }).stages.map(s => s.act).filter((a, i, l) => a !== l[i - 1])).toEqual(['sprint', 'catch', 'summary'])
  })
  it('голосом ни в одном режиме игры нет стадий и реплик вырезанных кругов; плашка одна, отсчёт один', () => {
    for (const round of [undefined, STAGES_ROUND, 'phrases']) {
      const { stages } = buildRaceStages({ plan: plan(round ? { round } : {}), tap: false, ru: true })
      expect(stages.filter(s => /^phrases1/.test(s.sid ?? ''))).toEqual([])
      expect(stages.filter(s => s.step?.phrases && s.step.phrases.mode !== 'say')).toEqual([])
      expect(stages.map(s => s.line).filter(l => ['race_phrases', 'race_phrases_tap', 'race_phrases_pick', 'race_phrases_hear'].includes(l))).toEqual([])
      const ph = stages.filter(s => s.act === 'phrases' && !s.switchTo)
      expect(ph.map(s => s.sid)).toEqual(['phrases-ann', 'phrases2']) // одна плашка — один круг: двойных плашек подряд нет
      const ann = ph[0], cnt = stages.filter(s => s.act === 'phrases' && s.count)
      expect(cnt.length + (ph[1].step.phrases.countAfter ? 1 : 0)).toBe(1) // отсчёт «три ноты» ровно один: на плашке или после демо
      expect(ann.round).toMatchObject({ title: 'Конвейер ситуаций', brief: 'скажи фразу по-английски' }); expect(`${ann.round.brief} ${ann.round.task}`).not.toMatch(/подбери|выбирай|сначала|потом|ситуаци|тапни/i)
    }
  })
  it('реплик вырезанных кругов нет в каталоге и в аудите озвучки («нужно озвучить»); реплики «Скажи» — есть', () => {
    for (const id of ['race_phrases', 'race_phrases_tap', 'race_phrases_pick', 'race_phrases_hear', 'race_phrase_no']) { expect(RACE_LINE_IDS).not.toContain(id); expect(RACE_LINE_SET.has(id)).toBe(false); expect(raceCatalog().some(l => l.id === id)).toBe(false) }
    for (const id of ['race_phrases_show', 'race_phrases_say', 'race_demo_1', 'race_demo_2', 'race_demo_3', 'race_demo_more', 'race_phrase_again', 'race_phrase_yes', 'race_phrase_pauses', 'race_slip_word', 'race_slip_retry', 'race_slip_next']) expect(RACE_LINE_SET.has(id)).toBe(true)
  })
  it('тексты этапа — сценарий владельца 2026-11-24 (тот же id, нужна переозвучка)', () => {
    const t = Object.fromEntries(RACE_LINES.map(l => [l.id, l.text]))
    expect(t.race_phrases_show).toBe('Конвейер ситуаций, смотри, как это делается'); expect(t.race_demo_1).toBe('Смотри, начинаем с первого слова')
    expect(t.race_phrases_say).toBe('Теперь твоя очередь, не торопись, проговаривай слова отдельно'); expect(t.race_phrase_again).toBe('попробуй повторить фразу без остановок')
    expect(t.race_slip_retry).toBe('сказано чуть не точно, попробуй ещё раз')
    expect([t.race_demo_2, t.race_demo_3, t.race_demo_more, t.race_phrase_yes, t.race_phrase_pauses, t.race_slip_next]).toEqual(['затем второе', 'потом третье', 'и так до конца', 'да, это оно', 'хорошо, только без пауз', 'сказано не точно, в следующий раз у тебя получится'])
  })
  it('в полной гонке — после «Пинг-понга» и до «Вершины»; голосом с русской моделью перед фразами слух возвращается на английский', () => {
    const ids = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages.map(s => s.sid)
    expect(ids.indexOf('catch2')).toBeLessThan(ids.indexOf('phrases-sw')); expect(ids.indexOf('phrases-sw')).toBeLessThan(ids.indexOf('phrases-ann')); expect(ids.indexOf('phrases2')).toBeLessThan(ids.indexOf('climb-ann'))
    expect(ids).not.toContain('climb-sw')
  })
  it('круг один — «Скажи · Скажи сам» с микрофоном; плашка этапа несёт его реплику', () => {
    expect(Object.keys(ROUND_PLATES)).toEqual(['say'])
    expect(ROUND_PLATES.say).toEqual({ title: 'Скажи', task: 'Скажи сам', line: 'race_phrases_say', look: { tone: 'accent', icon: 'mic' } })
    expect(buildRaceStages({ plan: plan(), tap: false, ru: true }).stages.find(s => s.sid === 'phrases-ann').line).toBe('race_phrases_show')
  })
  it('режим по умолчанию — «Пинг-понг + фразы + финал»', () => {
    expect(RACE_TITLES[STAGES_ROUND]).toBe('Пинг-понг + фразы + финал')
    expect(buildRaceStages({ plan: plan({ round: STAGES_ROUND }), tap: false, ru: true }).stages.map(s => s.act).filter((a, i, l) => a !== l[i - 1])).toEqual(['sprint', 'catch', 'phrases', 'boss', 'summary'])
  })
})
