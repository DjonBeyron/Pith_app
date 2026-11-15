import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resultScore, wordWeakness, bossWords, bossFill, BOSS_MAX, BOSS_MIN, BOSS_SPEED } from './bossWords.js'
import { buildRaceStages } from '../raceStages.js'
import { initRace } from '../raceState.js'
import { miaSkip } from '../mia/miaRound.js'
import { reduceMia, miaInit, MIA, BOSS, makeMiaBox, markMiaEntered, markDemoDone, bossExplaining } from '../mia/raceMia.js'
import { miaLine, MIA_LINES, isMiaLine } from '../mia/miaLines.js'
import { flashOf, REVEAL_LINES } from './bossScale.js'
import { arrivalAt, ARR } from '../mia/miaMotion.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

const W = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((text, idx) => ({ text, translation: text.toUpperCase(), idx, lane: idx % 3, speed: 1 }))
const state = results => { const s = initRace(); s.sprint = { ...s.sprint, words: W.map(w => w.text), results }; return s }

describe('слабость слова', () => {
  it('ошибка / молчание — 3, ответ в последний момент — 2, иначе время ответа в долях 4 с, нет результата — 1', () => {
    expect(resultScore({ hit: false })).toBe(3); expect(resultScore({ hit: true, miss: true })).toBe(3); expect(resultScore({ hit: true, late: true })).toBe(2)
    expect(resultScore({ hit: true, ms: 2000 })).toBe(0.5); expect(resultScore({ hit: true, ms: 99999 })).toBe(1.5); expect(resultScore(undefined)).toBe(1)
  })
  it('по всем проходам берётся наибольшая слабость (ошибка в круге 2 — слово слабое)', () => {
    const s = state({ 0: { hit: true, ms: 800 } }); s.sprint.r2 = { words: ['a'], results: { 0: { hit: false, miss: true } } }
    expect(wordWeakness(s, 'a')).toBe(3); expect(wordWeakness(s, 'zzz')).toBe(1)
  })
})

describe('слова финала', () => {
  it('до BOSS_MAX самых слабых; порядок — от прочных к слабым; одна дорожка по центру, скорость BOSS_SPEED', () => {
    const s = state({ 0: { hit: false }, 1: { hit: true, late: true }, 2: { hit: true, ms: 500 }, 3: { hit: true, ms: 1500 }, 4: { hit: false }, 5: { hit: true, ms: 100 }, 6: { hit: true, ms: 3000 }, 7: { hit: true, late: true } })
    const out = bossWords(W, s, 7)
    expect(out).toHaveLength(BOSS_MAX); expect(out.every(w => w.lane === 1 && w.speed === BOSS_SPEED)).toBe(true); expect(out.map(w => w.idx)).toEqual([0, 1, 2, 3, 4, 5])
    const sc = out.map(w => wordWeakness(s, w.text)); expect(sc).toEqual([...sc].sort((a, b) => a - b)) // от прочных к слабым
    expect(out.map(w => w.text)).toEqual(expect.arrayContaining(['a', 'e'])) // обе ошибки в финале
    expect(out.map(w => w.text)).not.toContain('f') // самое прочное слово в финал не попало
  })
  it('слов меньше BOSS_MIN — пусто; тот же семя — тот же набор', () => {
    expect(bossWords(W.slice(0, BOSS_MIN - 1), initRace(), 1)).toEqual([]); expect(bossWords(W, initRace(), 5)).toEqual(bossWords(W, initRace(), 5))
  })
})

describe('финал в стадиях гонки', () => {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
  const stages = () => buildRaceStages({ plan, tap: false, ru: true }).stages
  it('перед итогом церемония Мии (boss-ann: always, mia ann, свой сценарий boss, без реплики стадии и без плашки) и круг (boss: mia round, wide, noBoost, noLeave, одна дорожка)', () => {
    const st = stages(), i = st.findIndex(x => x.sid === 'boss-ann')
    expect(st[i]).toMatchObject({ type: 'announce', mia: 'ann', always: true, line: null, act: 'boss', script: 'boss' }); expect(st[i].waitCap).toBeGreaterThan(30000); expect(st[i]).toMatchObject({ count: 'after', soft: true })
    expect(st[i + 1]).toMatchObject({ type: 'student', sid: 'boss', mia: 'round', noBoost: true, noLeave: true }); expect(st[i + 1].step).toMatchObject({ wide: true, overlap: false }); expect(st[i + 1].step.reps.every(r => r.lane === 1)).toBe(true)
    expect(st[i + 2]).toMatchObject({ type: 'announce', sid: 'boss-end', mia: 'end', always: true, line: null }); expect(st[i + 3].type).toBe('summary') // эпилог на сцене с коробкой, потом итог
  })
  it('в «Тапаю» финала нет', () => { expect(buildRaceStages({ plan, tap: true, ru: true }).stages.some(x => x.act === 'boss')).toBe(false) })
  it('bossFill вписывает слабые слова этой игры; мало слов — empty, и nextIdx обходит финал (miaSkip: always)', () => {
    const st = stages(), i = st.findIndex(x => x.sid === 'boss-ann'), r = st[i + 1]
    const sp = st.find(x => x.sid === 'sprint'); const s = initRace(); s.sprint = { ...s.sprint, words: sp.words.map(w => w.text), results: { 0: { hit: false } } }
    expect(bossFill(st, s, 3)).toBe(i); expect(r.words.map(w => w.text)).toContain(sp.words[0].text); expect(r.step.reps).toHaveLength(r.words.length); expect(st[i].empty).toBe(false)
    expect(miaSkip(st, i, { phase: 'off' })).toBe(i)
    st[i].empty = r.empty = st[i + 2].empty = true; expect(miaSkip(st, i, { phase: 'off' }, j => j)).toBe(i + 3) // мало слов — обходятся церемония, круг и эпилог
  })
})

