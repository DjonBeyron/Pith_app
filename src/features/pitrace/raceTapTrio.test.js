import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decoysOf, trioStep, trioFor, transPool, TRIO_SHIFT, TRIO_ACTS, shiftMs } from './raceTapTrio.js'
import { buildRaceStages } from './raceStages.js'
import { createStudentGame } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

// Режим «Тапаю»: три пилюли на слово (CONCEPT_RACE.md, «Режим тапа»). Голос — одна пилюля, как раньше.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } })()
const stages = buildRaceStages({ plan }).stages
const sprint = stages.find(s => s.sid === 'sprint' && s.type === 'student'), catchSt = stages.find(s => s.sid === 'catch' && s.type === 'student')
const ctx = st => ({ seed: plan.seed, words: st.words, pool: transPool(plan) })

describe('режим тапа включает тройку только в «Разгоне» и «Слушай и лови»', () => {
  it('trioFor: тап и ступень ученика этих актов — да; голос, другие акты, плашки — нет', () => {
    expect(TRIO_ACTS).toEqual(['sprint', 'catch'])
    expect(trioFor({ tap: true, stage: sprint })).toBe(true); expect(trioFor({ tap: true, stage: catchSt })).toBe(true)
    expect(trioFor({ tap: false, stage: sprint })).toBe(false) // голосовой режим без изменений — одна пилюля
    expect(trioFor({ tap: true, stage: stages.find(s => s.act === 'climb' && s.type === 'student') })).toBe(false)
    expect(trioFor({ tap: true, stage: stages.find(s => s.type === 'announce') })).toBe(false); expect(trioFor({ tap: true, stage: null })).toBe(false)
  })
})

describe('чужие пилюли', () => {
  it('на каждое слово ровно две чужие: на двух других дорожках, подписи — чужие переводы, разные, не перевод слова', () => {
    for (const st of [sprint, catchSt]) {
      const t = trioStep(st.step, ctx(st))
      st.step.reps.forEach((r, i) => {
        const d = t.decoys(i), right = st.words[i].translation.toLowerCase()
        expect(d.length).toBe(2); expect(d.map(x => x.lane).sort()).toEqual([0, 1, 2].filter(l => l !== r.lane))
        expect(new Set(d.map(x => x.cap.toLowerCase())).size).toBe(2); d.forEach(x => { expect(x.cap.toLowerCase()).not.toBe(right); expect(x.cap).not.toBe('…') })
      })
    }
  })
  it('сдвиг по высоте — по семени, не больше ±8 % экрана; воспроизводим, у разных слов и семян разный', () => {
    expect(TRIO_SHIFT).toBe(8)
    const all = sprint.words.flatMap((_, i) => decoysOf({ seed: plan.seed, sid: 'sprint', words: sprint.words, i, lane: sprint.step.reps[i].lane, pool: transPool(plan) }))
    all.forEach(d => expect(Math.abs(d.dy)).toBeLessThanOrEqual(8))
    expect(new Set(all.map(d => d.dy)).size).toBeGreaterThan(all.length / 2) // не ровная линейка
    const a = decoysOf({ seed: 'x', sid: 'sprint', words: sprint.words, i: 0, lane: 0 }), b = decoysOf({ seed: 'x', sid: 'sprint', words: sprint.words, i: 0, lane: 0 }), c = decoysOf({ seed: 'y', sid: 'sprint', words: sprint.words, i: 0, lane: 0 })
    expect(a).toEqual(b); expect(a).not.toEqual(c)
  })
  it('в круге из двух слов чужих не хватает — добор из запаса переводов плана; совсем нечем — «…»', () => {
    const two = sprint.words.slice(0, 2)
    const d = decoysOf({ seed: 's', sid: 'sprint', words: two, i: 0, lane: 0, pool: transPool(plan) }); expect(d.every(x => x.cap !== '…')).toBe(true)
    expect(decoysOf({ seed: 's', sid: 'sprint', words: two.slice(0, 1), i: 0, lane: 1, pool: [] }).every(x => x.cap === '…')).toBe(true)
  })
  it('сдвиг в миллисекундах: позже выкатывается тот, у кого dy < 0; скорость пилюли учитывается', () => {
    expect(shiftMs(8, 1, 26)).toBeCloseTo(307.7, 1); expect(shiftMs(-8, 1, 26)).toBeLessThan(0); expect(shiftMs(8, 2, 26)).toBeCloseTo(shiftMs(8, 1, 26) / 2, 6)
  })
})

describe('ступень для движка в тапе', () => {
  it('верная пилюля — обычный перевод слова; ловушка «Слушай и лови» снята (выбор и есть задание); остальные поля ступени целы', () => {
    const t = trioStep(catchSt.step, ctx(catchSt))
    t.step.reps.forEach((r, i) => { expect(r.cap).toBe(catchSt.words[i].translation); expect(r.trap).toBe(false); expect(r.say).toBe(catchSt.step.reps[i].say) })
    expect(catchSt.words.some(w => w.trap)).toBe(true) // в исходной ступени ловушки были, в тройке их нет
    expect(t.step.overlap).toBe(true); expect(t.step.maxTries).toBe(1); expect(catchSt.step.reps.some(r => r.trap)).toBe(true) // исходная ступень не мутирована
    expect(trioStep({ reps: [] }, ctx(sprint))).toBeNull(); expect(trioStep(sprint.step, { words: [] })).toBeNull()
  })
  it('движок принимает ступень тройки: верная пилюля одна на повтор, цель — слово повтора', () => {
    const t = trioStep(sprint.step, ctx(sprint)), g = createStudentGame({ step: t.step, chunks: sprint.step.chunks, maxTries: 1 })
    expect(g.reps.length).toBe(sprint.words.length); g.reps.forEach((r, i) => { expect(r.pills.length).toBe(0); expect(r.cap).toBe(sprint.words[i].translation); expect(r.trap).toBe(false) })
  })
})

describe('проводка', () => {
  const eng = read('../player/modules/rotate-phone/useWordLanePills.js'), game = read('../player/modules/rotate-phone/WordLaneGame.jsx')
  it('движок: тройка решается на старте ступени из trioRef; чужие выкатываются при spawn с той же скоростью; тап по чужой — дрожь и miss; в голосе (trio = null) ничего не меняется', () => {
    expect(eng).toContain('const tr = trioRef.current ? trioStep(scene.step, trioRef.current) : null'); expect(eng).toContain('if (tr) for (const d of tr.decoys(e.rep.idx))')
    expect(eng).toContain('speed: e.rep.speed, cap: d.cap'); expect(eng).toContain('trio: !tr ? undefined :'); expect(eng).toContain('missPill(pool.el(d.k)); if (rep && !d.hit) fxRef.current?.miss?.({ rep })')
    expect(eng).toContain('pool.give(decoys[j].k)') // чужая пилюля ушла вниз — вернулась в пул
  })
  it('игра: тап-режим гонки включает trio для ступени «Разгона» / «Слушай и лови», тап идёт через laneTap (чужая — ошибка, верная — обычный путь)', () => {
    expect(game).toContain('trioFor({ tap: tapMode, stage: f.stageObj })'); expect(game).toContain('trio={trio}'); expect(game).toContain('if (api?.trio && !api.trio(lane)) return; f.onLane(lane)')
    expect(read('../player/modules/rotate-phone/WordLanePills.jsx')).toContain('useWordLanePills(rootRef, { scene, levels, fx, live, sceneApi, trio })')
  })
  it('нет Math.random', () => { expect(read('./raceTapTrio.js')).not.toContain('Math.random') })
})
