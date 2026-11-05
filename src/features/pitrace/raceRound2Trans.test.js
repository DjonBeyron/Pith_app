import { describe, it, expect } from 'vitest'
import { buildRaceStages } from './raceStages.js'
import { sprintTarget } from './raceSprint2.js'
import { transKey } from './raceTrans.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Второй круг «Разгона» и «Слушай и лови»: перевод, который Пит говорит перед выездом (событие 'pre', useRaceActs.pre берёт rep.cap), и перевод на самой пилюле — ОДНА запись повтора { word, translation, lane, speed }.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })

/** Гоняет движок ступени: каждая пилюля либо принимается (claim), либо уезжает; возвращает события 'pre' и 'spawn' по порядку */
function drive(stage, { ownOf }) {
  const g = createStudentGame({ step: stage.step, chunks: stage.step.chunks, estMs: () => 400, maxTries: stage.step.maxTries })
  const pre = [], spawn = []
  let t = 0, guard = 0
  while (!g.finished && guard++ < 20000) {
    const live = g.reps.find(r => r.state === 'fly')
    const seq = live && live.pills.every(p => p.y >= 5) && ownOf(live) ? [live.target] : []
    for (const e of stepStudent(g, (t += 16), { seq, confirmed: true, hold: false })) {
      if (e.type === 'pre') pre.push(e.rep)
      if (e.type === 'spawn') spawn.push(e.rep)
    }
  }
  return { pre, spawn }
}

for (const act of ['sprint', 'catch']) {
  describe(`второй круг «${act}»: перевод повтора из той же записи, что и пилюля`, () => {
    const mk = () => {
      const { stages } = buildRaceStages({ plan })
      const first = stages.find(s => s.sid === act), second = stages.find(s => s.sid === `${act}2`)
      const results = Object.fromEntries(first.words.map((_, i) => [i, { hit: i % 2 === 0, miss: false }])) // нечётные не дались
      sprintTarget(stages, first, { results }, plan.seed)
      return { first, second }
    }
    it('rep.cap каждого повтора = перевод его слова (word.shown у ловушек «Слушай и лови»); pre и spawn идут по порядку второго круга', () => {
      const { first, second } = mk()
      expect(second.words.length).toBeGreaterThan(0)
      const want = w => (act === 'catch' ? w.shown : w.translation)
      second.words.forEach((w, i) => { expect(second.step.reps[i].cap).toBe(want(w)); expect(second.step.chunks[i]).toBe(w.text) })
      const { pre, spawn } = drive(second, { ownOf: r => !r.trap })
      expect(spawn.map(r => r.idx)).toEqual(second.words.map((_, i) => i)) // все выехали по порядку
      expect(pre.map(r => r.idx)).toEqual(spawn.map(r => r.idx)) // голос и пилюля — один и тот же повтор
      pre.forEach(r => { expect(r.cap).toBe(want(second.words[r.idx])); expect(r.text).toBe(second.words[r.idx].text) })
      spawn.forEach(r => expect(r.cap).toBe(want(second.words[r.idx])))
      if (act === 'sprint') pre.forEach(r => expect(transKey(r.cap)).toBe(transKey(first.words.find(w => w.text === r.text).translation))) // перевод слова — тот же, что в первом круге
    })
    it('круг пересобирается при повторном вызове (директор зовёт nextIdx много раз): последняя сборка — единая, без хвостов прежних слов', () => {
      const { stages } = buildRaceStages({ plan })
      const first = stages.find(s => s.sid === act), second = stages.find(s => s.sid === `${act}2`)
      const all = Object.fromEntries(first.words.map((_, i) => [i, { hit: false, miss: false }]))
      sprintTarget(stages, first, { results: all }, plan.seed)
      const n = second.words.length
      const one = { ...Object.fromEntries(first.words.map((_, i) => [i, { hit: true }])), 2: { hit: false, miss: true } }
      sprintTarget(stages, first, { results: one }, plan.seed)
      expect(second.words.length).toBeLessThan(n)
      expect(second.step.reps).toHaveLength(second.words.length); expect(second.step.chunks).toEqual(second.words.map(w => w.text)); expect(second.step.chunkMs).toHaveLength(second.words.length)
      second.step.reps.forEach((r, i) => { expect(r.parts).toEqual([i]); expect(r.speed).toBe(second.words[i].speed); expect(r.lane).toBe(second.words[i].lane) })
    })
  })
}