describe('Мия в финале', () => {
  const ann = { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true }
  const round = { type: 'student', act: 'boss', sid: 'boss', mia: 'round', noBoost: true, noLeave: true, words: [{ text: 'a' }] }
  it('ускорения нет (noBoost), цвет дорожки меняется (fast), три верных подряд Мия не уходит (noLeave)', () => {
    let m = reduceMia(miaInit(), { t: 'enter', stage: ann, now: 1000 }).mia
    const r = reduceMia(m, { t: 'enter', stage: round }); expect(r.boost).toBeNull(); expect(r.mia.fast).toBe(true); m = r.mia
    for (let i = 0; i < MIA.STREAK_LEAVE + 1; i++) m = reduceMia(m, { t: 'win', stage: round, idx: 0, now: 2000 }).mia
    expect(m.phase).toBe('in'); expect(m.streak).toBe(MIA.STREAK_LEAVE + 1)
    expect(reduceMia(m, { t: 'enter', stage: { type: 'summary', act: 'summary' }, now: 3000 }).mia.phase).toBe('out') // уходит на итоге
  })
})

describe('финал: сценарий Мии, красные слова, «останется внутри»', () => {
  const ann = { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true, script: 'boss', dropAt: BOSS.DROP_AT, jumpAt: BOSS.JUMP }
  const round = { type: 'student', act: 'boss', sid: 'boss', mia: 'round', noBoost: true, noLeave: true, silent: true, words: [{ text: 'a' }] }
  const summary = { type: 'summary', act: 'summary' }, end = { type: 'announce', act: 'boss', sid: 'boss-end', mia: 'end', always: true }
  const ids = r => r.say.map(l => l.id)
  const start = () => reduceMia(miaInit(), { t: 'enter', stage: ann, now: 1000 })

  it('своя церемония: коробка падает через BOSS.DROP_AT, Мия прыгает через BOSS.JUMP, реплики по сценарию владельца', () => {
    const r = start()
    expect(r.mia).toMatchObject({ phase: 'in', act: 'boss', at: 1000 + BOSS.DROP_AT, jump: BOSS.JUMP })
    expect(ids(r)).toEqual(['boss_pit_1', 'boss_mia_hush', 'boss_mia_look', 'boss_mia_think']) // реплики о зонах, «пять красных» и «нет, только не это» запускает пример-пилюля на шкале (DEMO_CUES)
    expect(r.say.map(l => l.who)).toEqual(['pit', 'mia', 'mia', 'mia']); expect(r.say.map(l => l.delay)).toEqual([...r.say.map(l => l.delay)].sort((a, b) => a - b))
    for (const l of r.say) expect(miaLine(l.id)).toBeTruthy() // каждая реплика есть в каталоге (озвучка, подпись)
    expect(ids(r)).not.toContain('mia_push'); expect(ids(r)).not.toContain('pit_panic') // реплики прохода в финале не повторяются
  })
  it('в круге Мия молчит (silent); красные: не отвеченные (fail / miss по номеру слова, без двойного счёта) и ответы в красной зоне; пять — keep', () => {
    let m = reduceMia(start().mia, { t: 'enter', stage: round }).mia
    expect(reduceMia(m, { t: 'win', stage: round, idx: 0 }).say).toEqual([]); expect(reduceMia(m, { t: 'miss', stage: round, idx: 0 }).say).toEqual([])
    m = reduceMia(m, { t: 'fail', stage: round, idx: 0 }).mia; m = reduceMia(m, { t: 'miss', stage: round, idx: 0 }).mia // miss и fail по одному слову — одно красное
    expect(m.reds).toBe(1)
    for (const z of ['fast', 'mid', 'slow']) m = reduceMia(m, { t: 'zone', zone: z, stage: round }).mia
    expect(m).toMatchObject({ reds: 2, redWins: 1, keep: false })
    for (const i of [1, 2]) m = reduceMia(m, { t: 'fail', stage: round, idx: i }).mia
    expect(m).toMatchObject({ reds: 4, keep: false })
    m = reduceMia(m, { t: 'fail', stage: round, idx: 3 }).mia; expect(m).toMatchObject({ reds: 5, keep: true })
  })
  it('ничего не ответил на все слова — Пит остаётся внутри (все слова красные по событиям движка, шкала не нужна)', () => {
    let m = reduceMia(start().mia, { t: 'enter', stage: round }).mia
    for (let i = 0; i < 6; i++) m = reduceMia(m, { t: 'fail', stage: round, idx: i }).mia
    expect(m).toMatchObject({ reds: 6, keep: true })
  })
  it('эпилог boss-end: меньше пяти красных — Мия уходит (boss_mia_free, boss_pit_free); пять — остаётся, Пит внутри (boss_mia_keep, boss_pit_keep); на итоге коробка в обоих случаях убирается', () => {
    const base = reduceMia(start().mia, { t: 'enter', stage: round }).mia
    const free = reduceMia({ ...base, reds: 2, keep: false }, { t: 'enter', stage: end, now: 5000 })
    expect(free.mia.phase).toBe('out'); expect(ids(free)).toEqual(['boss_mia_free', 'boss_pit_free'])
    const kept = reduceMia({ ...base, reds: 5, keep: true }, { t: 'enter', stage: end, now: 5000 })
    expect(kept.mia).toMatchObject({ phase: 'in', fast: false }); expect(ids(kept)).toEqual(['boss_mia_keep', 'boss_pit_keep']); expect(kept.boost).toBe(1)
    expect(reduceMia(kept.mia, { t: 'enter', stage: summary, now: 9000 })).toMatchObject({ mia: { phase: 'off' }, say: [] })
  })
  it('Мия обращается к ученику на «вы»', () => {
    const t = Object.fromEntries(MIA_LINES.filter(l => l.who === 'mia').map(l => [l.id, l.text]))
    expect(t.boss_mia_look).toContain('вы за экраном'); expect(t.boss_mia_think).toContain('вы думаете'); expect(t.boss_mia_green).toContain('знаете'); expect(t.boss_mia_yellow).toContain('вспоминаете'); expect(t.boss_mia_red).toContain('не помните'); expect(t.mia_announce_3).toContain('вы ответите')
    expect(isMiaLine('boss_mia_look')).toBe(true); expect(isMiaLine('boss_pit_no')).toBe(false)
  })
  it('шкала: на слова о зонах зона мигает, шкалу видно с «видите шкалу справа»', () => {
    expect(flashOf({ id: 'boss_mia_yellow', key: 3, ms: 1500 })).toEqual({ zone: 'mid', key: 3, ms: 1500 }); expect(flashOf({ id: 'boss_mia_five', key: 1, ms: 1 })).toBeNull(); expect(flashOf(null)).toBeNull()
    expect(REVEAL_LINES).toContain('boss_mia_look'); expect(REVEAL_LINES).not.toContain('boss_mia_hush'); expect(REVEAL_LINES).not.toContain('boss_pit_1')
  })
  it('Мия прыгает позже у финала: arrivalAt(t, jump) — до jump коробка неподвижна, прыжок с jump', () => {
    expect(arrivalAt(BOSS.JUMP - 0.1, BOSS.JUMP).mia.mode).toBe('off'); expect(arrivalAt(BOSS.JUMP + 0.1, BOSS.JUMP).mia.mode).toBe('flight'); expect(arrivalAt(ARR.JUMP + 0.1).mia.mode).toBe('flight')
  })
})

describe('объяснение шкалы не обрывается уроком', () => {
  const ann = { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true, script: 'boss' }
  it('пока пример не дошёл до низа, три ноты и круг ждут (между репликами очередь речи пуста — реплики о зонах ставит пилюля); последние реплики поставлены — ждут только очередь', () => {
    const mb = makeMiaBox(); markMiaEntered(mb, '5:1000')
    expect(bossExplaining(mb, ann)).toBe(true); expect(bossExplaining(mb, { ...ann, script: undefined })).toBe(false); expect(bossExplaining(mb, { type: 'student', act: 'boss', mia: 'round' })).toBe(false); expect(bossExplaining(mb, null)).toBe(false)
    markDemoDone(mb); expect(bossExplaining(mb, ann)).toBe(false)
  })
  it('новая стадия сбрасывает отметку «объяснение кончилось»; повторный вход в ту же стадию — нет', () => {
    const mb = makeMiaBox(); markMiaEntered(mb, '5:1000'); markDemoDone(mb)
    expect(markMiaEntered(mb, '5:1000')).toBe(false); expect(mb.demoDone).toBe(true)
    expect(markMiaEntered(mb, '5:2000')).toBe(true); expect(mb.demoDone).toBe(false)
  })
  it('директор: три ноты ждут и объяснение (countWait), запуск «end» помечает его законченным; страховка стадии 70 с', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain('countWait: () => (mspeech.pending() > 0 || bossExplaining(mb, running) ? 1 : 0)'); expect(src).toContain("if (kind === 'end') markDemoDone(mb)")
    expect(readFileSync(new URL('./raceStagesBoss.js', import.meta.url), 'utf8')).toContain('BOSS_WAIT_CAP_MS = 70000')
  })
})
